import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from modules.history_db import create_db_user, get_user_by_username, update_user_password_hash

# ── Legacy SHA-256 salt (kept ONLY for migration verification) ────────────────
_LEGACY_SALT = "skincare_app_secure_salt_2026"

# ── JWT configuration ────────────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me-in-production-32chars!")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7


# ── Password hashing (bcrypt) ────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hashes the password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verifies a password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _verify_legacy_sha256(password: str, stored_hash: str) -> bool:
    """Check password against the old SHA-256 + salt scheme."""
    salted = password + _LEGACY_SALT
    return hashlib.sha256(salted.encode()).hexdigest() == stored_hash


def _is_bcrypt_hash(h: str) -> bool:
    """Returns True if the stored hash looks like a bcrypt hash."""
    return h.startswith("$2b$") or h.startswith("$2a$") or h.startswith("$2y$")


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_token(user_id: int, username: str) -> str:
    """Signs a JWT with HS256, 7-day expiry."""
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verifies and decodes the token. Returns payload dict or None."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        print("[Auth] Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"[Auth] Invalid token: {e}")
        return None


# ── Public auth API ───────────────────────────────────────────────────────────

def register_user(username: str, password: str) -> bool:
    """Registers a new user with bcrypt hash. Returns True on success."""
    if not username or not password:
        return False
    hashed = hash_password(password)
    return create_db_user(username, hashed)


def login_user(username: str, password: str):
    """
    Authenticates a user.  Returns the user dict if successful, otherwise None.

    Dual-verification strategy:
      1. Try bcrypt first (new hashes).
      2. Fall back to legacy SHA-256.  On success, transparently upgrade
         the stored hash to bcrypt so the old hash is never used again.
    """
    user = get_user_by_username(username)
    if not user:
        return None

    stored_hash = user["password_hash"]

    # ── Path A: bcrypt hash ──────────────────────────────────────────────
    if _is_bcrypt_hash(stored_hash):
        if verify_password(password, stored_hash):
            return user
        return None

    # ── Path B: legacy SHA-256 → auto-upgrade ────────────────────────────
    if _verify_legacy_sha256(password, stored_hash):
        new_hash = hash_password(password)
        try:
            update_user_password_hash(user["id"], new_hash)
            print(f"[Auth] Upgraded password hash for user {username}")
        except Exception as e:
            print(f"[Auth] Hash upgrade failed for {username}: {e}")
        return user

    return None
