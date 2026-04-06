import requests
try:
    r = requests.get("https://vaishnaviiee-skinbiee.hf.space/health", timeout=30)
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"Body: {r.text[:500]}")
except Exception as e:
    print(f"Error: {e}")
