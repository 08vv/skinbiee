import sqlite3
import os
import pandas as pd

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'skin_history.db')

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        timestamp TEXT,
        condition TEXT,
        confidence REAL,
        severity TEXT,
        image_path TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS daily_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        c.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, password_hash))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return False # Username exists
    conn.close()
    return True

def get_user_by_username(username):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "password_hash": row[2]}
    return None

# CRUD for Scans
def add_scan(user_id, timestamp, condition, confidence, severity, image_path=""):
    conn = get_connection()
    c = conn.cursor()
    c.execute('INSERT INTO scans (user_id, timestamp, condition, confidence, severity, image_path) VALUES (?, ?, ?, ?, ?, ?)',
              (user_id, timestamp, condition, confidence, severity, image_path))
    conn.commit()
    conn.close()

def get_all_scans(user_id):
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM scans WHERE user_id = ? ORDER BY timestamp DESC", conn, params=(user_id,))
    conn.close()
    return df

# CRUD for Daily Logs
def add_daily_log(user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes="", photo_path=""):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id FROM daily_logs WHERE user_id = ? AND date = ?', (user_id, date))
    row = c.fetchone()
    if row:
        c.execute('''UPDATE daily_logs 
                     SET am_done=?, pm_done=?, skin_feeling=?, skin_rating=?, notes=?, photo_path=? 
                     WHERE user_id=? AND date=?''',
                  (am_done, pm_done, skin_feeling, skin_rating, notes, photo_path, user_id, date))
    else:
        c.execute('''INSERT INTO daily_logs (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                  (user_id, date, am_done, pm_done, skin_feeling, skin_rating, notes, photo_path))
    conn.commit()
    conn.close()

def get_daily_logs(user_id):
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date ASC", conn, params=(user_id,))
    conn.close()
    return df

# CRUD for Routines
def save_routine(user_id, created_at, condition, am_steps_json, pm_steps_json):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE routines SET active = 0 WHERE user_id = ?", (user_id,))
    c.execute('''INSERT INTO routines (user_id, created_at, condition, am_steps, pm_steps, active) 
                 VALUES (?, ?, ?, ?, ?, 1)''',
              (user_id, created_at, condition, am_steps_json, pm_steps_json))
    conn.commit()
    conn.close()

def get_active_routine(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM routines WHERE user_id = ? AND active = 1 ORDER BY id DESC LIMIT 1", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {
            "id": row[0],
            "user_id": row[1],
            "created_at": row[2],
            "condition": row[3],
            "am_steps": row[4],
            "pm_steps": row[5],
            "active": row[6]
        }
    return None

init_db()
