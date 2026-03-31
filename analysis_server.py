from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import cv2
import os
import json
import io
from PIL import Image
import easyocr
from modules.product_scanner import analyze_custom_ingredients

app = Flask(__name__)
CORS(app)

# Load trained model
MODEL_PATH = os.path.join('models', 'skin_model.h5')
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Initialize OCR
reader = easyocr.Reader(['en'], gpu=False)

def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = np.array(img)
    img = cv2.resize(img, (224, 224)) # Assuming 224x224 input
    img = img / 255.0
    img = np.expand_dims(img, axis=0)
    return img

@app.route('/')
def health():
    return "Analysis Server is running! ✨"

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint for deployment platforms (Railway, Render, etc.)"""
    return jsonify({"status": "healthy", "service": "Skinbiee AI API"}), 200

@app.route('/api/analyze-skin', methods=['POST'])
def analyze_skin_endpoint():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files['image']
    img_bytes = file.read()
    print(f"DEBUG: Received skin analysis request. Image size: {len(img_bytes)} bytes")
    
    if not model:
        print("DEBUG: Model not loaded, returning error.")
        return jsonify({"error": "Model not loaded"}), 500
    
    # Run Inference
    print("DEBUG: Preprocessing image...")
    processed = preprocess_image(img_bytes)
    print("DEBUG: Running model prediction...")
    preds = model.predict(processed)[0]
    print(f"DEBUG: RAW Predictions: {preds}")
    
    # Map predictions to labels
    labels = ["Acne", "Dark Spots", "Oiliness", "Dryness", "Normal"]
    results = []
    
    for i, score in enumerate(preds):
        if score > 0.4: # Confidence threshold
            results.append({
                "concern": labels[i],
                "confidence": float(score),
                "severity": "Moderate" if score > 0.7 else "Mild"
            })
        # Handle generic normal case
    if not results:
        results.append({"concern": "Normal", "severity": "Mild", "confidence": 0.90})

    print(f"DEBUG: Final results: {results}")
    return jsonify({
        "status": "success",
        "results": results
    })

@app.route('/api/analyze-product', methods=['POST'])
def analyze_product():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files['image']
    img_bytes = file.read()
    print(f"DEBUG: Received product scan request. Image size: {len(img_bytes)} bytes")
    
    # Run OCR
    try:
        print("DEBUG: Running EasyOCR on image...")
        results = reader.readtext(img_bytes)
        extracted_text = ", ".join([text for (bbox, text, prob) in results if prob > 0.2])
        print(f"DEBUG: Extracted Text (Safe): {extracted_text[:100]}...")
        
        # Analyze ingredients
        print("DEBUG: Analyzing ingredients for 'acne' compatibility...")
        analysis = analyze_custom_ingredients(extracted_text, "acne")
        print(f"DEBUG: Analysis Result: {analysis}")
        
        return jsonify({
            "status": "success",
            "ingredients": extracted_text,
            "analysis": analysis
        })
    except Exception as e:
        print(f"DEBUG: OCR ERROR: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Use PORT from environment variable (default to 5000 for local dev)
    port = int(os.environ.get('PORT', 5000))
    
    try:
        from waitress import serve
        print(f"✅ AI Analysis Server running at http://0.0.0.0:{port} (Waitress)")
        serve(app, host='0.0.0.0', port=port, threads=4)
    except ImportError:
        # Fallback to Flask dev server without the reloader (prevents double model load)
        print("⚠️  Waitress not found, falling back to Flask dev server")
        app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
