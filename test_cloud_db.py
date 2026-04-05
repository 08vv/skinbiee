import os
import sys
import cloudinary
import cloudinary.api
import psycopg2
import sqlite3
import json
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

results = {}
results["env"] = {
    "DATABASE_URL": bool(os.getenv("DATABASE_URL")),
    "CLOUDINARY_CLOUD_NAME": bool(os.getenv("CLOUDINARY_CLOUD_NAME"))
}

# Cloudinary Ping
try:
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET")
    )
    res = cloudinary.api.ping()
    results["cloudinary"] = {"status": "ok", "response": res}
except Exception as e:
    results["cloudinary"] = {"status": "error", "message": str(e)}

# DB Ping
url = os.getenv("DATABASE_URL")
if url:
    try:
        conn = psycopg2.connect(url, sslmode='require', connect_timeout=5)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM users;")
        u_count = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM scans;")
        s_count = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM daily_logs;")
        d_count = cur.fetchone()[0]
        results["db_postgres"] = {
            "status": "ok",
            "users": u_count,
            "scans": s_count,
            "daily_logs": d_count
        }
        conn.close()
    except Exception as e:
        results["db_postgres"] = {"status": "error", "message": str(e)}

# SQLite check
try:
    conn = sqlite3.connect(os.path.join('data', 'skin_history.db'))
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cur.fetchall()]
    
    counts = {}
    if "users" in tables:
        cur.execute("SELECT count(*) FROM users;")
        counts["users"] = cur.fetchone()[0]
    if "scans" in tables:
        cur.execute("SELECT count(*) FROM scans;")
        counts["scans"] = cur.fetchone()[0]
    if "daily_logs" in tables:
        cur.execute("SELECT count(*) FROM daily_logs;")
        counts["daily_logs"] = cur.fetchone()[0]
        
    results["db_sqlite"] = {"status": "ok", "tables": tables, "counts": counts}
    conn.close()
except Exception as e:
    results["db_sqlite"] = {"status": "error", "message": str(e)}

with open('test_results.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print("DONE")
