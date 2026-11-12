import subprocess
import json
import os
import struct

def generate_peaks(audio_path: str, output_path: str, num_peaks: int = 256) -> bool:
    """Extract ~256 normalized peak values (0.0 to 1.0) using ffmpeg downsampling.
    Saves a lightweight JSON file for instant waveform rendering without audio decode lag."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        # Use ffmpeg to output raw 8-bit unsigned PCM audio at low sample rate
        cmd = [
            "ffmpeg", "-v", "quiet",
            "-i", audio_path,
            "-ac", "1",
            "-ar", "4000",
            "-f", "u8",
            "-"
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
        raw_bytes = proc.stdout
        if not raw_bytes:
            return False

        total_samples = len(raw_bytes)
        if total_samples == 0:
            return False

        chunk_size = max(1, total_samples // num_peaks)
        peaks = []
        for i in range(0, min(total_samples, chunk_size * num_peaks), chunk_size):
            chunk = raw_bytes[i:i + chunk_size]
            if not chunk:
                break
            # Find max absolute deviation from center (128 for u8)
            val = max(abs(b - 128) for b in chunk) / 128.0
            peaks.append(round(min(1.0, val), 3))

        # Pad if short
        while len(peaks) < num_peaks:
            peaks.append(0.0)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(peaks, f)
        return True
    except Exception:
        return False
