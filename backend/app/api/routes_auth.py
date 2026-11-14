import sqlite3
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Response, Request, Body
from app.db.database import get_db
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_optional_user,
    get_current_user,
    require_admin,
    get_user_count,
)

router = APIRouter()

@router.get("/auth/me")
def get_auth_me(request: Request):
    user = get_optional_user(request)
    user_count = get_user_count()
    return {
        "authenticated": user is not None,
        "user": user,
        "has_users": user_count > 0,
        "is_admin": user.get("role") == "admin" if user else False,
    }

@router.post("/auth/setup")
def initial_setup(response: Response, payload: dict = Body(...)):
    """Initial administrator setup. Only allowed when zero users exist in the database."""
    if get_user_count() > 0:
        raise HTTPException(status_code=403, detail="Initial setup has already been completed.")

    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    display_name = payload.get("display_name", "").strip() or username

    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    pw_hash = hash_password(password)
    conn = get_db()
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, role, display_name, last_login) VALUES (?, ?, 'admin', ?, CURRENT_TIMESTAMP)",
                (username, pw_hash, display_name)
            )
            user_id = cursor.lastrowid
            
            # Associate any pre-existing bookmarks/projects with this initial admin
            conn.execute("UPDATE user_collection SET user_id = ? WHERE user_id IS NULL OR user_id = 1", (user_id,))
            conn.execute("UPDATE project_collections SET user_id = ? WHERE user_id IS NULL OR user_id = 1", (user_id,))

        user = {
            "id": user_id,
            "username": username,
            "role": "admin",
            "display_name": display_name,
        }
        token = create_access_token({"user_id": user_id, "username": username, "role": "admin"})
        response.set_cookie(
            key="sfx_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=86400 * 30,
            path="/"
        )
        return {"status": "success", "user": user, "token": token}
    finally:
        conn.close()

@router.post("/auth/login")
def login(response: Response, payload: dict = Body(...)):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, username, password_hash, role, display_name FROM users WHERE LOWER(username) = LOWER(?)",
            (username,)
        ).fetchone()

        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password.")

        with conn:
            conn.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (row["id"],))

        user = {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"],
            "display_name": row["display_name"],
        }
        token = create_access_token({"user_id": row["id"], "username": row["username"], "role": row["role"]})
        response.set_cookie(
            key="sfx_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=86400 * 30,
            path="/"
        )
        return {"status": "success", "user": user, "token": token}
    finally:
        conn.close()

@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key="sfx_token", path="/")
    return {"status": "logged_out"}

# --- User Management Endpoints (Admin Only) ---

@router.get("/users")
def list_users(current_admin: dict = Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, username, role, display_name, created_at, last_login FROM users ORDER BY created_at ASC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/users")
def create_user(payload: dict = Body(...), current_admin: dict = Depends(require_admin)):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    role = payload.get("role", "user").strip().lower()
    display_name = payload.get("display_name", "").strip() or username

    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be either 'admin' or 'user'.")

    pw_hash = hash_password(password)
    conn = get_db()
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)",
                (username, pw_hash, role, display_name)
            )
            new_id = cursor.lastrowid
        return {
            "status": "success",
            "user": {
                "id": new_id,
                "username": username,
                "role": role,
                "display_name": display_name,
            }
        }
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail=f"Username '{username}' already exists.")
    finally:
        conn.close()

@router.patch("/users/{user_id}")
def update_user(user_id: int, payload: dict = Body(...), current_admin: dict = Depends(require_admin)):
    conn = get_db()
    try:
        updates = []
        params = []

        if "role" in payload:
            role = payload["role"].strip().lower()
            if role not in ("admin", "user"):
                raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'.")
            updates.append("role = ?")
            params.append(role)

        if "display_name" in payload:
            display_name = payload["display_name"].strip()
            updates.append("display_name = ?")
            params.append(display_name)

        if "password" in payload and payload["password"]:
            password = payload["password"]
            if len(password) < 6:
                raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
            updates.append("password_hash = ?")
            params.append(hash_password(password))

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update.")

        params.append(user_id)
        with conn:
            cursor = conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found.")

        row = conn.execute(
            "SELECT id, username, role, display_name, created_at, last_login FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        return {"status": "success", "user": dict(row)}
    finally:
        conn.close()

@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_admin: dict = Depends(require_admin)):
    if user_id == current_admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

    conn = get_db()
    try:
        with conn:
            # Delete user's personal collections
            conn.execute("DELETE FROM collection_items WHERE collection_id IN (SELECT id FROM project_collections WHERE user_id = ?)", (user_id,))
            conn.execute("DELETE FROM project_collections WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM user_collection WHERE user_id = ?", (user_id,))
            cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found.")
        return {"status": "success", "deleted_id": user_id}
    finally:
        conn.close()
