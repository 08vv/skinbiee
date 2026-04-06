import requests
import time

url = "https://vaishnaviiee-skinbiee.hf.space/health"
print(f"Watching {url}...")

for _ in range(30):
    try:
        r = requests.get(url, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            print(f"Body: {r.json()}")
            break
        elif r.status_code == 503:
            print("Space is not ready (503)...")
        else:
            print(f"Status {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(10)
