"""
ml_app.py — Unified ML Inference Service for Hugging Face Spaces.

This is a standalone Flask server that owns ALL image-based AI workloads:
  • POST /predict?type=skin   → TensorFlow skin-condition classifier
  • POST /predict?type=product → EasyOCR text extraction with full preprocessing

Models are loaded once in a background thread at startup.
The Render backend calls this service over HTTP; it never loads ML libs itself.
"""

import os
import io
import re
import threading
import numpy as np
import cv2
import tensorflow as tf
import easyocr
from flask import Flask, request, jsonify, render_template_string
from PIL import Image

app = Flask(__name__)

# ── Global model caches ──────────────────────────────────────────────────────
_skin_model = None
_ocr_reader = None
_loading_status = "Not Started"


# ── Background model loader ──────────────────────────────────────────────────

def load_models_in_background():
    global _skin_model, _ocr_reader, _loading_status
    _loading_status = "Loading..."
    try:
        # 1. Skin model
        MODEL_PATH = os.path.join("models", "skin_model.h5")
        if os.path.exists(MODEL_PATH):
            print("[ML] Loading Skin Model…")
            try:
                _skin_model = tf.keras.models.load_model(
                    MODEL_PATH, compile=False
                )
            except TypeError:
                # TF 2.21+ adds quantization_config to Dense which older
                # .h5 files don't expect — load with safe_mode off
                _skin_model = tf.keras.models.load_model(
                    MODEL_PATH, compile=False, safe_mode=False
                )
            print("✅ [ML] Skin Model Ready")
        else:
            print("⚠️ [ML] Skin Model file not found – skin predictions will use mock")

        # 2. EasyOCR reader
        print("[ML] Initialising EasyOCR…")
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
        print("✅ [ML] EasyOCR Ready")

        _loading_status = "Ready"
    except Exception as e:
        print(f"❌ [ML] Loading Error: {e}")
        _loading_status = f"Error: {e}"


# Start loading on boot
threading.Thread(target=load_models_in_background, daemon=True).start()


# ── Image helpers (ported from ocr_utils.py) ──────────────────────────────────

def _ensure_smaller_res(img_bgr: np.ndarray, max_dim: int = 1000) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    if max(h, w) <= max_dim:
        return img_bgr
    scale = max_dim / max(h, w)
    return cv2.resize(img_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _decode_bgr(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img


def _preprocess_for_ocr(img_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.fastNlMeansDenoising(enhanced, h=7,
                                         templateWindowSize=7,
                                         searchWindowSize=15)
    h, w = denoised.shape[:2]
    return cv2.resize(denoised, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)


def _has_ingredient_header(text: str) -> bool:
    return bool(re.search(
        r'ingr?e?d?i?e?n?t?s?|active\s+ing',
        text, re.IGNORECASE,
    ))


def _run_ocr(img_array: np.ndarray, confidence_threshold: float) -> str:
    results = _ocr_reader.readtext(img_array)
    lines = [text.strip() for (_, text, prob) in results if prob >= confidence_threshold]
    return "\n".join(lines)


# ── Endpoints ─────────────────────────────────────────────────────────────────

_STATUS_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Skinbiee ML Service</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f0f1a;
         color:#e0e0e0;display:flex;align-items:center;justify-content:center;
         min-height:100vh}
    .card{background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;
          padding:48px;max-width:520px;width:90%%;text-align:center;
          box-shadow:0 20px 60px rgba(0,0,0,.4)}
    .emoji{font-size:64px;margin-bottom:16px}
    h1{font-size:1.8rem;margin-bottom:8px;
       background:linear-gradient(135deg,#f8a4d8,#a78bfa);-webkit-background-clip:text;
       -webkit-text-fill-color:transparent}
    .sub{color:#9ca3af;margin-bottom:28px;font-size:.95rem}
    .badge{display:inline-block;padding:6px 18px;border-radius:999px;font-size:.85rem;
           font-weight:600;margin-bottom:24px}
    .badge.ok{background:#064e3b;color:#6ee7b7}
    .badge.loading{background:#78350f;color:#fbbf24}
    .badge.error{background:#7f1d1d;color:#fca5a5}
    .info{text-align:left;background:rgba(255,255,255,.04);border-radius:12px;
          padding:18px 22px;margin-top:20px;font-size:.85rem;line-height:1.8}
    .info span{color:#9ca3af}
    .info strong{color:#c4b5fd}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">🧬</div>
    <h1>Skinbiee ML Service</h1>
    <p class="sub">Unified inference API for skin analysis &amp; product OCR</p>
    <div class="badge %(badge_class)s">%(badge_text)s</div>
    <div class="info">
      <span>TensorFlow:</span>  <strong>%(tf_ver)s</strong><br>
      <span>EasyOCR:</span>     <strong>%(ocr_ver)s</strong><br>
      <span>Endpoints:</span>   <strong>POST /predict?type=skin | product</strong><br>
      <span>Health:</span>      <strong>GET /health</strong>
    </div>
  </div>
</body>
</html>
"""

@app.route("/", methods=["GET"])
def index():
    if _loading_status == "Ready":
        bcls, btxt = "ok", "✅ Models Ready"
    elif _loading_status.startswith("Error"):
        bcls, btxt = "error", "❌ Load Error"
    else:
        bcls, btxt = "loading", "⏳ " + _loading_status
    html = _STATUS_PAGE % {
        "badge_class": bcls,
        "badge_text": btxt,
        "tf_ver": tf.__version__,
        "ocr_ver": easyocr.__version__,
    }
    return html


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "models": _loading_status,
        "tensorflow_version": tf.__version__,
        "easyocr_version": easyocr.__version__,
    })


@app.route("/predict", methods=["POST"])
def predict():
    if _loading_status != "Ready":
        return jsonify({"error": f"Models still loading ({_loading_status})"}), 503

    predict_type = request.args.get("type", "skin")

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    img_bytes = request.files["image"].read()

    try:
        # ── Skin analysis ─────────────────────────────────────────────────
        if predict_type == "skin":
            if _skin_model is None:
                # Mock fallback
                preds = [0.1, 0.05, 0.6, 0.05, 0.2]
            else:
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                p = np.expand_dims(
                    np.array(cv2.resize(np.array(img), (224, 224))) / 255.0, 0
                )
                preds = _skin_model.predict(p)[0].tolist()

            labels = ["Acne", "Dark Spots", "Oiliness", "Dryness", "Normal"]
            results = [
                {"concern": labels[i], "confidence": float(s), "severity": "Mild"}
                for i, s in enumerate(preds)
                if s > 0.4
            ]
            if not results:
                results = [{"concern": "Normal", "severity": "Mild", "confidence": 0.9}]

            return jsonify({"status": "success", "type": "skin", "results": results})

        # ── Product OCR (full two-pass pipeline) ──────────────────────────
        elif predict_type == "product":
            img_raw = _decode_bgr(img_bytes)
            img_bgr = _ensure_smaller_res(img_raw, max_dim=1000)
            confidence = 0.3

            # Pass 1: original
            raw_text_1 = _run_ocr(img_bgr, confidence)
            if _has_ingredient_header(raw_text_1):
                return jsonify({"status": "success", "type": "product",
                                "raw_text": raw_text_1})

            # Pass 2: preprocessed
            preprocessed = _preprocess_for_ocr(img_bgr)
            raw_text_2 = _run_ocr(preprocessed, confidence)
            if _has_ingredient_header(raw_text_2):
                return jsonify({"status": "success", "type": "product",
                                "raw_text": raw_text_2})

            # Neither found header — return combined
            combined = raw_text_1 + "\n" + raw_text_2
            return jsonify({"status": "success", "type": "product",
                            "raw_text": combined})

        else:
            return jsonify({"error": f"Unknown type: {predict_type}"}), 400

    except Exception as e:
        print(f"[ML] Inference error: {e}")
        return jsonify({"error": f"Inference failed: {e}"}), 500


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port)
