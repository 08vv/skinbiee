"""
test_connection.py — Verify the Render ↔ Hugging Face bridge.

Usage:
  python test_connection.py [HF_URL]

Defaults to https://vaishnaviiee-skinbiee.hf.space if no URL given.
"""

import sys
import time
import requests

HF_URL = sys.argv[1] if len(sys.argv) > 1 else "https://vaishnaviiee-skinbiee.hf.space"


def test_health():
    print(f"[1/3] Testing health endpoint: {HF_URL}/health")
    try:
        r = requests.get(f"{HF_URL}/health", timeout=30)
        data = r.json()
        print(f"      Status code : {r.status_code}")
        print(f"      Models      : {data.get('models')}")
        print(f"      TF version  : {data.get('tensorflow_version')}")
        print(f"      OCR version : {data.get('easyocr_version')}")
        if data.get("models") == "Ready":
            print("      ✅ PASS\n")
            return True
        else:
            print("      ⏳ Models still loading — try again in 30s.\n")
            return False
    except Exception as e:
        print(f"      ❌ FAIL: {e}\n")
        return False


def test_skin_predict():
    print(f"[2/3] Testing skin prediction (mock image)")
    # Create a tiny 10x10 white JPEG
    from PIL import Image
    import io
    img = Image.new("RGB", (10, 10), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    try:
        r = requests.post(
            f"{HF_URL}/predict?type=skin",
            files={"image": ("test.jpg", buf, "image/jpeg")},
            timeout=60,
        )
        data = r.json()
        print(f"      Status code: {r.status_code}")
        print(f"      Response   : {data}")
        if data.get("status") == "success":
            print("      ✅ PASS\n")
            return True
        else:
            print(f"      ❌ FAIL: {data.get('error')}\n")
            return False
    except Exception as e:
        print(f"      ❌ FAIL: {e}\n")
        return False


def test_product_predict():
    print(f"[3/3] Testing product OCR (mock image)")
    from PIL import Image
    import io
    img = Image.new("RGB", (10, 10), (200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    try:
        r = requests.post(
            f"{HF_URL}/predict?type=product",
            files={"image": ("test.jpg", buf, "image/jpeg")},
            timeout=120,
        )
        data = r.json()
        print(f"      Status code: {r.status_code}")
        print(f"      Raw text   : {repr(data.get('raw_text', '')[:100])}")
        if data.get("status") == "success":
            print("      ✅ PASS\n")
            return True
        else:
            print(f"      ❌ FAIL: {data.get('error')}\n")
            return False
    except Exception as e:
        print(f"      ❌ FAIL: {e}\n")
        return False


if __name__ == "__main__":
    print("=" * 56)
    print("  Skinbiee — HF ML Service Connection Tester")
    print("=" * 56)
    print(f"  Target: {HF_URL}\n")

    h = test_health()
    if not h:
        print("Health check failed. Waiting 30s for model loading…\n")
        time.sleep(30)
        h = test_health()

    if h:
        s = test_skin_predict()
        p = test_product_predict()
        passed = sum([h, s, p])
        print(f"{'=' * 56}")
        print(f"  Results: {passed}/3 passed")
        print(f"{'=' * 56}")
    else:
        print("⚠️  Cannot reach ML service. Check your HF Space URL and ensure it's running.")
