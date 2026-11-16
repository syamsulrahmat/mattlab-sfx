import os

# Limit CPU inference threads to 1 core globally on boot to prevent host contention
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["TORCH_NUM_THREADS"] = "1"

from fastapi import FastAPI, BackgroundTasks, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db.database import init_db, get_db, get_setting, set_setting
from app.api.routes_search import router as search_router
from app.api.routes_audio import router as audio_router
from app.api.routes_auth import router as auth_router
from app.auth import require_admin
from app.scanner.crawler import scan_library, scan_status
from app.ai.batch_worker import (
    start_ai_classification,
    stop_ai_classification,
    ai_task_status,
    record_user_activity,
    evaluate_cpu_governor,
)

app = FastAPI(title="MattLab SFX API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Automated background polling paths that should NOT count as active user interaction
IGNORED_ACTIVITY_PATHS = {
    "/api/ai/status",
    "/api/scan/status",
    "/api/categories",
    "/api/auth/me",
}

@app.middleware("http")
async def track_user_activity_middleware(request: Request, call_next):
    path = request.url.path
    if not any(path.startswith(p) for p in IGNORED_ACTIVITY_PATHS):
        record_user_activity()
    return await call_next(request)

@app.on_event("startup")
def on_startup():
    init_db()
    # Check if AI crawler was previously active and should auto-resume
    if get_setting("ai_crawler_enabled", "0") == "1":
        try:
            conn = get_db()
            remaining = conn.execute("SELECT COUNT(*) FROM audio_files WHERE is_classified = 0").fetchone()[0]
            conn.close()
            if remaining > 0:
                print(f"[Auto-Resume] Automatically resuming AI acoustic classification ({remaining} tracks remaining)...", flush=True)
                start_ai_classification(save_state=False)
            else:
                set_setting("ai_crawler_enabled", "0")
        except Exception as e:
            print(f"[Auto-Resume] Error checking unclassified files: {e}", flush=True)

app.include_router(auth_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(audio_router, prefix="/api")

@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks, current_admin: dict = Depends(require_admin)):
    sfx_dir = os.environ.get("SFX_DIR", "/sfx")
    background_tasks.add_task(scan_library, sfx_dir)
    return {"status": "scan initiated"}

@app.get("/api/scan/status")
def get_status():
    return scan_status

@app.post("/api/ai/start")
def start_ai(current_admin: dict = Depends(require_admin)):
    started = start_ai_classification()
    return {"status": "started" if started else "already running"}

@app.post("/api/ai/stop")
def stop_ai(current_admin: dict = Depends(require_admin)):
    stop_ai_classification()
    return {"status": "stopped"}

@app.get("/api/ai/status")
def get_ai_status():
    if not ai_task_status.get("is_running"):
        try:
            conn = get_db()
            total = conn.execute("SELECT COUNT(*) FROM audio_files").fetchone()[0]
            classified = conn.execute("SELECT COUNT(*) FROM audio_files WHERE is_classified = 1").fetchone()[0]
            conn.close()
            ai_task_status["total"] = total
            ai_task_status["processed"] = classified
            ai_task_status["remaining"] = total - classified
            
            # Predict the governor mode that will engage if started now
            mode, threads, _, load_pct = evaluate_cpu_governor()
            ai_task_status["governor_mode"] = mode
            ai_task_status["active_threads"] = threads
            ai_task_status["server_load_pct"] = load_pct
        except Exception:
            pass
    return ai_task_status

# Serve frontend production build if present
frontend_dist = "/app/frontend_dist"
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
