import easyocr
import io
import numpy as np
from PIL import Image

def extract_ingredients_from_image(image_bytes: bytes) -> str:
    """
    Extracts text (assumed to be ingredients) from an uploaded image.
    Uses EasyOCR for robust text detection.
    """
    try:
        # Initialize the reader (Loads into memory, sets gpu=False if none available)
        reader = easyocr.Reader(['en'], gpu=False)
        
        # Load the image bytes into a PIL Image and convert to numpy array (RGB)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(image)
        
        # Run OCR
        results = reader.readtext(image_np)
        
        # Extract text items
        extracted_text = []
        for (bbox, text, prob) in results:
            if prob > 0.3:  # simple confidence threshold
                extracted_text.append(text)
                
        # Join extracted pieces, assuming comma separated format roughly
        combined_text = ", ".join(extracted_text)
        return combined_text
    
    except Exception as e:
        print(f"OCR Error: {e}")
        return ""
