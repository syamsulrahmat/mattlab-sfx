import os
import sqlite3
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Body
from app.db.database import get_db
from app.ai.audio_listener import predict_smart_name, classify_audio_sound

router = APIRouter()
SFX_DIR = os.environ.get("SFX_DIR", "/sfx")
SMB_BASE_PATH = os.environ.get("SMB_BASE_PATH", r"\\MATTLAB\Assets\Sound effects")

SORT_COLUMNS = {
    "name": "LOWER(COALESCE(NULLIF(a.display_name, ''), a.filename))",
    "duration": "a.duration",
    "category": "a.category",
    "sample_rate": "a.sample_rate",
    "id": "a.id",
    "rank": "rank"
}

@router.get("/search")
def search_sfx(
    q: str = Query("", description="Search query terms"),
    category: str = Query("", description="UCS Category Filter"),
    collection_only: bool = Query(False, description="Filter results to only sounds in My Collection"),
    project_id: Optional[int] = Query(None, description="Filter results to a specific project collection"),
    sort_by: str = Query("default", description="Sort field: default, name, duration, category, sample_rate, id, rank"),
    sort_order: str = Query("asc", description="Sort direction: asc or desc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    conn = get_db()
    try:
        terms = q.strip().replace('"', '""')
        params = []
        direction = "DESC" if sort_order.lower() == "desc" else "ASC"
        
        if terms:
            fts_query = " ".join([f'"{t}"*' for t in terms.split()])
            if project_id is not None:
                base_sql = """
                    SELECT a.*, bm25(audio_fts) as rank
                    FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    JOIN collection_items ci ON a.id = ci.audio_id
                    WHERE audio_fts MATCH ? AND ci.collection_id = ?
                """
                params.extend([fts_query, project_id])
            elif collection_only:
                base_sql = """
                    SELECT a.*, bm25(audio_fts) as rank
                    FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    JOIN user_collection uc ON a.id = uc.audio_id
                    WHERE audio_fts MATCH ?
                """
                params.append(fts_query)
            else:
                base_sql = """
                    SELECT a.*, bm25(audio_fts) as rank
                    FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    WHERE audio_fts MATCH ?
                """
                params.append(fts_query)
            
            if category:
                base_sql += " AND a.category = ?"
                params.append(category)

            if sort_by in ("default", "rank"):
                order_clause = "ORDER BY rank ASC"
            else:
                col = SORT_COLUMNS.get(sort_by, "rank")
                order_clause = f"ORDER BY {col} {direction}"

            base_sql += f" {order_clause} LIMIT ? OFFSET ?"
            params.extend([limit, offset])
        else:
            if project_id is not None:
                base_sql = "SELECT a.* FROM audio_files a JOIN collection_items ci ON a.id = ci.audio_id"
                conditions = ["ci.collection_id = ?"]
                params.append(project_id)
            elif collection_only:
                base_sql = "SELECT a.* FROM audio_files a JOIN user_collection uc ON a.id = uc.audio_id"
                conditions = []
            else:
                base_sql = "SELECT a.* FROM audio_files a"
                conditions = []

            if category:
                conditions.append("a.category = ?")
                params.append(category)

            if conditions:
                base_sql += " WHERE " + " AND ".join(conditions)

            if sort_by in ("default", "name"):
                order_clause = f"ORDER BY LOWER(COALESCE(NULLIF(a.display_name, ''), a.filename)) {direction}"
            elif sort_by == "id":
                if project_id is not None:
                    order_clause = f"ORDER BY ci.created_at {direction}"
                elif collection_only:
                    order_clause = f"ORDER BY uc.created_at {direction}"
                else:
                    order_clause = f"ORDER BY a.id {direction}"
            else:
                col = SORT_COLUMNS.get(sort_by, "a.id")
                order_clause = f"ORDER BY {col} {direction}"

            base_sql += f" {order_clause} LIMIT ? OFFSET ?"
            params.extend([limit, offset])

        cursor = conn.execute(base_sql, params)
        results = []
        for r in cursor.fetchall():
            item = dict(r)
            win_path = f"{SMB_BASE_PATH}\\{item['rel_path'].replace('/', chr(92))}"
            item["smb_path"] = win_path
            item["explorer_cmd"] = f'explorer.exe /select,"{win_path}"'
            results.append(item)

        if terms:
            if project_id is not None:
                count_sql = """
                    SELECT COUNT(*) FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    JOIN collection_items ci ON a.id = ci.audio_id
                    WHERE audio_fts MATCH ? AND ci.collection_id = ?
                """
                count_params = [fts_query, project_id]
            elif collection_only:
                count_sql = """
                    SELECT COUNT(*) FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    JOIN user_collection uc ON a.id = uc.audio_id
                    WHERE audio_fts MATCH ?
                """
                count_params = [fts_query]
            else:
                count_sql = """
                    SELECT COUNT(*) FROM audio_files a
                    JOIN audio_fts ON a.id = audio_fts.rowid
                    WHERE audio_fts MATCH ?
                """
                count_params = [fts_query]

            if category:
                count_sql += " AND a.category = ?"
                count_params.append(category)
            total = conn.execute(count_sql, count_params).fetchone()[0]
        else:
            if project_id is not None:
                count_sql = "SELECT COUNT(*) FROM audio_files a JOIN collection_items ci ON a.id = ci.audio_id"
            elif collection_only:
                count_sql = "SELECT COUNT(*) FROM audio_files a JOIN user_collection uc ON a.id = uc.audio_id"
            else:
                count_sql = "SELECT COUNT(*) FROM audio_files a"
            count_params = []
            if conditions:
                count_sql += " WHERE " + " AND ".join(conditions)
                count_params.extend(params[:-2])
            total = conn.execute(count_sql, count_params).fetchone()[0]

        return {
            "results": results,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    finally:
        conn.close()

@router.get("/collection/ids")
def get_collection_ids():
    conn = get_db()
    try:
        rows = conn.execute("SELECT audio_id FROM user_collection ORDER BY created_at DESC").fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()

@router.post("/collection/{file_id}")
def add_to_collection(file_id: int):
    conn = get_db()
    try:
        with conn:
            conn.execute("INSERT OR IGNORE INTO user_collection (audio_id) VALUES (?)", [file_id])
        return {"status": "added", "id": file_id, "in_collection": True}
    finally:
        conn.close()

@router.delete("/collection/{file_id}")
def remove_from_collection(file_id: int):
    conn = get_db()
    try:
        with conn:
            conn.execute("DELETE FROM user_collection WHERE audio_id = ?", [file_id])
            # Also clean up any project assignments for this sound
            conn.execute("DELETE FROM collection_items WHERE audio_id = ?", [file_id])
        return {"status": "removed", "id": file_id, "in_collection": False}
    finally:
        conn.close()

# --- Project Collections Endpoints ---

@router.get("/projects")
def get_projects():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT p.id, p.name, p.description, p.color, p.created_at, COUNT(ci.audio_id) as sound_count
            FROM project_collections p
            LEFT JOIN collection_items ci ON p.id = ci.collection_id
            GROUP BY p.id
            ORDER BY p.name COLLATE NOCASE ASC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/projects")
def create_project(payload: dict = Body(...)):
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name cannot be empty")
    color = payload.get("color", "#f59e0b").strip()
    description = payload.get("description", "").strip()
    conn = get_db()
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO project_collections (name, description, color) VALUES (?, ?, ?)",
                (name, description, color)
            )
            project_id = cursor.lastrowid
        return {
            "status": "success",
            "project": {
                "id": project_id,
                "name": name,
                "description": description,
                "color": color,
                "sound_count": 0
            }
        }
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="A project with this name already exists")
    finally:
        conn.close()

@router.patch("/projects/{project_id}")
def update_project(project_id: int, payload: dict = Body(...)):
    conn = get_db()
    try:
        name = payload.get("name", "").strip() if "name" in payload else None
        color = payload.get("color", "").strip() if "color" in payload else None
        description = payload.get("description", "").strip() if "description" in payload else None

        updates = []
        params = []
        if name is not None:
            if not name:
                raise HTTPException(status_code=400, detail="Project name cannot be empty")
            updates.append("name = ?")
            params.append(name)
        if color is not None:
            updates.append("color = ?")
            params.append(color)
        if description is not None:
            updates.append("description = ?")
            params.append(description)

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        params.append(project_id)
        with conn:
            cursor = conn.execute(
                f"UPDATE project_collections SET {', '.join(updates)} WHERE id = ?",
                params
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Project not found")

        row = conn.execute("""
            SELECT p.id, p.name, p.description, p.color, p.created_at, COUNT(ci.audio_id) as sound_count
            FROM project_collections p
            LEFT JOIN collection_items ci ON p.id = ci.collection_id
            WHERE p.id = ?
            GROUP BY p.id
        """, [project_id]).fetchone()
        return {"status": "success", "project": dict(row)}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="A project with this name already exists")
    finally:
        conn.close()

@router.delete("/projects/{project_id}")
def delete_project(project_id: int):
    conn = get_db()
    try:
        with conn:
            conn.execute("DELETE FROM collection_items WHERE collection_id = ?", [project_id])
            cursor = conn.execute("DELETE FROM project_collections WHERE id = ?", [project_id])
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "success", "deleted_id": project_id}
    finally:
        conn.close()

@router.get("/projects/assignments")
def get_project_assignments():
    conn = get_db()
    try:
        rows = conn.execute("SELECT audio_id, collection_id FROM collection_items").fetchall()
        assignments = {}
        for r in rows:
            aid = r[0]
            cid = r[1]
            if aid not in assignments:
                assignments[aid] = []
            assignments[aid].append(cid)
        return assignments
    finally:
        conn.close()

@router.post("/projects/{project_id}/items/{audio_id}")
def add_item_to_project(project_id: int, audio_id: int):
    conn = get_db()
    try:
        with conn:
            p = conn.execute("SELECT id FROM project_collections WHERE id = ?", [project_id]).fetchone()
            if not p:
                raise HTTPException(status_code=404, detail="Project not found")
            conn.execute(
                "INSERT OR IGNORE INTO collection_items (collection_id, audio_id) VALUES (?, ?)",
                (project_id, audio_id)
            )
            # Ensure sound is also present in user_collection
            conn.execute("INSERT OR IGNORE INTO user_collection (audio_id) VALUES (?)", [audio_id])
        return {"status": "success", "project_id": project_id, "audio_id": audio_id, "assigned": True}
    finally:
        conn.close()

@router.delete("/projects/{project_id}/items/{audio_id}")
def remove_item_from_project(project_id: int, audio_id: int):
    conn = get_db()
    try:
        with conn:
            conn.execute(
                "DELETE FROM collection_items WHERE collection_id = ? AND audio_id = ?",
                (project_id, audio_id)
            )
        return {"status": "success", "project_id": project_id, "audio_id": audio_id, "assigned": False}
    finally:
        conn.close()

@router.get("/categories")
def get_categories():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT category, sub_category, COUNT(*) as count 
            FROM audio_files 
            GROUP BY category 
            ORDER BY count DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.patch("/audio/{file_id}/name")
def update_display_name(file_id: int, payload: dict = Body(...)):
    new_name = payload.get("display_name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="display_name cannot be empty")
        
    conn = get_db()
    try:
        with conn:
            cursor = conn.execute("UPDATE audio_files SET display_name = ? WHERE id = ?", (new_name, file_id))
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Audio file not found")
        return {"status": "success", "id": file_id, "display_name": new_name}
    finally:
        conn.close()

@router.post("/audio/{file_id}/ai-listen")
def ai_listen_audio(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT rel_path, filename FROM audio_files WHERE id = ?", [file_id]).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_path = os.path.join(SFX_DIR, row["rel_path"])
    predicted_name, is_music = predict_smart_name(file_path, row["filename"])
    predictions = classify_audio_sound(file_path, top_k=3)

    with conn:
        conn.execute("UPDATE audio_files SET display_name = ?, is_classified = 1 WHERE id = ?", (predicted_name, file_id))
    conn.close()

    return {
        "status": "success",
        "id": file_id,
        "display_name": predicted_name,
        "is_music": is_music,
        "predictions": predictions
    }
