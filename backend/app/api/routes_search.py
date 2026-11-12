import os
from fastapi import APIRouter, Query
from app.db.database import get_db

router = APIRouter()
SMB_BASE_PATH = os.environ.get("SMB_BASE_PATH", r"\\MATTLAB\Assets\Sound effects")

@router.get("/search")
def search_sfx(
    q: str = Query("", description="Search query terms"),
    category: str = Query("", description="UCS Category Filter"),
    pack: str = Query("", description="Sound Pack Filter"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    conn = get_db()
    try:
        terms = q.strip().replace('"', '""')
        params = []
        
        if terms:
            # FTS5 Prefix matching for instant typing
            fts_query = " ".join([f'"{t}"*' for t in terms.split()])
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

            if pack:
                base_sql += " AND a.pack = ?"
                params.append(pack)
                
            base_sql += " ORDER BY rank LIMIT ? OFFSET ?"
            params.extend([limit, offset])
        else:
            base_sql = "SELECT * FROM audio_files"
            conditions = []
            if category:
                conditions.append("category = ?")
                params.append(category)
            if pack:
                conditions.append("pack = ?")
                params.append(pack)

            if conditions:
                base_sql += " WHERE " + " AND ".join(conditions)

            base_sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

        cursor = conn.execute(base_sql, params)
        results = []
        for r in cursor.fetchall():
            item = dict(r)
            win_path = f"{SMB_BASE_PATH}\\{item['rel_path'].replace('/', chr(92))}"
            item["smb_path"] = win_path
            results.append(item)

        # Count total
        if terms:
            count_sql = """
                SELECT COUNT(*) FROM audio_files a
                JOIN audio_fts ON a.id = audio_fts.rowid
                WHERE audio_fts MATCH ?
            """
            count_params = [fts_query]
            if category:
                count_sql += " AND a.category = ?"
                count_params.append(category)
            if pack:
                count_sql += " AND a.pack = ?"
                count_params.append(pack)
            total = conn.execute(count_sql, count_params).fetchone()[0]
        else:
            count_sql = "SELECT COUNT(*) FROM audio_files"
            count_params = []
            if conditions:
                count_sql += " WHERE " + " AND ".join(conditions)
                count_params.extend(params[:-2]) # Exclude limit and offset
            total = conn.execute(count_sql, count_params).fetchone()[0]

        return {
            "results": results,
            "total": total,
            "limit": limit,
            "offset": offset
        }
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

@router.get("/packs")
def get_packs():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT pack, COUNT(*) as count 
            FROM audio_files 
            WHERE pack != ''
            GROUP BY pack 
            ORDER BY count DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
