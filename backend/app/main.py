import os
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db.database import init_db
from app.api.routes_search import router as search_router
from app.api.routes_audio import router as audio_router
from app.scanner.crawler import scan_library, scan_status
from app.ai.batch_worker import start_ai_classification, stop_ai_classification, ai_task_status

app = FastAPI(title="MattLab SFX API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(search_router, prefix="/api")
app.include_router(audio_router, prefix="/api")

@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks):
    sfx_dir = os.environ.get("SFX_DIR", "/sfx")
    background_tasks.add_task(scan_library, sfx_dir)
    return {"status": "scan initiated"}

@app.get("/api/scan/status")
def get_status():
    return scan_status

@app.post("/api/ai/start")
def start_ai():
    started = start_ai_classification()
    return {"status": "started" if started else "already running"}

@app.post("/api/ai/stop")
def stop_ai():
    stop_ai_classification()
    return {"status": "stopped"}

@app.get("/api/ai/status")
def get_ai_status():
    return ai_task_status

# Serve frontend production build if present
frontend_dist = "/app/frontend_dist"
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
