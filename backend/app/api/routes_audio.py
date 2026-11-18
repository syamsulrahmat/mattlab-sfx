import os
import json
import hashlib
import subprocess
import tempfile
import shutil
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Query, UploadFile, File
from fastapi.responses import FileResponse, Response
from app.db.database import get_db
from app.scanner.peak_generator import generate_peaks

router = APIRouter()
SFX_DIR = os.environ.get("SFX_DIR", "/sfx")
PEAKS_DIR = os.environ.get("PEAKS_DIR", "/peaks")

def cleanup_file(path: str):
    """Safely remove temporary slice file after client download completes."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

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
def download_audio(
    file_id: int,
    background_tasks: BackgroundTasks,
    start: Optional[float] = Query(None, description="Trim start position in seconds"),
    end: Optional[float] = Query(None, description="Trim end position in seconds")
):
    conn = get_db()
    row = conn.execute("SELECT filename, display_name, rel_path, duration FROM audio_files WHERE id = ?", [file_id]).fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    file_path = os.path.join(SFX_DIR, row["rel_path"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    orig_filename = row["filename"]
    base_name, ext = os.path.splitext(orig_filename)

    # Standard full download if no trim range is specified
    if start is None or end is None or end <= start:
        return FileResponse(
            path=file_path,
            filename=orig_filename,
            media_type="application/octet-stream"
        )

    # Clamp parameters
    start = max(0.0, float(start))
    if row["duration"] and row["duration"] > 0:
        end = min(float(row["duration"]), float(end))
    else:
        end = float(end)

    if (end - start) < 0.1:
        return FileResponse(
            path=file_path,
            filename=orig_filename,
            media_type="application/octet-stream"
        )

    start_str = f"{start:.2f}".rstrip("0").rstrip(".")
    end_str = f"{end:.2f}".rstrip("0").rstrip(".")
    trimmed_filename = f"{base_name}_trim_{start_str}s-{end_str}s{ext}"

    # Generate temporary sliced file for download
    temp_dir = tempfile.gettempdir()
    temp_file = tempfile.NamedTemporaryFile(dir=temp_dir, suffix=ext, delete=False)
    temp_path = temp_file.name
    temp_file.close()

    try:
        # Fast lossless stream slice
        cmd = [
            "ffmpeg", "-v", "error", "-y",
            "-ss", str(start),
            "-to", str(end),
            "-i", file_path,
            "-c", "copy",
            temp_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10)
        # Fallback to high-quality re-encode if stream copy fails on audio boundary
        if res.returncode != 0 or not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            cmd_reencode = [
                "ffmpeg", "-v", "error", "-y",
                "-ss", str(start),
                "-to", str(end),
                "-i", file_path,
                temp_path
            ]
            subprocess.run(cmd_reencode, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)

        if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            cleanup_file(temp_path)
            raise HTTPException(status_code=500, detail="Failed to slice audio")

        background_tasks.add_task(cleanup_file, temp_path)
        return FileResponse(
            path=temp_path,
            filename=trimmed_filename,
            media_type="application/octet-stream",
            background=background_tasks
        )
    except Exception as e:
        cleanup_file(temp_path)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error trimming audio: {e}")

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

logger = logging.getLogger("uvicorn.error")

@router.post("/studio/mux-video")
async def mux_studio_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    audio: UploadFile = File(...)
):
    """
    Lossless video multiplexing: merges client-designed audio mixdown WAV
    with user's original video file using FFmpeg stream copy.
    """
    logger.info(f"[Studio Mux] Received mux request: video='{video.filename}', audio='{audio.filename}'")
    temp_dir = tempfile.gettempdir()
    
    # Save input video to temp
    video_ext = os.path.splitext(video.filename or "")[1] or ".mp4"
    temp_video = tempfile.NamedTemporaryFile(dir=temp_dir, suffix=video_ext, delete=False)
    temp_video_path = temp_video.name
    temp_video.close()
    
    # Save input audio to temp
    temp_audio = tempfile.NamedTemporaryFile(dir=temp_dir, suffix=".wav", delete=False)
    temp_audio_path = temp_audio.name
    temp_audio.close()
    
    # Output file
    temp_out = tempfile.NamedTemporaryFile(dir=temp_dir, suffix=".mp4", delete=False)
    temp_out_path = temp_out.name
    temp_out.close()
    
    try:
        with open(temp_video_path, "wb") as f:
            shutil.copyfileobj(video.file, f)
            
        with open(temp_audio_path, "wb") as f:
            shutil.copyfileobj(audio.file, f)
            
        vid_size = os.path.getsize(temp_video_path)
        aud_size = os.path.getsize(temp_audio_path)
        logger.info(f"[Studio Mux] Inputs stored: video={vid_size / 1024 / 1024:.2f}MB, audio={aud_size / 1024 / 1024:.2f}MB")

        # Fast multiplex: copy video stream without re-encoding, encode audio as high-bitrate AAC
        cmd = [
            "ffmpeg", "-v", "warning", "-y",
            "-i", temp_video_path,
            "-i", temp_audio_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "320k",
            "-movflags", "+faststart",
            "-shortest",
            temp_out_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        
        # Fallback if container stream copy fails on codecs/format
        if res.returncode != 0 or not os.path.exists(temp_out_path) or os.path.getsize(temp_out_path) == 0:
            err_msg = res.stderr.decode("utf-8", errors="ignore") if res.stderr else "Unknown error"
            logger.warning(f"[Studio Mux] Fast stream-copy muxing failed (rc={res.returncode}): {err_msg.strip()}. Falling back to libx264 transcoding...")
            cmd_fallback = [
                "ffmpeg", "-v", "warning", "-y",
                "-i", temp_video_path,
                "-i", temp_audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "20",
                "-c:a", "aac",
                "-b:a", "320k",
                "-movflags", "+faststart",
                "-shortest",
                temp_out_path
            ]
            res_fallback = subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
            if res_fallback.returncode != 0:
                fb_err = res_fallback.stderr.decode("utf-8", errors="ignore") if res_fallback.stderr else ""
                logger.error(f"[Studio Mux] Fallback transcoding also failed (rc={res_fallback.returncode}): {fb_err.strip()}")
            
        if not os.path.exists(temp_out_path) or os.path.getsize(temp_out_path) == 0:
            cleanup_file(temp_video_path)
            cleanup_file(temp_audio_path)
            cleanup_file(temp_out_path)
            raise HTTPException(status_code=500, detail="Failed to multiplex video and audio with FFmpeg")
            
        out_size = os.path.getsize(temp_out_path)
        logger.info(f"[Studio Mux] Multiplexing complete! Output size: {out_size / 1024 / 1024:.2f}MB")

        background_tasks.add_task(cleanup_file, temp_video_path)
        background_tasks.add_task(cleanup_file, temp_audio_path)
        background_tasks.add_task(cleanup_file, temp_out_path)
        
        base_name = os.path.splitext(video.filename or "video")[0]
        output_filename = f"{base_name}_sound_designed.mp4"
        
        return FileResponse(
            path=temp_out_path,
            filename=output_filename,
            media_type="video/mp4",
            background=background_tasks
        )
    except Exception as e:
        logger.error(f"[Studio Mux] Exception during multiplexing: {e}", exc_info=True)
        cleanup_file(temp_video_path)
        cleanup_file(temp_audio_path)
        cleanup_file(temp_out_path)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error multiplexing video: {e}")
