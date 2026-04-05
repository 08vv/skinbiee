import hashlib
from modules.history_db import create_db_user, get_user_by_username

# Lightweight salt for MVP mapping (in production, use bcrypt library)
SALT = "skincare_app_secure_salt_2026"

def hash_password(password: str) -> str:
    """Hashes the password with SHA-256 and a generic application salt."""
    salted = password + SALT
    return hashlib.sha256(salted.encode()).hexdigest()

def register_user(username: str, password: str) -> bool:
    """Registers a new user. Returns True on success, False if username exists."""
    if not username or not password:
        return False
    hashed = hash_password(password)
    return create_db_user(username, hashed)

def login_user(username: str, password: str):
    """Authenticates a user. Returns the user mapping Dict if successful, otherwise None."""
    user = get_user_by_username(username)
    if not user:
        return None
        
    hashed_input = hash_password(password)
    if user['password_hash'] == hashed_input:
        return user
    return None
