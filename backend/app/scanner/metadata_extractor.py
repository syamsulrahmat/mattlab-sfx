import subprocess
import json
import os
import wave
import struct

def extract_metadata(file_path: str) -> dict:
    meta = {
        "duration": 0.0,
        "sample_rate": 0,
        "channels": 0,
        "bit_depth": 0,
        "title": "",
        "description": "",
        "designer": ""
    }
    
    # 1. Fast path for standard WAV using native wave module
    if file_path.lower().endswith('.wav'):
        try:
            with wave.open(file_path, 'rb') as w:
                meta["channels"] = w.getnchannels()
                meta["sample_rate"] = w.getframerate()
                meta["bit_depth"] = w.getsampwidth() * 8
                frames = w.getnframes()
                if meta["sample_rate"] > 0:
                    meta["duration"] = round(frames / float(meta["sample_rate"]), 2)
        except Exception:
            pass

    # 2. ffprobe extraction for BWF, iXML, and general metadata
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        file_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res.returncode == 0:
            data = json.loads(res.stdout)
            fmt = data.get("format", {})
            tags = fmt.get("tags", {})
            
            # Duration & rate from streams if not already set
            if meta["duration"] == 0.0 and "duration" in fmt:
                meta["duration"] = round(float(fmt["duration"]), 2)
                
            for s in data.get("streams", []):
                if s.get("codec_type") == "audio":
                    if not meta["sample_rate"]:
                        meta["sample_rate"] = int(s.get("sample_rate", 0))
                    if not meta["channels"]:
                        meta["channels"] = int(s.get("channels", 0))
                    if not meta["bit_depth"]:
                        meta["bit_depth"] = int(s.get("bits_per_sample", 0) or s.get("bits_per_raw_sample", 0) or 0)
                    break
            
            # Common metadata tags (BWF, iXML, ID3)
            meta["title"] = tags.get("title") or tags.get("TITLE") or ""
            meta["description"] = (
                tags.get("comment") or tags.get("description") or 
                tags.get("DESCRIPTION") or tags.get("iXML:DESCRIPTION") or 
                tags.get("commentary") or ""
            )
            meta["designer"] = (
                tags.get("artist") or tags.get("originator") or 
                tags.get("ORIGINATOR") or tags.get("author") or ""
            )
    except Exception:
        pass

    return meta
