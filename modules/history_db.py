import psycopg2
from psycopg2 import errors
from psycopg2.extras import DictCursor
import os
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

def _execute_and_fetch_dicts(query, params=None):
    conn = get_connection()
    c = conn.cursor(cursor_factory=DictCursor)
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def _safe_add_column(cursor, table_name, column_sql):
    try:
        cursor.execute("SAVEPOINT schema_migration")
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_sql}")
        cursor.execute("RELEASE SAVEPOINT schema_migration")
    except Exception:
        # Keep startup resilient on older Postgres variants.
        cursor.execute("ROLLBACK TO SAVEPOINT schema_migration")
        cursor.execute("RELEASE SAVEPOINT schema_migration")
        fallback_conn = get_connection()
        try:
            fallback_cursor = fallback_conn.cursor()
            fallback_cursor.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = %s AND column_name = %s
                """,
                (table_name, column_sql.split()[0])
            )
            exists = fallback_cursor.fetchone() is not None
            if not exists:
                fallback_cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}")
                fallback_conn.commit()
        finally:
            fallback_conn.close()

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    id_type = "SERIAL PRIMARY KEY"

    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS users (
        id {id_type},
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        google_id TEXT UNIQUE,
        created_at TEXT
    )
    ''')
    
    # Migration for existing users table
    _safe_add_column(cursor, "users", "created_at TEXT")
    _safe_add_column(cursor, "users", "email TEXT")
    _safe_add_column(cursor, "users", "google_id TEXT UNIQUE")
    
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
        planner_json TEXT,
        reminders_json TEXT,
        updated_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    _safe_add_column(cursor, "user_preferences", "planner_json TEXT")
    
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

def create_google_user(email, google_id, username):
    """Create a user authenticated via Google OAuth. No real password."""
    conn = get_connection()
    c = conn.cursor()
    created_at = datetime.now().isoformat()
    # Store a placeholder hash — Google users never authenticate via password
    placeholder_hash = "GOOGLE_OAUTH_NO_PASSWORD"
    try:
        c.execute(
            'INSERT INTO users (username, password_hash, email, google_id, created_at) VALUES (%s, %s, %s, %s, %s)',
            (username, placeholder_hash, email, google_id, created_at)
        )
        conn.commit()
    except Exception as e:
        print(f"Error creating Google user: {e}")
        conn.close()
        return False
    conn.close()
    return True

def get_user_by_google_id(google_id):
    """Look up a user by their Google account ID."""
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash, created_at, email, google_id FROM users WHERE google_id = %s', (google_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0],
            "username": row[1],
            "password_hash": row[2],
            "created_at": row[3],
            "email": row[4],
            "google_id": row[5]
        }
    return None

def get_user_by_email(email):
    """Look up a user by email address."""
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash, created_at, email, google_id FROM users WHERE email = %s', (email,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0],
            "username": row[1],
            "password_hash": row[2],
            "created_at": row[3],
            "email": row[4],
            "google_id": row[5]
        }
    return None

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
    c.execute('SELECT id, username, password_hash, created_at, email FROM users WHERE id = %s', (int(user_id),))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0],
            "username": row[1],
            "password_hash": row[2],
            "created_at": row[3],
            "email": row[4]
        }
    return None

def update_user_email(user_id: int, new_email: str) -> bool:
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute('UPDATE users SET email = %s WHERE id = %s', (new_email, int(user_id)))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB] Error updating email: {e}")
        return False

def update_user_password(user_id: int, hashed_password: str) -> bool:
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute('UPDATE users SET password_hash = %s WHERE id = %s', (hashed_password, int(user_id)))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB] Error updating password: {e}")
        return False

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
    uid = int(user_id)
    return _execute_and_fetch_dicts("SELECT * FROM scans WHERE user_id = %s ORDER BY timestamp DESC", (uid,))

# CRUD for Daily Logs
def add_daily_log(user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes="", photo_path=""):
    conn = get_connection()
    c = conn.cursor()
    uid = int(user_id)
    
    c.execute('SELECT id FROM daily_logs WHERE user_id = %s AND date = %s', (uid, date))
    row = c.fetchone()
    
    if row:
        c.execute(
            'SELECT am_done, pm_done, skin_feeling, skin_rating, notes, photo_path FROM daily_logs WHERE user_id = %s AND date = %s',
            (uid, date)
        )
        existing = c.fetchone()
        merged_am_done = existing[0] if am_done is None else am_done
        merged_pm_done = existing[1] if pm_done is None else pm_done
        merged_skin_feeling = existing[2] if skin_feeling is None else skin_feeling
        merged_skin_rating = existing[3] if skin_rating is None else skin_rating
        merged_notes = existing[4] if notes is None else notes
        merged_photo_path = existing[5] if photo_path is None else photo_path
        c.execute('''UPDATE daily_logs 
                     SET am_done=%s, pm_done=%s, skin_feeling=%s, skin_rating=%s, notes=%s, photo_path=%s 
                     WHERE user_id=%s AND date=%s''',
                  (
                      merged_am_done,
                      merged_pm_done,
                      merged_skin_feeling,
                      merged_skin_rating,
                      merged_notes,
                      merged_photo_path,
                      uid,
                      date
                  ))
    else:
        c.execute('''INSERT INTO daily_logs (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                  (
                      uid,
                      date,
                      0 if am_done is None else am_done,
                      0 if pm_done is None else pm_done,
                      'Good' if skin_feeling is None else skin_feeling,
                      5 if skin_rating is None else skin_rating,
                      '' if notes is None else notes,
                      '' if photo_path is None else photo_path
                  ))
    conn.commit()
    conn.close()

def get_daily_logs(user_id):
    uid = int(user_id)
    return _execute_and_fetch_dicts("SELECT * FROM daily_logs WHERE user_id = %s ORDER BY date ASC", (uid,))

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
    try:
        c.execute(
            'SELECT profile_json, planner_json, reminders_json, updated_at FROM user_preferences WHERE user_id = %s',
            (int(user_id),)
        )
    except Exception as e:
        conn.rollback()
        if getattr(e, 'pgcode', None) == getattr(errors.UndefinedColumn, 'sqlstate', None) or 'planner_json' in str(e):
            c.execute(
                'SELECT profile_json, reminders_json, updated_at FROM user_preferences WHERE user_id = %s',
                (int(user_id),)
            )
            row = c.fetchone()
            conn.close()
            if not row:
                return {"profile": {}, "planner": {}, "reminders": {}, "updated_at": None}
            return {
                "profile": json.loads(row[0]) if row[0] else {},
                "planner": {},
                "reminders": json.loads(row[1]) if row[1] else {},
                "updated_at": row[2]
            }
        conn.close()
        raise
    row = c.fetchone()
    conn.close()
    if not row:
        return {"profile": {}, "planner": {}, "reminders": {}, "updated_at": None}
    return {
        "profile": json.loads(row[0]) if row[0] else {},
        "planner": json.loads(row[1]) if row[1] else {},
        "reminders": json.loads(row[2]) if row[2] else {},
        "updated_at": row[3]
    }

def save_user_preferences(user_id, profile=None, planner=None, reminders=None):
    current = get_user_preferences(user_id)
    merged_profile = current["profile"] if profile is None else profile
    merged_planner = current["planner"] if planner is None else planner
    merged_reminders = current["reminders"] if reminders is None else reminders
    updated_at = datetime.now().isoformat()

    conn = get_connection()
    c = conn.cursor()
    c.execute(
        '''
        INSERT INTO user_preferences (user_id, profile_json, planner_json, reminders_json, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (user_id)
        DO UPDATE SET
            profile_json = EXCLUDED.profile_json,
            planner_json = EXCLUDED.planner_json,
            reminders_json = EXCLUDED.reminders_json,
            updated_at = EXCLUDED.updated_at
        ''',
        (
            int(user_id),
            json.dumps(merged_profile),
            json.dumps(merged_planner),
            json.dumps(merged_reminders),
            updated_at
        )
    )
    conn.commit()
    conn.close()
    return {
        "profile": merged_profile,
        "planner": merged_planner,
        "reminders": merged_reminders,
        "updated_at": updated_at
    }

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
