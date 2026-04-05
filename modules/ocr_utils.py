"""
ocr_utils.py — Image pre-processing + OCR + ingredient-section extraction for Skinbiee.

Strategy:
  1. Run OCR on the original image first (EasyOCR handles most real photos well natively).
  2. If "Ingredients:" header is NOT found, run OCR again on a preprocessed version
     (grayscale → gentle CLAHE → denoise → 2× upscale) as a second attempt.
  3. Use whichever result contains the ingredient header. If neither does, return both
     combined so the caller can give a useful error.

Parser (extract_ingredient_section):
  raw OCR text → locate ingredient header (fuzzy regex) → cut at first stop-keyword
              → split by commas / "and" → strip / filter short tokens → clean list
"""

import io
import re
import numpy as np
import cv2
import easyocr
from PIL import Image

# ── Shared reader instance (initialised once) ─────────────────────────────────
_reader: easyocr.Reader | None = None


def _get_reader() -> easyocr.Reader:
    """Return the cached EasyOCR reader, creating it on first call."""
    global _reader
    if _reader is None:
        print("[OCR] Initialising EasyOCR reader (cpu)…")
        _reader = easyocr.Reader(['en'], gpu=False)
        print("[OCR] Reader ready.")
    return _reader


# ── Image decoders ────────────────────────────────────────────────────────────

def _decode_bgr(image_bytes: bytes) -> np.ndarray:
    """Decode raw bytes → OpenCV BGR array. Falls back to PIL for exotic formats."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img


def _preprocess_for_ocr(img_bgr: np.ndarray) -> np.ndarray:
    """
    Gentle preprocessing pass for difficult images (blurry, low-contrast, etc.).
    Avoids the aggressive adaptive threshold that breaks clean digital images.

    Steps:
      1. Grayscale
      2. CLAHE (contrast-limited adaptive histogram equalisation) — lifts detail
         without blowing out bright areas the way adaptive threshold does
      3. Mild Gaussian blur to reduce JPEG compression noise
      4. 2× upscale with INTER_CUBIC
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # CLAHE is much kinder to text than binary adaptive threshold
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Very mild denoise — only removes salt-and-pepper noise
    denoised = cv2.fastNlMeansDenoising(enhanced, h=7,
                                         templateWindowSize=7,
                                         searchWindowSize=15)

    # 2× upscale
    h, w = denoised.shape[:2]
    upscaled = cv2.resize(denoised, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    return upscaled


# ── OCR runner ────────────────────────────────────────────────────────────────

def _run_ocr(img_array: np.ndarray, confidence_threshold: float) -> str:
    """Run EasyOCR on a numpy array and return newline-joined accepted text."""
    reader = _get_reader()
    results = reader.readtext(img_array)
    lines = [text.strip() for (_, text, prob) in results if prob >= confidence_threshold]
    return "\n".join(lines)


def _has_ingredient_header(text: str) -> bool:
    """Quick check: does the text contain a recognised ingredient header?"""
    return bool(re.search(
        r'ingr?e?d?i?e?n?t?s?\s*[:\-]',   # tolerates partial OCR drops
        text, re.IGNORECASE
    ))


# ── Public entry-point ────────────────────────────────────────────────────────

def extract_ingredients_from_image(
    image_bytes: bytes,
    confidence_threshold: float = 0.3
) -> str:
    """
    Run OCR on the image and return the best raw text string.

    Two-pass strategy:
      Pass 1 — OCR on the original image (fastest, most accurate for clear photos).
      Pass 2 — OCR on gently preprocessed image (helps dark/blurry/low-contrast labels).

    The pass whose output contains 'Ingredients:' (or a close variant) is returned.
    If neither pass finds the header, both texts are concatenated and returned so
    extract_ingredient_section() can still attempt parsing.

    Returns:
        A single newline-joined string of all recognised text blocks.
    """
    try:
        img_bgr = _decode_bgr(image_bytes)

        # ── Pass 1: original image
        raw_text_1 = _run_ocr(img_bgr, confidence_threshold)
        print(f"[OCR] Pass 1: {len(raw_text_1.splitlines())} lines. "
              f"Header found: {_has_ingredient_header(raw_text_1)}")

        if _has_ingredient_header(raw_text_1):
            return raw_text_1

        # ── Pass 2: gently preprocessed
        preprocessed = _preprocess_for_ocr(img_bgr)
        raw_text_2 = _run_ocr(preprocessed, confidence_threshold)
        print(f"[OCR] Pass 2: {len(raw_text_2.splitlines())} lines. "
              f"Header found: {_has_ingredient_header(raw_text_2)}")

        if _has_ingredient_header(raw_text_2):
            return raw_text_2

        # ── Neither pass found the header — return combined text for diagnostics
        print("[OCR] Neither pass found 'Ingredients:' header.")
        combined = raw_text_1 + "\n" + raw_text_2
        return combined

    except Exception as e:
        print(f"[OCR] extract_ingredients_from_image error: {e}")
        return ""


# ── Ingredient-section parser ─────────────────────────────────────────────────

# Fuzzy header pattern — handles OCR typos like "ngredients", "lngredients:",
# missing colons, or ALLCAPS labels.
_HEADER_PATTERN = re.compile(
    r'\b(?:active\s+)?ing(?:r(?:e(?:d(?:i(?:e(?:n(?:ts?)?)?)?)?)?)?)?\s*[:\-\.]',
    re.IGNORECASE
)

# Also try a simpler fallback for when the full word IS there but colon is absent
_HEADER_FALLBACK = re.compile(r'\bingredients\b', re.IGNORECASE)

# Keywords that mark the END of the ingredient list on a cosmetic label.
# Includes common Indian address / manufacturer-info tokens that OCR
# often drags into the ingredient section.
_STOP_KEYWORDS: list[str] = [
    # Regulatory / manufacturer info
    "Mktd.", "Marketed", "Manufactured", "Mfd.", "Mfg",
    # Usage / safety
    "Directions", "Note:", "Caution", "How to use",
    "Use before", "For query", "Not to be",
    # Label meta
    "Net Weight", "Batch", "Storage", "Expiry", "MRP",
    # Indian address tokens (HSR Layout, Bengaluru, industrial estates, etc.)
    "HSR", "Bengaluru", "Plot No", "Parwanoo", "Sector",
    "S-COS", "byaddress", "wecare",
]

_STOP_PATTERN = re.compile(
    "|".join(re.escape(kw) for kw in _STOP_KEYWORDS),
    re.IGNORECASE
)


def extract_ingredient_section(raw_text: str) -> list[str]:
    """
    Locate the ingredient section in OCR text and return clean ingredient names.

    Algorithm:
      1. Find the ingredient header using a fuzzy regex (handles OCR typos).
         Falls back to just the word "ingredients" if colon was missed.
      2. Slice to everything after that header.
      3. Stop at the first section-ending stop keyword.
      4. Split on commas and the word "and".
      5. Strip whitespace; discard tokens shorter than 3 characters.

    Returns:
        List of ingredient name strings, or [] if section not found.
    """
    if not raw_text:
        return []

    # 1. Locate header — try strict fuzzy first, then bare word
    match = _HEADER_PATTERN.search(raw_text)
    if not match:
        match = _HEADER_FALLBACK.search(raw_text)
    if not match:
        print("[OCR Parser] Ingredient header not found. Raw preview:",
              raw_text[:200].replace('\n', ' | '))
        return []

    after_header = raw_text[match.end():]

    # 2. Stop at section-ending keyword
    stop_match = _STOP_PATTERN.search(after_header)
    if stop_match:
        after_header = after_header[:stop_match.start()]

    # 3. Split by commas and "and" (word-boundary to avoid 'mandarin', 'almond')
    raw_tokens = re.split(r',|\band\b', after_header, flags=re.IGNORECASE)

    # 4. Strip and filter
    ingredients: list[str] = []
    for token in raw_tokens:
        cleaned = token.strip().strip('.')
        cleaned = re.sub(r'\s+', ' ', cleaned)   # collapse internal whitespace
        cleaned = re.sub(r'[^\w\s\-\(\)%\.,/]', '', cleaned)  # drop stray symbols
        if len(cleaned) >= 3:
            ingredients.append(cleaned)

    print(f"[OCR Parser] Found {len(ingredients)} ingredient(s) after header.")
    return ingredients
