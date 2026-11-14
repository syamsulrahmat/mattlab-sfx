import os
import json
import time
import base64
import hmac
import hashlib
import secrets
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, Depends
from app.db.database import get_db

DATA_DIR = os.environ.get("DATA_DIR", "/data")
SECRET_FILE = os.path.join(DATA_DIR, ".session_secret")

def get_secret_key() -> bytes:
    """Retrieve or generate persistent session signing secret key."""
    env_secret = os.getenv("SESSION_SECRET")
    if env_secret:
        return env_secret.encode("utf-8")
    
    if os.path.exists(SECRET_FILE):
        try:
            with open(SECRET_FILE, "rb") as f:
                key = f.read().strip()
                if key:
                    return key
        except Exception:
            pass
    
    # Generate new random 32-byte secret
    new_secret = secrets.token_bytes(32)
    try:
        os.makedirs(os.path.dirname(SECRET_FILE), exist_ok=True)
        with open(SECRET_FILE, "wb") as f:
            f.write(new_secret)
        os.chmod(SECRET_FILE, 0o600)
    except Exception as e:
        print(f"[AUTH] Warning: Failed to persist secret file: {e}", flush=True)
    return new_secret

SECRET_KEY = get_secret_key()

def hash_password(password: str) -> str:
    """Hash password using cryptographic scrypt (memory-hard, GPU resistant)."""
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return "scrypt$16384$8$1$" + salt.hex() + "$" + key.hex()

def verify_password(password: str, hash_str: str) -> bool:
    """Verify password against scrypt hash string."""
    try:
        parts = hash_str.split("$")
        if len(parts) != 6 or parts[0] != "scrypt":
            return False
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt = bytes.fromhex(parts[4])
        expected_key = bytes.fromhex(parts[5])
        computed_key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p)
        return hmac.compare_digest(computed_key, expected_key)
    except Exception:
        return False

def create_access_token(data: Dict[str, Any], expires_in: int = 86400 * 30) -> str:
    """Create signed HMAC-SHA256 session token with expiration (default 30 days)."""
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_in
    raw_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("utf-8").rstrip("=")
    sig = hmac.new(SECRET_KEY, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify HMAC signature and expiration timestamp of token."""
    try:
        if not token or "." not in token:
            return None
        b64_payload, sig = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        
        # Restore base64 padding
        padding = "=" * (-len(b64_payload) % 4)
        raw_json = base64.urlsafe_b64decode(b64_payload + padding)
        payload = json.loads(raw_json.decode("utf-8"))
        
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

def get_user_count() -> int:
    """Return total number of users in database."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) as count FROM users")
        row = cursor.fetchone()
        return row["count"] if row else 0
    finally:
        conn.close()

def get_optional_user(request: Request) -> Optional[Dict[str, Any]]:
    """Extract and authenticate user from Cookie, Authorization header, or query token (non-throwing)."""
    token = None
    if "sfx_token" in request.cookies:
        token = request.cookies["sfx_token"]
    elif "authorization" in request.headers:
        auth_header = request.headers["authorization"]
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        return None

    decoded = decode_access_token(token)
    if not decoded or "user_id" not in decoded:
        return None

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, role, display_name, created_at, last_login FROM users WHERE id = ?",
            (decoded["user_id"],)
        )
        user_row = cursor.fetchone()
        if not user_row:
            return None
        return dict(user_row)
    finally:
        conn.close()

def get_current_user(request: Request) -> Dict[str, Any]:
    """FastAPI dependency enforcing valid logged-in user, raising 401 otherwise."""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """FastAPI dependency enforcing 'admin' role, raising 403 otherwise."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user
