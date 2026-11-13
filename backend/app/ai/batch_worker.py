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
    "current_file": "",
    "last_result": ""
}

def _classify_worker():
    global ai_task_status
    conn = get_db()
    try:
        # Find all files whose display_name is still a fallback hash or generic
        rows = conn.execute("""
            SELECT id, rel_path, filename 
            FROM audio_files 
            WHERE display_name LIKE 'Sound #%' OR filename GLOB '[a-fA-F0-9][a-fA-F0-9][a-fA-F0-9][a-fA-F0-9][a-fA-F0-9]*'
            ORDER BY id ASC
        """).fetchall()

        ai_task_status["total"] = len(rows)
        ai_task_status["processed"] = 0

        for r in rows:
            if not ai_task_status["is_running"]:
                break

            file_id = r["id"]
            rel_path = r["rel_path"]
            full_path = os.path.join(SFX_DIR, rel_path)

            ai_task_status["current_file"] = r["filename"]

            if os.path.exists(full_path):
                try:
                    smart_name = predict_smart_name(full_path)
                    if smart_name and smart_name != "Unknown Sound":
                        with conn:
                            conn.execute("UPDATE audio_files SET display_name = ? WHERE id = ?", (smart_name, file_id))
                        ai_task_status["last_result"] = f"{r['filename'][:8]} -> {smart_name}"
                except Exception as e:
                    print(f"Error classifying {rel_path}: {e}")

            ai_task_status["processed"] += 1
            time.sleep(0.05) # Prevent CPU starvation

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
