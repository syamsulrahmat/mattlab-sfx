import json
import time
import secrets
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from app.db.database import get_db
from app.auth import get_optional_user

router = APIRouter(prefix="/studio/projects", tags=["studio_projects"])

class ProjectCreateRequest(BaseModel):
    title: Optional[str] = "Untitled Studio Project"
    video_filename: Optional[str] = ""
    video_duration: Optional[float] = 0.0
    video_fps: Optional[float] = 24.0
    tracks: Optional[List[Dict[str, Any]]] = []
    clips: Optional[List[Dict[str, Any]]] = []

class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = None
    video_filename: Optional[str] = None
    video_duration: Optional[float] = None
    video_fps: Optional[float] = None
    tracks: Optional[List[Dict[str, Any]]] = None
    clips: Optional[List[Dict[str, Any]]] = None

@router.get("")
def list_projects(request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT id, user_id, title, video_filename, video_duration, video_fps,
                   tracks_json, clips_json, created_at, updated_at
            FROM studio_projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
        """, (user_id,)).fetchall()
        projects = []
        for r in rows:
            clips = json.loads(r["clips_json"]) if r["clips_json"] else []
            tracks = json.loads(r["tracks_json"]) if r["tracks_json"] else []
            projects.append({
                "id": r["id"],
                "user_id": r["user_id"],
                "title": r["title"],
                "video_filename": r["video_filename"],
                "video_duration": r["video_duration"],
                "video_fps": r["video_fps"],
                "clip_count": len(clips),
                "track_count": len(tracks),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            })
        return {"status": "success", "projects": projects}
    finally:
        conn.close()

@router.post("")
def create_project(payload: ProjectCreateRequest, request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    project_id = f"proj_{int(time.time())}_{secrets.token_hex(4)}"
    title = (payload.title or "Untitled Studio Project").strip()
    tracks_json = json.dumps(payload.tracks or [])
    clips_json = json.dumps(payload.clips or [])
    
    conn = get_db()
    try:
        with conn:
            conn.execute("""
                INSERT INTO studio_projects (
                    id, user_id, title, video_filename, video_duration, video_fps,
                    tracks_json, clips_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (
                project_id,
                user_id,
                title,
                payload.video_filename or "",
                payload.video_duration or 0.0,
                payload.video_fps or 24.0,
                tracks_json,
                clips_json
            ))
            
        row = conn.execute("SELECT * FROM studio_projects WHERE id = ?", (project_id,)).fetchone()
        return {
            "status": "success",
            "project": {
                "id": row["id"],
                "title": row["title"],
                "video_filename": row["video_filename"],
                "video_duration": row["video_duration"],
                "video_fps": row["video_fps"],
                "tracks": json.loads(row["tracks_json"]),
                "clips": json.loads(row["clips_json"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        }
    finally:
        conn.close()

@router.get("/{project_id}")
def get_project(project_id: str, request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT * FROM studio_projects WHERE id = ? AND user_id = ?
        """, (project_id, user_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return {
            "status": "success",
            "project": {
                "id": row["id"],
                "title": row["title"],
                "video_filename": row["video_filename"],
                "video_duration": row["video_duration"],
                "video_fps": row["video_fps"],
                "tracks": json.loads(row["tracks_json"]),
                "clips": json.loads(row["clips_json"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        }
    finally:
        conn.close()

@router.put("/{project_id}")
def update_project(project_id: str, payload: ProjectUpdateRequest, request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM studio_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")
        
        updates = []
        params = []
        if payload.title is not None:
            updates.append("title = ?")
            params.append(payload.title.strip() or "Untitled Studio Project")
        if payload.video_filename is not None:
            updates.append("video_filename = ?")
            params.append(payload.video_filename)
        if payload.video_duration is not None:
            updates.append("video_duration = ?")
            params.append(payload.video_duration)
        if payload.video_fps is not None:
            updates.append("video_fps = ?")
            params.append(payload.video_fps)
        if payload.tracks is not None:
            updates.append("tracks_json = ?")
            params.append(json.dumps(payload.tracks))
        if payload.clips is not None:
            updates.append("clips_json = ?")
            params.append(json.dumps(payload.clips))
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        
        params.extend([project_id, user_id])
        with conn:
            conn.execute(
                f"UPDATE studio_projects SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
                params
            )
            
        row = conn.execute("SELECT * FROM studio_projects WHERE id = ?", (project_id,)).fetchone()
        return {
            "status": "success",
            "project": {
                "id": row["id"],
                "title": row["title"],
                "video_filename": row["video_filename"],
                "video_duration": row["video_duration"],
                "video_fps": row["video_fps"],
                "tracks": json.loads(row["tracks_json"]),
                "clips": json.loads(row["clips_json"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        }
    finally:
        conn.close()

@router.delete("/{project_id}")
def delete_project(project_id: str, request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    conn = get_db()
    try:
        with conn:
            cursor = conn.execute(
                "DELETE FROM studio_projects WHERE id = ? AND user_id = ?",
                (project_id, user_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "success", "deleted_id": project_id}
    finally:
        conn.close()

@router.post("/{project_id}/duplicate")
def duplicate_project(project_id: str, request: Request):
    user = get_optional_user(request)
    user_id = user["id"] if user else 1
    new_project_id = f"proj_{int(time.time())}_{secrets.token_hex(4)}"
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM studio_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        
        new_title = f"{row['title']} (Copy)"
        with conn:
            conn.execute("""
                INSERT INTO studio_projects (
                    id, user_id, title, video_filename, video_duration, video_fps,
                    tracks_json, clips_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (
                new_project_id,
                user_id,
                new_title,
                row["video_filename"],
                row["video_duration"],
                row["video_fps"],
                row["tracks_json"],
                row["clips_json"]
            ))
            
        new_row = conn.execute("SELECT * FROM studio_projects WHERE id = ?", (new_project_id,)).fetchone()
        return {
            "status": "success",
            "project": {
                "id": new_row["id"],
                "title": new_row["title"],
                "video_filename": new_row["video_filename"],
                "video_duration": new_row["video_duration"],
                "video_fps": new_row["video_fps"],
                "tracks": json.loads(new_row["tracks_json"]),
                "clips": json.loads(new_row["clips_json"]),
                "created_at": new_row["created_at"],
                "updated_at": new_row["updated_at"],
            }
        }
    finally:
        conn.close()
