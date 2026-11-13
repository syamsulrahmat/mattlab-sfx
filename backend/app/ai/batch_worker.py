import os
import time
import threading
from app.db.database import get_db
from app.ai.audio_listener import predict_smart_name

SFX_DIR = os.environ.get("SFX_DIR", "/sfx")

ai_task_status = {
    "is_running": False,
    "total": 0,
    "processed": 0,
    "remaining": 0,
    "current_file": "",
    "last_result": ""
}

def _classify_worker():
    global ai_task_status
    conn = get_db()
    try:
        # Get total files in library and total already classified
        total_in_db = conn.execute("SELECT COUNT(*) FROM audio_files").fetchone()[0]
        already_classified = conn.execute("SELECT COUNT(*) FROM audio_files WHERE is_classified = 1").fetchone()[0]

        ai_task_status["total"] = total_in_db
        ai_task_status["processed"] = already_classified
        ai_task_status["remaining"] = total_in_db - already_classified

        # Query unclassified files, prioritizing cryptic hash/sound files first
        rows = conn.execute("""
            SELECT id, rel_path, filename, duration, category 
            FROM audio_files 
            WHERE is_classified = 0
            ORDER BY 
                CASE 
                    WHEN display_name LIKE 'Sound #%' OR filename GLOB '[a-fA-F0-9][a-fA-F0-9][a-fA-F0-9][a-fA-F0-9][a-fA-F0-9]*' THEN 0 
                    ELSE 1 
                END, 
                id ASC
        """).fetchall()

        batch_count = 0
        for r in rows:
            if not ai_task_status["is_running"]:
                break

            file_id = r["id"]
            rel_path = r["rel_path"]
            filename = r["filename"]
            full_path = os.path.join(SFX_DIR, rel_path)

            ai_task_status["current_file"] = filename

            if os.path.exists(full_path):
                try:
                    smart_name, is_music = predict_smart_name(full_path, filename)
                    if smart_name and smart_name != "Unknown Sound":
                        if is_music:
                            conn.execute("""
                                UPDATE audio_files 
                                SET display_name = ?, 
                                    category = CASE WHEN category = '' OR category = 'MISC' THEN 'MUS' ELSE category END,
                                    is_classified = 1 
                                WHERE id = ?
                            """, (smart_name, file_id))
                        else:
                            conn.execute("""
                                UPDATE audio_files 
                                SET display_name = ?, 
                                    is_classified = 1 
                                WHERE id = ?
                            """, (smart_name, file_id))

                        ai_task_status["last_result"] = f"{smart_name}"
                        batch_count += 1
                        if batch_count % 10 == 0:
                            conn.commit()
                except Exception as e:
                    print(f"Error classifying {rel_path}: {e}")

            ai_task_status["processed"] += 1
            if ai_task_status["remaining"] > 0:
                ai_task_status["remaining"] -= 1

            time.sleep(0.02) # Prevent CPU starvation

        conn.commit()

    finally:
        ai_task_status["is_running"] = False
        conn.close()

def start_ai_classification():
    global ai_task_status
    if ai_task_status["is_running"]:
        return False
    ai_task_status["is_running"] = True
    t = threading.Thread(target=_classify_worker, daemon=True)
    t.start()
    return True

def stop_ai_classification():
    global ai_task_status
    ai_task_status["is_running"] = False
    return True
