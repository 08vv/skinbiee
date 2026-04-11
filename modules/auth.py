import hashlib
import os
import random
import string
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import requests as http_requests

from modules.history_db import (
    create_db_user, get_user_by_username, update_user_password_hash,
    create_google_user, get_user_by_google_id, get_user_by_email
)

# ── Google OAuth configuration ───────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

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


# ── Google OAuth ─────────────────────────────────────────────────────────────

def verify_google_token(id_token_str: str) -> dict | None:
    """
    Verify a Google ID token by calling Google's tokeninfo endpoint.
    Returns the decoded payload (email, name, sub, etc.) or None.
    """
    if not id_token_str:
        print("[GoogleAuth] Empty ID token")
        return None

    try:
        resp = http_requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token_str},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[GoogleAuth] Token verification failed ({resp.status_code}): {resp.text}")
            return None

        payload = resp.json()

        # Validate audience (client ID) to prevent token substitution attacks
        token_aud = payload.get("aud", "")
        if GOOGLE_CLIENT_ID and token_aud != GOOGLE_CLIENT_ID:
            print(f"[GoogleAuth] Token audience mismatch: {token_aud} != {GOOGLE_CLIENT_ID}")
            return None

        # Ensure the token has the required fields
        if not payload.get("sub") or not payload.get("email"):
            print("[GoogleAuth] Token missing 'sub' or 'email'")
            return None

        return payload

    except Exception as e:
        print(f"[GoogleAuth] Token verification error: {e}")
        return None


def _generate_unique_username(display_name: str) -> str:
    """
    Generate a unique username from a Google display name.
    E.g. "Jane Doe" → "janedoe" → "janedoe_a3x" if taken.
    """
    base = "".join(c for c in display_name.lower() if c.isalnum())
    if not base:
        base = "user"

    # Try the base name first
    if not get_user_by_username(base):
        return base

    # Append random suffix until unique
    for _ in range(20):
        suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=3))
        candidate = f"{base}_{suffix}"
        if not get_user_by_username(candidate):
            return candidate

    # Extreme fallback
    return f"{base}_{int(datetime.now().timestamp())}"


def google_auth(id_token_str: str) -> dict | None:
    """
    Full Google sign-in flow:
      1. Verify the Google ID token
      2. Look up user by google_id (returning user)
      3. If not found, auto-create a new account
      4. Return {"user": {...}, "token": "..."}
    """
    payload = verify_google_token(id_token_str)
    if not payload:
        return None

    google_id = payload["sub"]
    email = payload["email"]
    display_name = payload.get("name") or email.split("@")[0]

    # ── Path A: Returning Google user ────────────────────────────────────
    user = get_user_by_google_id(google_id)
    if user:
        token = create_token(user["id"], user["username"])
        return {"user": user, "token": token}

    # ── Path B: New Google user → auto-register ──────────────────────────
    username = _generate_unique_username(display_name)
    success = create_google_user(email, google_id, username)
    if not success:
        print(f"[GoogleAuth] Failed to create user for {email}")
        return None

    # Fetch the newly created user
    user = get_user_by_google_id(google_id)
    if not user:
        print(f"[GoogleAuth] Created user but couldn't retrieve for {email}")
        return None

    token = create_token(user["id"], user["username"])
    print(f"[GoogleAuth] New user created: {username} (Google: {email})")
    return {"user": user, "token": token}
