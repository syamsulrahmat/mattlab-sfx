import os
import time
import threading
import gc
from app.db.database import get_db
from app.ai.audio_listener import predict_smart_name

SFX_DIR = os.environ.get("SFX_DIR", "/sfx")

# User activity tracker: timestamp of latest in-app action (audio play, search, etc.)
_last_user_activity = 0.0

def record_user_activity():
    """Call whenever real user interaction happens (audio streaming, searching, downloading)."""
    global _last_user_activity
    _last_user_activity = time.time()

def get_last_user_activity() -> float:
    return _last_user_activity

def evaluate_cpu_governor() -> tuple[str, int, float, int]:
    """
    Evaluates host-wide load and recent in-app user activity to determine governor tier:
    Returns (mode, num_threads, sleep_gap, server_load_pct)
      - "turbo": 4 threads (or cpu_count), 0.0s yield
      - "balanced": 2 threads, 0.03s yield
      - "eco": 1 thread, 0.10s yield
    """
    total_cpus = os.cpu_count() or 4
    server_load_pct = 0
    try:
        load1, _, _ = os.getloadavg()
        normalized_load = load1 / max(1, total_cpus)
        server_load_pct = min(100, round(normalized_load * 100))
    except Exception:
        normalized_load = 0.2
        server_load_pct = 20

    time_since_user = time.time() - _last_user_activity
    user_active_recently = time_since_user < 300  # within last 5 minutes

    if user_active_recently or normalized_load > 0.65:
        # Eco mode: preserve host responsiveness, prevent audio jitter
        mode = "eco"
        threads = 1
        sleep_gap = 0.10
    elif normalized_load > 0.30:
        # Balanced mode: moderate background speed
        mode = "balanced"
        threads = min(2, total_cpus)
        sleep_gap = 0.03
    else:
        # Turbo mode: maximum speed on idle server
        mode = "turbo"
        threads = min(4, total_cpus)
        sleep_gap = 0.0

    return mode, threads, sleep_gap, server_load_pct

ai_task_status = {
    "is_running": False,
    "total": 0,
    "processed": 0,
    "remaining": 0,
    "current_file": "",
    "last_result": "",
    "governor_mode": "idle",
    "active_threads": 1,
    "server_load_pct": 0,
}

def _classify_worker():
    global ai_task_status

    # Initial safety throttling
    try:
        import torch
        torch.set_num_threads(1)
        try:
            torch.set_num_interop_threads(1)
        except Exception:
            pass
    except Exception:
        pass
    try:
        os.nice(15)
    except Exception:
        pass

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
        sleep_gap = 0.05
        current_threads = 1

        for r in rows:
            if not ai_task_status["is_running"]:
                break

            # Re-evaluate CPU governor dynamically every 5 items
            if batch_count % 5 == 0:
                mode, target_threads, sleep_gap, load_pct = evaluate_cpu_governor()
                ai_task_status["governor_mode"] = mode
                ai_task_status["active_threads"] = target_threads
                ai_task_status["server_load_pct"] = load_pct
                if target_threads != current_threads:
                    try:
                        import torch
                        torch.set_num_threads(target_threads)
                        current_threads = target_threads
                    except Exception:
                        pass

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
                        if batch_count % 30 == 0:
                            gc.collect()
                    else:
                        conn.execute("UPDATE audio_files SET is_classified = 1 WHERE id = ?", (file_id,))
                except Exception as e:
                    print(f"Error classifying {rel_path}: {e}", flush=True)
                    conn.execute("UPDATE audio_files SET is_classified = 1 WHERE id = ?", (file_id,))
            else:
                conn.execute("UPDATE audio_files SET is_classified = 1 WHERE id = ?", (file_id,))

            ai_task_status["processed"] += 1
            if ai_task_status["remaining"] > 0:
                ai_task_status["remaining"] -= 1

            if sleep_gap > 0:
                time.sleep(sleep_gap)

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
