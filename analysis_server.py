"""
analysis_server.py — Skinbiee Backend Orchestrator (Render API).

Responsibilities:
  • Auth (register / login)
  • Cloudinary image upload
  • History DB (scans + daily logs)
  • Ingredient analysis (LLM → rule-based fallback)
  • Forwards ML image inference to the Hugging Face ML service (ML_INFERENCE_URL)

This server contains ZERO TensorFlow / EasyOCR code.
"""

from flask import Flask, request, jsonify, send_from_directory, Response, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import numpy as np
import os, io, math, requests as http_requests, traceback
from datetime import datetime, date, timedelta
from PIL import Image
import cloudinary, cloudinary.uploader
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

load_dotenv()
from modules.product_scanner import analyze_custom_ingredients
from modules.llm_provider import analyze_ingredients_llm
from modules.history_db import (
    add_scan, add_daily_log, get_all_scans, get_daily_logs,
    get_user_by_username, get_user_skin_condition,
)
from modules.auth import login_user, register_user, create_token, verify_token

# ── ML Inference bridge ──────────────────────────────────────────────────────
ML_INFERENCE_URL = os.getenv(
    "ML_INFERENCE_URL",
    "https://vaishnaviiee-skinbiee.hf.space"   # default to users HF space
)

# Force absolute base directory for static serving
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'frontend'))
print(f"[DEBUG] App directory: {os.path.abspath(os.path.dirname(__file__))}")
print(f"[DEBUG] Frontend directory: {FRONTEND_DIR}")
if os.path.exists(FRONTEND_DIR):
    print(f"[DEBUG] Frontend folder contents: {os.listdir(FRONTEND_DIR)}")
else:
    print(f"[DEBUG] WARNING: Frontend folder NOT FOUND at {FRONTEND_DIR}")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],               # no global limit; applied per-route
    storage_uri="memory://",
)

# ── Error Handlers ────────────────────────────────────────────────────────────

@app.errorhandler(Exception)
def handle_exception(e):
    """Ensure all exceptions return a JSON response instead of HTML."""
    if isinstance(e, HTTPException):
        return jsonify({
            "error": e.name,
            "message": e.description,
            "status": "error"
        }), e.code

    tb = traceback.format_exc()
    print(f"!!! CRITICAL SERVER ERROR: {str(e)}\n{tb}")
    return jsonify({
        "error": "Internal Server Error",
        "message": str(e),
        "status": "error"
    }), 500

# ── JWT auth helper ───────────────────────────────────────────────────────────

def get_current_user():
    """Read the token from Authorization header or HTTP-only cookie."""
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        # Fallback to secure cookie for persistent login
        token = request.cookies.get("access_token")
    
    if not token:
        return None
    return verify_token(token)

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)


def _cloudinary_configured():
    return all([
        os.getenv("CLOUDINARY_CLOUD_NAME"),
        os.getenv("CLOUDINARY_API_KEY"),
        os.getenv("CLOUDINARY_API_SECRET"),
    ])


def upload_img(image_bytes, folder):
    if not _cloudinary_configured():
        print("[Cloudinary] Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET")
        return None
    try:
        r = cloudinary.uploader.upload(image_bytes, folder=folder, resource_type="image")
        return r.get("secure_url")
    except Exception as e:
        print(f"[Cloudinary] Upload failed: {e}")
        return None


def parse_user_id(raw):
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _json_scalar(val):
    """Convert pandas/numpy/NaT values to JSON-serializable Python types."""
    if val is None:
        return None
    try:
        import pandas as pd
        if pd.api.types.is_scalar(val) and pd.isna(val):
            return None
    except Exception:
        pass
    if isinstance(val, np.generic):
        try:
            return _json_scalar(val.item())
        except Exception:
            return str(val)
    if isinstance(val, bool):
        return val
    if isinstance(val, int):
        return int(val)
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    if isinstance(val, str):
        return val
    if hasattr(val, "isoformat"):
        try:
            return val.isoformat()
        except Exception:
            pass
    return val


def df_records_for_json(df):
    """Avoid jsonify failures on numpy.int64 / Timestamp from pandas."""
    rows = df.to_dict("records")
    out = []
    for row in rows:
        out.append({k: _json_scalar(v) for k, v in row.items()})
    return out


def _log_date_key(row):
    d = row.get("date")
    if d is None:
        return ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")[:10]
    s = str(d)
    return s[:10] if len(s) >= 10 else ""


def log_row_done(row):
    def done(v):
        if v is None:
            return False
        try:
            return int(v) != 0
        except (TypeError, ValueError):
            return bool(v)

    return done(row.get("am_done")) or done(row.get("pm_done"))


def compute_streak_and_active_dates(log_records):
    active_dates = set()
    for row in log_records:
        d = _log_date_key(row)
        if len(d) < 10:
            continue
        if log_row_done(row):
            active_dates.add(d)
    today = date.today()
    best = 0
    for start_offset in (0, 1):
        anchor = today - timedelta(days=start_offset)
        n = 0
        d = anchor
        while d.isoformat() in active_dates:
            n += 1
            d -= timedelta(days=1)
        best = max(best, n)
    return active_dates, best


# ── ML Inference bridge helper ────────────────────────────────────────────────

def _call_ml_service(image_bytes: bytes, predict_type: str) -> dict | None:
    """
    Forward an image to the Hugging Face ML service.
    Returns the parsed JSON response or None on failure.
    """
    url = f"{ML_INFERENCE_URL.rstrip('/')}/predict?type={predict_type}"
    print(f"[ML Bridge] POST → {url}")
    try:
        resp = http_requests.post(
            url,
            files={"image": ("image.jpg", io.BytesIO(image_bytes), "image/jpeg")},
            timeout=120,
        )
        print(f"[ML Bridge] Response: {resp.status_code}")
        if resp.status_code == 503:
            print(f"[ML Bridge] Service not ready: {resp.text}")
            return None
        
        if not resp.text.strip():
            print("[ML Bridge] EMPTY RESPONSE from ML service")
            return None

        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[ML Bridge] Error calling ML service: {e}")
        return None


# ── Ingredient parsing (moved from ocr_utils, kept here for product analysis) ─

import re

_HEADER_PATTERN = re.compile(
    r'\b(?:active\s+)?[il]ng(?:r(?:e(?:d(?:i(?:e(?:n(?:ts?)?)?)?)?)?)?)?\s*[:\-\.]?',
    re.IGNORECASE
)
_HEADER_FALLBACK = re.compile(r'\b(?:active\s+)?ingredients?\b', re.IGNORECASE)

_STOP_KEYWORDS = [
    "Mktd.", "Marketed", "Manufactured", "Mfd.", "Mfg",
    "Directions", "Note:", "Caution", "How to use",
    "Use before", "For query", "Not to be",
    "With activated", "formula that", "For all skin",
    "MASSAGE", "directions", "how to use", "apply", "massage",
    "Net Weight", "Batch", "Storage", "Expiry", "MRP",
    "HSR", "Bengaluru", "Plot No", "Parwanoo", "Sector",
    "S-COS", "byaddress", "wecare",
]
_STOP_PATTERN = re.compile(
    "|".join(re.escape(kw) for kw in _STOP_KEYWORDS),
    re.IGNORECASE,
)


def extract_ingredient_section(raw_text: str) -> list[str]:
    """Parse ingredient names from raw OCR text."""
    if not raw_text:
        return []

    match = _HEADER_PATTERN.search(raw_text)
    if not match:
        match = _HEADER_FALLBACK.search(raw_text)
    if not match:
        after_header = raw_text
    else:
        after_header = raw_text[match.end():]
        stop_match = _STOP_PATTERN.search(after_header)
        if stop_match:
            after_header = after_header[:stop_match.start()]

    raw_tokens = re.split(r',|\band\b|\||\n', after_header, flags=re.IGNORECASE)

    JUNK_KEYWORDS = [
        "apply", "massage", "rinse", "use", "directions", "formula",
        "removes", "pollution", "glowing", "all skin", "face", "neck",
        "detox", "bright", "miracle", "ponds", "warning", "contact", "eyes"
    ]

    ingredients: list[str] = []
    for token in raw_tokens:
        cleaned = token.strip().strip('.')
        cleaned = re.sub(r'\s+', ' ', cleaned)
        cleaned = re.sub(r'[^\w\s\-\.%,/]', '', cleaned)
        cleaned = re.sub(r'[()_]', '', cleaned)
        lower_cleaned = cleaned.lower()
        if len(cleaned) < 3 or len(cleaned) > 40:
            continue
        if any(kw in lower_cleaned for kw in JUNK_KEYWORDS):
            continue
        if cleaned.isupper() and len(cleaned) > 20:
            continue
        ingredients.append(cleaned)

    return ingredients


def _get_raw_ingredient_section(raw_text: str) -> str:
    if not raw_text:
        return ""
    match = re.search(
        r'\b(?:active\s+)?[il]ng(?:r(?:e(?:d(?:i(?:e(?:n(?:ts?)?)?)?)?)?)?)?\s*[:\-\.]?',
        raw_text, re.IGNORECASE
    )
    if not match:
        match = re.search(r'\b(?:active\s+)?ingredients?\b', raw_text, re.IGNORECASE)
    if not match:
        after = raw_text
    else:
        after = raw_text[match.end():]
    stop = re.search(
        r'Mktd\.|Marketed|Manufactured|Mfd\.|Directions|Note:|'
        r'Net Weight|Batch|Use before|For query|Not to be|Caution|MRP',
        after, re.IGNORECASE
    )
    return after[:stop.start()].strip() if stop else after.strip()


# ── Per-ingredient breakdown (unchanged business logic) ──────────────────────

_INGREDIENT_CATEGORIES: dict[str, tuple[str, str]] = {
    "aqua":               ("solvent",     "Water is the universal solvent base."),
    "water":              ("solvent",     "Water is the universal solvent base."),
    "glycerin":           ("humectant",   "Draws moisture into the skin."),
    "glycerine":          ("humectant",   "Draws moisture into the skin."),
    "niacinamide":        ("brightener",  "Reduces dark spots and regulates sebum."),
    "hyaluronic acid":    ("humectant",   "Holds up to 1000× its weight in water."),
    "salicylic acid":     ("exfoliant",   "BHA that unclogs pores; beneficial for acne."),
    "benzoyl peroxide":   ("antibacterial","Kills acne-causing bacteria."),
    "retinol":            ("retinoid",    "Speeds cell turnover; can irritate sensitive skin."),
    "vitamin c":          ("antioxidant", "Brightens and protects against oxidative stress."),
    "ascorbic acid":      ("antioxidant", "Brightens and protects against oxidative stress."),
    "zinc oxide":         ("UV filter",   "Physical SPF blocker; soothing for acne skin."),
    "titanium dioxide":   ("UV filter",   "Physical SPF blocker; gentle on skin."),
    "dimethicone":        ("emollient",   "Silicone that smooths and protects the barrier."),
    "cetyl alcohol":      ("emollient",   "Fatty alcohol that conditions without clogging pores."),
    "stearic acid":       ("emulsifier",  "Helps oil and water blend in formulations."),
    "fragrance":          ("fragrance",   "Can irritate sensitive or acne-prone skin."),
    "parfum":             ("fragrance",   "Can irritate sensitive or acne-prone skin."),
    "alcohol":            ("solvent",     "Denatured alcohol can dry or irritate the skin."),
    "alcohol denat.":     ("solvent",     "Denatured alcohol can dry or irritate the skin."),
    "phenoxyethanol":     ("preservative","Common preservative; generally well tolerated."),
    "parabens":           ("preservative","Keeps products shelf-stable; controversial in high doses."),
    "methylparaben":      ("preservative","Keeps products shelf-stable."),
    "propylparaben":      ("preservative","Keeps products shelf-stable."),
    "sodium lauryl sulfate":   ("surfactant", "Strong cleanser; can strip the skin barrier."),
    "sodium laureth sulfate":  ("surfactant", "Milder cleanser than SLS; still watch for sensitivity."),
    "polyethylene glycol":     ("humectant",  "Draws moisture but may penetrate damaged skin."),
    "ceramide":                ("emollient",  "Restores and maintains the skin barrier."),
    "allantoin":               ("soothing",   "Calms redness and accelerates skin healing."),
    "centella asiatica":       ("soothing",   "Repairing botanical extract; great for acne skin."),
    "tea tree":                ("antibacterial","Natural antimicrobial; can be irritating in high %"),
    "kojic acid":              ("brightener", "Inhibits melanin; helps fade dark spots."),
    "lactic acid":             ("exfoliant",  "Gentle AHA that smooths and hydrates."),
    "glycolic acid":           ("exfoliant",  "AHA that resurfaces; use with caution on sensitive skin."),
    "urea":                    ("humectant",  "Attracts moisture and gently exfoliates at higher %."),
}

_BAD_FOR: dict[str, list[str]] = {
    "acne":        ["fragrance", "parfum", "isopropyl myristate", "coconut oil",
                    "sodium lauryl sulfate", "alcohol denat."],
    "oily_skin":   ["mineral oil", "petrolatum", "cocoa butter", "shea butter"],
    "dry_skin":    ["alcohol denat.", "salicylic acid", "benzoyl peroxide", "glycolic acid"],
    "dark_spots":  [],
    "normal_skin": [],
    "general":     [],
}
_GOOD_FOR: dict[str, list[str]] = {
    "acne":        ["salicylic acid", "niacinamide", "benzoyl peroxide", "tea tree",
                    "zinc oxide", "centella asiatica", "allantoin"],
    "oily_skin":   ["niacinamide", "salicylic acid", "glycolic acid", "hyaluronic acid"],
    "dry_skin":    ["hyaluronic acid", "glycerin", "ceramide", "allantoin", "urea",
                    "squalane", "shea butter"],
    "dark_spots":  ["niacinamide", "vitamin c", "ascorbic acid", "kojic acid",
                    "lactic acid", "retinol"],
    "normal_skin": [],
    "general":     [],
}


def _build_ingredient_breakdown(
    ingredients: list[str],
    analysis: dict,
    skin_condition: str,
) -> list[dict]:
    if not analysis or not isinstance(analysis, dict):
        analysis = {}

    llm_good = {
        (g if isinstance(g, str) else g.get('name', '')).lower()
        for g in analysis.get('good_ingredients', [])
        if g is not None
    }
    llm_bad = {
        (b if isinstance(b, str) else b.get('name', '')).lower()
        for b in analysis.get('bad_ingredients', [])
        if b is not None
    }

    cond_good = {g.lower() for g in _GOOD_FOR.get(skin_condition, [])}
    cond_bad  = {b.lower() for b in _BAD_FOR.get(skin_condition, [])}

    breakdown: list[dict] = []
    for name in ingredients:
        key = name.lower().strip()

        meta = None
        for kw, val in _INGREDIENT_CATEGORIES.items():
            if kw in key:
                meta = val
                break
        category = meta[0] if meta else "general"
        base_reason = meta[1] if meta else "Commonly used formulation ingredient."

        disp_cond = skin_condition.replace('_', ' ')
        if not disp_cond.endswith('skin'):
            disp_cond += ' skin'

        if any(kw in key for kw in cond_bad) or any(kw in key for kw in llm_bad):
            rating = "bad"
            reason = f"May not suit {disp_cond}. {base_reason}"
        elif any(kw in key for kw in cond_good) or any(kw in key for kw in llm_good):
            rating = "good"
            reason = f"Beneficial for {disp_cond}. {base_reason}"
        else:
            rating = "neutral"
            reason = base_reason

        breakdown.append({
            "name":     name,
            "category": category,
            "rating":   rating,
            "reason":   reason,
        })

    return breakdown


# ── HTTP routes ───────────────────────────────────────────────────────────────

@app.route('/')
def home():
    return send_from_directory(FRONTEND_DIR, 'skinbiee.html')

@app.route('/<path:path>')
def serve_static(path):
    response = send_from_directory(FRONTEND_DIR, path)
    if path.endswith('.js'):
        response.headers['Content-Type'] = 'application/javascript'
    elif path.endswith('.css'):
        response.headers['Content-Type'] = 'text/css'
    elif path.endswith('.png'):
        response.headers['Content-Type'] = 'image/png'
    elif path.endswith('.jpg') or path.endswith('.jpeg'):
        response.headers['Content-Type'] = 'image/jpeg'
    return response

@app.route('/ping')
def ping():
    return "pong", 200

@app.after_request
def add_header(response):
    if 'X-Frame-Options' in response.headers:
        del response.headers['X-Frame-Options']
    
    # Secure CORS: Origins cannot be '*' when supports_credentials=True
    origin = request.headers.get("Origin")
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    response.headers['Content-Security-Policy'] = (
        "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval'; "
        "img-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *;"
    )
    return response

@app.route('/health')
def health():
    return jsonify({"status": "ok"}), 200


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
@limiter.limit("10 per minute")
def api_register():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long"}), 400
    if register_user(username, password):
        user = get_user_by_username(username)
        if not user:
            return jsonify({"error": "Registration failed"}), 500
        
        token = create_token(user['id'], user['username'])
        # Return success; token is also set in a secure cookie for persistence
        resp = make_response(jsonify({
            "status": "success", 
            "token": token, 
            "username": user['username']
        }))
        resp.set_cookie(
            "access_token", token,
            httponly=True, secure=True, samesite='Lax', max_age=7*24*60*60
        )
        return resp
    return jsonify({"error": "Username already taken"}), 409


@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("10 per minute")
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = login_user(username, password)
    if user:
        token = create_token(user['id'], user['username'])
        # Set token in secure HTTP-only cookie
        resp = make_response(jsonify({
            "status": "success", 
            "token": token, 
            "username": user['username']
        }))
        resp.set_cookie(
            "access_token", token,
            httponly=True, secure=True, samesite='Lax', max_age=7*24*60*60
        )
        return resp
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    resp = make_response(jsonify({"status": "success", "message": "Logged out"}))
    # Clear the persistent cookie
    resp.set_cookie("access_token", "", expires=0)
    return resp


# ── Skin scan route (forwards to HF ML service) ──────────────────────────────

@app.route('/api/analyze-skin', methods=['POST'])
def analyze_skin():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    uid = user["user_id"]
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No image"}), 400

    b = f.read()
    url = upload_img(b, "skinbiee/face_scans")
    if not url:
        return jsonify({"error": "Image upload failed. Configure Cloudinary."}), 503

    # Forward to ML service
    ml_resp = _call_ml_service(b, "skin")
    if ml_resp is None or ml_resp.get("status") != "success":
        err_msg = ml_resp.get("error", "ML service unreachable") if ml_resp else "ML service unreachable"
        return jsonify({"error": f"Skin analysis failed: {err_msg}"}), 503

    res = ml_resp.get("results", [])
    if not res:
        res = [{"concern": "Normal", "severity": "Mild", "confidence": 0.9}]

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        # res[0] is safe because we ensured it above
        add_scan(uid, ts, res[0]['concern'], res[0]['confidence'], res[0]['severity'], image_path=url)
    except Exception as e:
        return jsonify({"error": f"Failed to save scan: {e}"}), 500

    return jsonify({"status": "success", "results": res, "image_url": url})


# ── Product scan route (forwards OCR to HF, keeps analysis local) ────────────

@app.route('/api/analyze-product', methods=['POST'])
def analyze_prod():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    uid = user["user_id"]
    f   = request.files.get('image')
    debug_mode = request.args.get('debug', '').lower() == 'true'
    if not f:
        return jsonify({"error": "No image"}), 400

    b = f.read()

    # 1. Upload to Cloudinary
    url = upload_img(b, "skinbiee/product_scans")
    if not url:
        return jsonify({"error": "Image upload failed. Configure Cloudinary."}), 503

    # 2. Forward to HF ML service for OCR
    ml_resp = _call_ml_service(b, "product")
    if ml_resp is None or ml_resp.get("status") != "success":
        err_msg = ml_resp.get("error", "ML service unreachable") if ml_resp else "ML service unreachable"
        return jsonify({"error": f"OCR failed: {err_msg}"}), 503

    ocr_raw = ml_resp.get("raw_text", "")

    # 3. Parse ingredient section (local — no ML)
    ingredients_list = extract_ingredient_section(ocr_raw)
    ocr_ingredients_raw_text = _get_raw_ingredient_section(ocr_raw)

    # 4. Handle failure
    if len(ingredients_list) < 1:
        resp = {
            "error": (
                "We couldn't find the ingredient list in this photo. "
                "Please make sure the Ingredients section is visible, flat, and well lit."
            )
        }
        if debug_mode:
            resp["ocr_raw"] = ocr_raw
            resp["ocr_ingredients_raw"] = ocr_ingredients_raw_text
        return jsonify(resp), 400

    ingredients_text = ", ".join(ingredients_list)

    # 5. Fetch skin condition
    try:
        skin_condition = get_user_skin_condition(uid)
    except Exception as e:
        print(f"[analyze_prod] Could not fetch skin condition: {e}")
        skin_condition = "general"

    # 6. Analyse (LLM → rule-based fallback)
    llm_an = analyze_ingredients_llm(ingredients_text, skin_condition)
    an = llm_an if llm_an else analyze_custom_ingredients(ingredients_text, skin_condition)

    if not an:
        an = {
            "score": 5.0,
            "recommendation": "Analysis inconclusive",
            "safe": True
        }

    # 7. Per-ingredient breakdown
    ingredient_breakdown = _build_ingredient_breakdown(ingredients_list, an, skin_condition)

    # 8. Persist
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        add_scan(uid, ts, "Product Scan", 1.0, an.get('recommendation', 'Info'), image_path=url)
    except Exception as e:
        return jsonify({"error": f"Failed to save scan: {e}"}), 500

    # 9. Response
    resp = {
        "status":               "success",
        "skin_condition":       skin_condition,
        "ingredients_detected": ingredients_list,
        "ingredient_breakdown": ingredient_breakdown,
        "analysis":             an,
        "image_url":            url,
    }
    if debug_mode:
        resp["ocr_raw"]              = ocr_raw
        resp["ocr_ingredients_raw"]  = ocr_ingredients_raw_text

    return jsonify(resp)


# ── Daily log + user data routes ──────────────────────────────────────────────

@app.route('/api/daily-log', methods=['POST'])
def save_log():
    try:
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        uid = user["user_id"]
        d = request.form.get('date', datetime.now().strftime("%Y-%m-%d"))
        am = int(request.form.get('am_done', 0)); pm = int(request.form.get('pm_done', 0))
        f = request.form.get('skin_feeling', 'Good'); r = int(request.form.get('skin_rating', 5))
        n = request.form.get('notes', ''); img = request.files.get('image')
        photo_url = ""
        if img and img.filename:
            b = img.read()
            photo_url = upload_img(b, "skinbiee/progress_photos") or ""
            if not photo_url:
                return jsonify({"error": "Photo upload failed. Configure Cloudinary."}), 503
        try:
            add_daily_log(uid, d, am, pm, f, r, n, photo_path=photo_url)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({"status": "success", "message": "Saved"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/user/data', methods=['GET'])
def get_data():
    user_payload = get_current_user()
    if not user_payload:
        return jsonify({"error": "Authentication required"}), 401
    
    u_id = user_payload["user_id"]
    try:
        # Fetch user profile to get join date (created_at)
        user_record = get_user_by_username(user_payload["username"])
        join_date_raw = user_record.get("created_at") if user_record else None
        join_date = join_date_raw[:10] if join_date_raw else None # YYYY-MM-DD

        scans_df = get_all_scans(u_id)
        logs_df = get_daily_logs(u_id)
        s = df_records_for_json(scans_df)
        l = df_records_for_json(logs_df)
        
        active_dates, streak = compute_streak_and_active_dates(l)
        
        # Filter active dates to ensure they are on or after join date (sanity check)
        if join_date:
            active_dates = {d for d in active_dates if d >= join_date}

        return jsonify({
            "status": "success",
            "scans": s,
            "logs": l,
            "streak": streak,
            "active_dates": sorted(active_dates),
            "join_date": join_date
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    try:
        from waitress import serve
        print(f"🚀 AI Server started on {port}")
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
