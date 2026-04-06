from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import cv2, os, io, math
from datetime import datetime, date, timedelta
from PIL import Image
import cloudinary, cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()
from modules.product_scanner import analyze_custom_ingredients
from modules.llm_provider import analyze_ingredients_llm
from modules.history_db import (
    add_scan, add_daily_log, get_all_scans, get_daily_logs,
    get_user_by_username, get_user_skin_condition,
)
from modules.auth import login_user, register_user
import modules.ocr_utils as ocr_utils

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

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


MODEL_PATH = os.path.join('models', 'skin_model.h5')
class MockModel:
    def predict(self, p): return [np.array([0.1, 0.05, 0.6, 0.05, 0.2])]
try:
    if os.path.exists(MODEL_PATH): model = tf.keras.models.load_model(MODEL_PATH); print("✅ Model Loaded")
    else: model = MockModel(); print("⚠️ Mock Model")
except: model = MockModel(); print("⚠️ Mock Fallback")

# EasyOCR reader is now owned by modules/ocr_utils.py (_get_reader()).
# No global reader is initialised here.


# ── Helper: raw ingredient section text (for debug mode) ─────────────────────

def _get_raw_ingredient_section(raw_text: str) -> str:
    """
    Return the raw (un-split) text between the ingredient header and the first
    stop-keyword.  Used only for the ?debug=true response field.
    Returns an empty string when the header is not found.
    """
    import re
    if not raw_text:
        return ""
    # Fuzzy header — same logic as ocr_utils.extract_ingredient_section
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


# ── Helper: per-ingredient breakdown (Step 5) ─────────────────────────────────

# Static category & reason hints used when LLM response doesn't go per-ingredient.
_INGREDIENT_CATEGORIES: dict[str, tuple[str, str]] = {
    # (category, short reason template)
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

# Condition-specific overrides for rating
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
    """
    Return a list of per-ingredient dicts:
      { name, category, rating ('good'|'bad'|'neutral'), reason }

    Priority:
      1. Condition-specific good/bad lists (_GOOD_FOR / _BAD_FOR).
      2. LLM/rule-based analysis's good_ingredients / bad_ingredients lists.
      3. Static _INGREDIENT_CATEGORIES lookup for category + base reason.
      4. Default to 'neutral' / 'general ingredient'.
    """
    # Flatten LLM output lists to lowercase strings for fast lookup
    llm_good = {
        (g if isinstance(g, str) else g.get('name', '')).lower()
        for g in analysis.get('good_ingredients', [])
    }
    llm_bad = {
        (b if isinstance(b, str) else b.get('name', '')).lower()
        for b in analysis.get('bad_ingredients', [])
    }

    cond_good = {g.lower() for g in _GOOD_FOR.get(skin_condition, [])}
    cond_bad  = {b.lower() for b in _BAD_FOR.get(skin_condition, [])}

    breakdown: list[dict] = []
    for name in ingredients:
        key = name.lower().strip()

        # Look up static hints
        # Try progressively shorter sub-strings to catch "Niacinamide 10%", etc.
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

        # Determine rating
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


@app.route('/')
def home():
    return send_from_directory('frontend', 'skinbiee.html')

@app.route('/<path:path>')
def serve_static(path):
    response = send_from_directory('frontend', path)
    
    # Explicitly set MIME types for common web formats to prevent 404/Block issues
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
    # Completely remove X-Frame-Options to allow modern browsers to default to CSP
    if 'X-Frame-Options' in response.headers:
        del response.headers['X-Frame-Options']
    
    # Relaxed Access Control
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    
    # Modern frame-ancestors to allow Hugging Face iframe
    # Also added 'sandbox' permissions for good measure
    response.headers['Content-Security-Policy'] = "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *;"
    
    return response

@app.route('/health')
def health():
    return jsonify({"status": "ok"}), 200


@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if register_user(username, password):
        user = get_user_by_username(username)
        if not user:
            return jsonify({"error": "Registration failed"}), 500
        return jsonify({"status": "success", "user_id": user['id'], "username": user['username']})
    return jsonify({"error": "Username already taken"}), 409


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = login_user(username, password)
    if user:
        return jsonify({"status": "success", "user_id": user['id'], "username": user['username']})
    return jsonify({"error": "Invalid username or password"}), 401


@app.route('/api/analyze-skin', methods=['POST'])
def analyze_skin():
    f = request.files.get('image')
    uid = parse_user_id(request.form.get('user_id'))
    if uid is None:
        return jsonify({"error": "Valid user_id required"}), 400
    if not f: return jsonify({"error":"No image"}), 400
    b = f.read()
    url = upload_img(b, "skinbiee/face_scans")
    if not url:
        return jsonify({"error": "Image upload failed. Configure Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)."}), 503
    img = Image.open(io.BytesIO(b)).convert('RGB')
    p = np.expand_dims(np.array(cv2.resize(np.array(img),(224,224)))/255.0, 0)
    preds = model.predict(p)[0]; labels = ["Acne","Dark Spots","Oiliness","Dryness","Normal"]
    res = [{"concern":labels[i],"confidence":float(s),"severity":"Mild"} for i,s in enumerate(preds) if s > 0.4]
    if not res: res = [{"concern":"Normal","severity":"Mild","confidence":0.9}]
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        add_scan(uid, ts, res[0]['concern'], res[0]['confidence'], res[0]['severity'], image_path=url)
    except Exception as e:
        return jsonify({"error": f"Failed to save scan: {e}"}), 500
    return jsonify({"status":"success","results":res,"image_url": url})

@app.route('/api/analyze-product', methods=['POST'])
def analyze_prod():
    """
    POST /api/analyze-product
    Form-data: image (file), user_id (int)
    Query param: debug=true  → include ocr_raw / ocr_ingredients_raw in response

    Returns:
      200  { status, ingredients_detected (list[str]), ingredient_breakdown (list),
             analysis { score, recommendation, good_ingredients, bad_ingredients },
             skin_condition, image_url }
      400  { error }  — image upload failed / ingredient section not found / < 3 ingredients
      503  { error }  — Cloudinary not configured
    """
    # ── 0. Parse inputs ──────────────────────────────────────────────────────
    f   = request.files.get('image')
    uid = parse_user_id(request.form.get('user_id'))
    debug_mode = request.args.get('debug', '').lower() == 'true'

    if uid is None:
        return jsonify({"error": "Valid user_id required"}), 400
    if not f:
        return jsonify({"error": "No image"}), 400

    b = f.read()

    # ── 1. Upload image to Cloudinary ────────────────────────────────────────
    url = upload_img(b, "skinbiee/product_scans")
    if not url:
        return jsonify({"error": "Image upload failed. Configure Cloudinary."}), 503

    # ── 2. Run OCR (pre-processed) → raw text (Step 3) ──────────────────────
    ocr_raw = ocr_utils.extract_ingredients_from_image(b, confidence_threshold=0.3)

    # ── 3. Parse ingredient section from raw OCR text (Step 1) ──────────────
    ingredients_list = ocr_utils.extract_ingredient_section(ocr_raw)

    # Capture the raw ingredient section text before splitting (for debug)
    # Re-derive it so we can expose it without re-running OCR.
    ocr_ingredients_raw_text = _get_raw_ingredient_section(ocr_raw)

    # ── 4. Failure handling — ingredient section not found (Step 6) ──────────
    if len(ingredients_list) < 1:
        with open("SCANNER.log", "a") as f:
            f.write(f"FAILED! Found 0 ingredients.\\n")
            f.write(f"\\n--- OCR RAW START ---\\n{ocr_raw}\\n--- OCR RAW END ---\\n")
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

    with open("SCANNER.log", "a") as f: f.write(f"OCR PASS! Found {len(ingredients_list)} ingredients! Proceeding to LLM.\\n")
    # Unified ingredient string used by both LLM and rule-based analysers
    ingredients_text = ", ".join(ingredients_list)

    # ── 5. Fetch user's skin condition from DB (Step 4) ──────────────────────
    try:
        skin_condition = get_user_skin_condition(uid)
    except Exception as e:
        print(f"[analyze_prod] Could not fetch skin condition: {e}")
        skin_condition = "general"

    # ── 6. Analyse ingredients (LLM → rule-based fallback) ──────────────────
    llm_an = analyze_ingredients_llm(ingredients_text, skin_condition)
    if llm_an:
        an = llm_an
    else:
        an = analyze_custom_ingredients(ingredients_text, skin_condition)

    # ── 7. Build per-ingredient breakdown (Step 5) ───────────────────────────
    ingredient_breakdown = _build_ingredient_breakdown(
        ingredients_list, an, skin_condition
    )

    # ── 8. Persist scan record ───────────────────────────────────────────────
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        add_scan(uid, ts, "Product Scan", 1.0, an.get('recommendation', 'Info'), image_path=url)
    except Exception as e:
        return jsonify({"error": f"Failed to save scan: {e}"}), 500

    # ── 9. Build response ────────────────────────────────────────────────────
    resp = {
        "status":               "success",
        "skin_condition":       skin_condition,
        "ingredients_detected": ingredients_list,
        "ingredient_breakdown": ingredient_breakdown,
        # Top-level 'analysis' kept for frontend backwards compatibility
        "analysis":             an,
        "image_url":            url,
    }

    # Step 7 — optional debug fields
    if debug_mode:
        resp["ocr_raw"]              = ocr_raw
        resp["ocr_ingredients_raw"]  = ocr_ingredients_raw_text

    with open("SCANNER.log", "a") as f: f.write(f"SUCCESS! Found {len(ingredients_list)} ingredients.\\n")
    return jsonify(resp)

@app.route('/api/daily-log', methods=['POST'])
def save_log():
    try:
        uid = parse_user_id(request.form.get('user_id'))
        if uid is None:
            return jsonify({"error": "Valid user_id required"}), 400
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
        return jsonify({"status":"success","message":"Saved"}), 200
    except Exception as e: return jsonify({"error":str(e)}), 500

@app.route('/api/user/data', methods=['GET'])
def get_data():
    u = parse_user_id(request.args.get('user_id'))
    if u is None:
        return jsonify({"error": "Valid user_id required"}), 400
    try:
        scans_df = get_all_scans(u)
        logs_df = get_daily_logs(u)
        s = df_records_for_json(scans_df)
        l = df_records_for_json(logs_df)
        active_dates, streak = compute_streak_and_active_dates(l)
        return jsonify({
            "status": "success",
            "scans": s,
            "logs": l,
            "streak": streak,
            "active_dates": sorted(active_dates),
        })
    except Exception as e: return jsonify({"error":str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 7860))
    try:
        from waitress import serve
        print(f"🚀 AI Server started on {port}")
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
