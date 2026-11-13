import os
import time
from app.db.database import get_db
from app.scanner.tokenizer import tokenize_path
from app.scanner.ucs import match_ucs
from app.scanner.metadata_extractor import extract_metadata
from app.scanner.renamer import generate_smart_name

SUPPORTED_EXTS = {'.wav', '.mp3', '.flac', '.aif', '.aiff', '.ogg'}

scan_status = {
    "is_scanning": False,
    "total_files": 0,
    "processed_files": 0,
    "last_scan_time": None
}

def parse_pack_and_folder(rel_path: str) -> tuple[str, str]:
    parts = rel_path.replace("\\", "/").split("/")
    if len(parts) <= 1:
        return "Loose Files", ""
    pack = parts[0]
    folder = "/".join(parts[1:-1]) if len(parts) > 2 else ""
    return pack, folder

def scan_library(sfx_dir: str):
    global scan_status
    if scan_status["is_scanning"]:
        return
    scan_status["is_scanning"] = True
    scan_status["processed_files"] = 0
    
    conn = get_db()
    try:
        existing = {row["rel_path"]: (row["mtime"], row["pack"]) for row in conn.execute("SELECT rel_path, mtime, pack FROM audio_files").fetchall()}
        
        candidates = []
        for root, _, files in os.walk(sfx_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in SUPPORTED_EXTS:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, sfx_dir)
                    candidates.append((full_path, rel_path, ext, file))

        scan_status["total_files"] = len(candidates)

        batch = []
        for full_path, rel_path, ext, filename in candidates:
            try:
                stat = os.stat(full_path)
                mtime = stat.st_mtime
                size = stat.st_size
                
                pack, folder = parse_pack_and_folder(rel_path)

                if rel_path in existing:
                    old_mtime, old_pack = existing[rel_path]
                    if abs(old_mtime - mtime) < 1.0 and old_pack:
                        scan_status["processed_files"] += 1
                        continue

                tokens = tokenize_path(rel_path)
                cat_code, cat_name = match_ucs(tokens)
                meta = extract_metadata(full_path)
                display_name = generate_smart_name(filename, pack=pack, folder=folder, title=meta["title"])

                batch.append((
                    rel_path,
                    filename,
                    display_name,
                    ext,
                    size,
                    mtime,
                    meta["duration"],
                    meta["sample_rate"],
                    meta["channels"],
                    meta["bit_depth"],
                    cat_code,
                    cat_name,
                    pack,
                    folder,
                    meta["title"],
                    meta["description"],
                    meta["designer"],
                    " ".join(tokens)
                ))

                if len(batch) >= 200:
                    with conn:
                        conn.executemany("""
                            INSERT INTO audio_files (
                                rel_path, filename, display_name, extension, file_size, mtime,
                                duration, sample_rate, channels, bit_depth,
                                category, sub_category, pack, folder, title, description, designer, tokens
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(rel_path) DO UPDATE SET
                                mtime=excluded.mtime,
                                file_size=excluded.file_size,
                                duration=excluded.duration,
                                sample_rate=excluded.sample_rate,
                                channels=excluded.channels,
                                bit_depth=excluded.bit_depth,
                                category=excluded.category,
                                sub_category=excluded.sub_category,
                                pack=excluded.pack,
                                folder=excluded.folder,
                                title=excluded.title,
                                description=excluded.description,
                                designer=excluded.designer,
                                tokens=excluded.tokens;
                        """, batch)
                    batch = []

                scan_status["processed_files"] += 1
            except Exception:
                continue

        if batch:
            with conn:
                conn.executemany("""
                    INSERT INTO audio_files (
                        rel_path, filename, display_name, extension, file_size, mtime,
                        duration, sample_rate, channels, bit_depth,
                        category, sub_category, pack, folder, title, description, designer, tokens
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(rel_path) DO UPDATE SET
                        mtime=excluded.mtime,
                        file_size=excluded.file_size,
                        duration=excluded.duration,
                        sample_rate=excluded.sample_rate,
                        channels=excluded.channels,
                        bit_depth=excluded.bit_depth,
                        category=excluded.category,
                        sub_category=excluded.sub_category,
                        pack=excluded.pack,
                        folder=excluded.folder,
                        title=excluded.title,
                        description=excluded.description,
                        designer=excluded.designer,
                        tokens=excluded.tokens;
                """, batch)

        scan_status["last_scan_time"] = time.time()
    finally:
        scan_status["is_scanning"] = False
        conn.close()
