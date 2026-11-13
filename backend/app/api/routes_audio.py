import os
import json
import hashlib
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from app.db.database import get_db
from app.scanner.peak_generator import generate_peaks

router = APIRouter()
SFX_DIR = os.environ.get("SFX_DIR", "/sfx")
PEAKS_DIR = os.environ.get("PEAKS_DIR", "/peaks")

@router.get("/stream/{file_id}")
async def stream_audio(file_id: int, request: Request):
    conn = get_db()
    row = conn.execute("SELECT rel_path FROM audio_files WHERE id = ?", [file_id]).fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    file_path = os.path.join(SFX_DIR, row["rel_path"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    stat = os.stat(file_path)
    file_size = stat.st_size
    range_header = request.headers.get("range")

    # Native HTTP 206 Partial Content range streaming for zero-delay browser playback
    if range_header:
        range_val = range_header.replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        length = end - start + 1

        with open(file_path, "rb") as f:
            f.seek(start)
            data = f.read(length)

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": "audio/wav" if file_path.endswith(".wav") else "audio/mpeg"
        }
        return Response(content=data, status_code=206, headers=headers)

    return FileResponse(file_path)

@router.get("/download/{file_id}")
def download_audio(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT filename, display_name, rel_path FROM audio_files WHERE id = ?", [file_id]).fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    file_path = os.path.join(SFX_DIR, row["rel_path"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        path=file_path,
        filename=row["filename"],
        media_type="application/octet-stream"
    )

@router.get("/peaks/{file_id}")
def get_peaks(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT rel_path FROM audio_files WHERE id = ?", [file_id]).fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Audio file not found")

    rel_hash = hashlib.md5(row["rel_path"].encode('utf-8')).hexdigest()
    peak_file = os.path.join(PEAKS_DIR, f"{rel_hash}.json")

    # If peak file already cached, return immediately (<1ms)
    if os.path.exists(peak_file):
        with open(peak_file, "r") as f:
            return json.load(f)

    # Otherwise generate on-the-fly and cache
    audio_full_path = os.path.join(SFX_DIR, row["rel_path"])
    if os.path.exists(audio_full_path):
        success = generate_peaks(audio_full_path, peak_file)
        if success and os.path.exists(peak_file):
            with open(peak_file, "r") as f:
                return json.load(f)

    return [0.0] * 128
