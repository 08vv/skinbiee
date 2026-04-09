import psycopg2
import os
import pandas as pd
import json
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")


def _require_postgres_url():
    if not DATABASE_URL or not DATABASE_URL.startswith("postgres"):
        raise RuntimeError("DATABASE_URL must be configured with a PostgreSQL connection string.")

def get_connection():
    """Return a PostgreSQL connection. Local SQLite fallback is intentionally disabled."""
    _require_postgres_url()
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    id_type = "SERIAL PRIMARY KEY"

    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS users (
        id {id_type},
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT
    )
    ''')
    
    # Migration for existing users table
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    except Exception:
        # Column likely already exists
        pass
    
    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS scans (
        id {id_type},
        user_id INTEGER NOT NULL,
        timestamp TEXT,
        condition TEXT,
        confidence REAL,
        severity TEXT,
        image_path TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS daily_logs (
        id {id_type},
        user_id INTEGER NOT NULL,
        date TEXT,
        am_done INTEGER,
        pm_done INTEGER,
        skin_feeling TEXT,
        skin_rating INTEGER,
        notes TEXT,
        photo_path TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS routines (
        id {id_type},
        user_id INTEGER NOT NULL,
        created_at TEXT,
        condition TEXT,
        am_steps TEXT,
        pm_steps TEXT,
        active INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS user_preferences (
        id {id_type},
        user_id INTEGER UNIQUE NOT NULL,
        profile_json TEXT,
        reminders_json TEXT,
        updated_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    conn.commit()
    conn.close()

from datetime import datetime

# User Management
def create_db_user(username, password_hash):
    conn = get_connection()
    c = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        c.execute('INSERT INTO users (username, password_hash, created_at) VALUES (%s, %s, %s)', (username, password_hash, created_at))
        conn.commit()
    except Exception as e:
        print(f"Error creating user: {e}")
        conn.close()
        return False
    conn.close()
    return True

def get_user_by_username(username):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash, created_at FROM users WHERE username = %s', (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0], 
            "username": row[1], 
            "password_hash": row[2],
            "created_at": row[3]
        }
    return None

def get_user_by_id(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash, created_at FROM users WHERE id = %s', (int(user_id),))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0],
            "username": row[1],
            "password_hash": row[2],
            "created_at": row[3]
        }
    return None

def update_user_password_hash(user_id: int, new_hash: str):
    """Update the password_hash for a user (used for SHA-256→bcrypt migration)."""
    conn = get_connection()
    c = conn.cursor()
    c.execute('UPDATE users SET password_hash = %s WHERE id = %s', (new_hash, int(user_id)))
    conn.commit()
    conn.close()

# CRUD for Scans
def add_scan(user_id, timestamp, condition, confidence, severity, image_path=""):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    c.execute('INSERT INTO scans (user_id, timestamp, condition, confidence, severity, image_path) VALUES (%s, %s, %s, %s, %s, %s)',
              (uid, timestamp, condition, confidence, severity, image_path))
    conn.commit()
    conn.close()

def get_all_scans(user_id):
    conn = get_connection()
    uid = int(user_id)
    df = pd.read_sql_query("SELECT * FROM scans WHERE user_id = %s ORDER BY timestamp DESC", conn, params=(uid,))
    conn.close()
    return df

# CRUD for Daily Logs
def add_daily_log(user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes="", photo_path=""):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    
    c.execute('SELECT id FROM daily_logs WHERE user_id = %s AND date = %s', (uid, date))
    row = c.fetchone()
    
    if row:
        c.execute('''UPDATE daily_logs 
                     SET am_done=%s, pm_done=%s, skin_feeling=%s, skin_rating=%s, notes=%s, photo_path=%s 
                     WHERE user_id=%s AND date=%s''',
                  (am_done, pm_done, skin_feeling, skin_rating, notes, photo_path, uid, date))
    else:
        c.execute('''INSERT INTO daily_logs (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                  (uid, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path))
    conn.commit()
    conn.close()

def get_daily_logs(user_id):
    conn = get_connection()
    uid = int(user_id)
    df = pd.read_sql_query("SELECT * FROM daily_logs WHERE user_id = %s ORDER BY date ASC", conn, params=(uid,))
    conn.close()
    return df

def save_progress_photo(user_id, date, photo_path):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    c.execute(
        'SELECT am_done, pm_done, skin_feeling, skin_rating, notes FROM daily_logs WHERE user_id = %s AND date = %s',
        (uid, date)
    )
    row = c.fetchone()

    if row:
        c.execute(
            'UPDATE daily_logs SET photo_path = %s WHERE user_id = %s AND date = %s',
            (photo_path, uid, date)
        )
    else:
        c.execute(
            '''INSERT INTO daily_logs (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
            (uid, date, 0, 0, 'Good', 5, '', photo_path)
        )
    conn.commit()
    conn.close()

# CRUD for Routines
def save_routine(user_id, created_at, condition, am_steps_json, pm_steps_json):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    c.execute("UPDATE routines SET active = 0 WHERE user_id = %s", (uid,))
    c.execute('''INSERT INTO routines (user_id, created_at, condition, am_steps, pm_steps, active) 
                 VALUES (%s, %s, %s, %s, %s, 1)''',
              (uid, created_at, condition, am_steps_json, pm_steps_json))
    conn.commit()
    conn.close()

def get_active_routine(user_id):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    c.execute("SELECT * FROM routines WHERE user_id = %s AND active = 1 ORDER BY id DESC LIMIT 1", (uid,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0], "user_id": row[1], "created_at": row[2], "condition": row[3],
            "am_steps": row[4], "pm_steps": row[5], "active": row[6]
        }
    return None

def get_user_preferences(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        'SELECT profile_json, reminders_json, updated_at FROM user_preferences WHERE user_id = %s',
        (int(user_id),)
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return {"profile": {}, "reminders": {}, "updated_at": None}
    return {
        "profile": json.loads(row[0]) if row[0] else {},
        "reminders": json.loads(row[1]) if row[1] else {},
        "updated_at": row[2]
    }

def save_user_preferences(user_id, profile=None, reminders=None):
    current = get_user_preferences(user_id)
    merged_profile = current["profile"] if profile is None else profile
    merged_reminders = current["reminders"] if reminders is None else reminders
    updated_at = datetime.now().isoformat()

    conn = get_connection()
    c = conn.cursor()
    c.execute(
        '''
        INSERT INTO user_preferences (user_id, profile_json, reminders_json, updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id)
        DO UPDATE SET
            profile_json = EXCLUDED.profile_json,
            reminders_json = EXCLUDED.reminders_json,
            updated_at = EXCLUDED.updated_at
        ''',
        (int(user_id), json.dumps(merged_profile), json.dumps(merged_reminders), updated_at)
    )
    conn.commit()
    conn.close()
    return {"profile": merged_profile, "reminders": merged_reminders, "updated_at": updated_at}

def get_user_skin_condition(user_id: int) -> str:
    """
    Return the user's most recent detected skin condition from face scans.
    Falls back to 'general' when no face-scan record exists.

    The 'condition' column in scans stores labels like 'Acne', 'Oiliness', etc.
    We normalise them to the keys used by ingredient_db.json:
      Acne → acne, Oiliness → oily_skin, Dryness → dry_skin,
      Dark Spots → dark_spots, Normal → normal_skin
    """
    CONDITION_MAP = {
        "acne":       "acne",
        "oiliness":   "oily_skin",
        "dryness":    "dry_skin",
        "dark spots": "dark_spots",
        "normal":     "normal_skin",
    }

    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)

    # Exclude product-scan rows; they are stored with condition='Product Scan'.
    c.execute(
        "SELECT condition FROM scans WHERE user_id = %s "
        "AND condition != 'Product Scan' "
        "ORDER BY timestamp DESC LIMIT 1",
        (uid,)
    )
    row = c.fetchone()
    conn.close()

    if row and row[0]:
        raw = row[0].lower().strip()
        return CONDITION_MAP.get(raw, "general")

    return "general"


# Ensure tables exist on start
try:
    init_db()
except Exception as e:
    print(f"DB Init failed: {e}")
