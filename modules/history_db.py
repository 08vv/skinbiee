import sqlite3
import psycopg2
import os
import pandas as pd
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'skin_history.db')

def get_connection():
    """Returns a connection based on DATABASE_URL availability (PostgreSQL or SQLite)."""
    if DATABASE_URL and DATABASE_URL.startswith("postgres"):
        # Use PostgreSQL (Neon, Render, etc.)
        try:
            return psycopg2.connect(DATABASE_URL, sslmode='require')
        except Exception as e:
            print(f"PostgreSQL connection failed: {e}. Falling back to SQLite.")
            
    # Default to SQLite
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if we are using PostgreSQL or SQLite for specific syntax (id generation)
    is_postgres = hasattr(conn, 'get_dsn_parameters')
    id_type = "SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"

    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS users (
        id {id_type},
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )
    ''')
    
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
    
    conn.commit()
    conn.close()

# User Management
def create_db_user(username, password_hash):
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (username, password_hash) VALUES (%s, %s)' if hasattr(conn, 'get_dsn_parameters') else 'INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, password_hash))
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
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    c.execute(f'SELECT id, username, password_hash FROM users WHERE username = {placeholder}', (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "password_hash": row[2]}
    return None

# CRUD for Scans
def add_scan(user_id, timestamp, condition, confidence, severity, image_path=""):
    conn = get_connection()
    c = conn.cursor()
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    uid = int(user_id)
    c.execute(f'INSERT INTO scans (user_id, timestamp, condition, confidence, severity, image_path) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})',
              (uid, timestamp, condition, confidence, severity, image_path))
    conn.commit()
    conn.close()

def get_all_scans(user_id):
    conn = get_connection()
    uid = int(user_id)
    df = pd.read_sql_query("SELECT * FROM scans WHERE user_id = %s ORDER BY timestamp DESC" if hasattr(conn, 'get_dsn_parameters') else "SELECT * FROM scans WHERE user_id = ? ORDER BY timestamp DESC", conn, params=(uid,))
    conn.close()
    return df

# CRUD for Daily Logs
def add_daily_log(user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes="", photo_path=""):
    conn = get_connection()
    c = conn.cursor()
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    uid = int(user_id)
    
    c.execute(f'SELECT id FROM daily_logs WHERE user_id = {placeholder} AND date = {placeholder}', (uid, date))
    row = c.fetchone()
    
    if row:
        c.execute(f'''UPDATE daily_logs 
                     SET am_done={placeholder}, pm_done={placeholder}, skin_feeling={placeholder}, skin_rating={placeholder}, notes={placeholder}, photo_path={placeholder} 
                     WHERE user_id={placeholder} AND date={placeholder}''',
                  (am_done, pm_done, skin_feeling, skin_rating, notes, photo_path, uid, date))
    else:
        c.execute(f'''INSERT INTO daily_logs (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path)
                     VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})''',
                  (uid, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path))
    conn.commit()
    conn.close()

def get_daily_logs(user_id):
    conn = get_connection()
    uid = int(user_id)
    df = pd.read_sql_query("SELECT * FROM daily_logs WHERE user_id = %s ORDER BY date ASC" if hasattr(conn, 'get_dsn_parameters') else "SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date ASC", conn, params=(uid,))
    conn.close()
    return df

# CRUD for Routines
def save_routine(user_id, created_at, condition, am_steps_json, pm_steps_json):
    conn = get_connection()
    c = conn.cursor()
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    uid = int(user_id)
    c.execute(f"UPDATE routines SET active = 0 WHERE user_id = {placeholder}", (uid,))
    c.execute(f'''INSERT INTO routines (user_id, created_at, condition, am_steps, pm_steps, active) 
                 VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 1)''',
              (uid, created_at, condition, am_steps_json, pm_steps_json))
    conn.commit()
    conn.close()

def get_active_routine(user_id):
    conn = get_connection()
    c = conn.cursor()
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    uid = int(user_id)
    c.execute(f"SELECT * FROM routines WHERE user_id = {placeholder} AND active = 1 ORDER BY id DESC LIMIT 1", (uid,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0], "user_id": row[1], "created_at": row[2], "condition": row[3],
            "am_steps": row[4], "pm_steps": row[5], "active": row[6]
        }
    return None

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
    placeholder = '%s' if hasattr(conn, 'get_dsn_parameters') else '?'
    uid = int(user_id)

    # Exclude product-scan rows; they are stored with condition='Product Scan'.
    c.execute(
        f"SELECT condition FROM scans WHERE user_id = {placeholder} "
        f"AND condition != 'Product Scan' "
        f"ORDER BY timestamp DESC LIMIT 1",
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
