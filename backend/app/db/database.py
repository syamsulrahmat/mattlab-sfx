import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "/data/sfx.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-64000;") # 64MB cache
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audio_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rel_path TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mtime REAL NOT NULL,
                duration REAL DEFAULT 0,
                sample_rate INTEGER DEFAULT 0,
                channels INTEGER DEFAULT 0,
                bit_depth INTEGER DEFAULT 0,
                category TEXT DEFAULT '',
                sub_category TEXT DEFAULT '',
                title TEXT DEFAULT '',
                description TEXT DEFAULT '',
                designer TEXT DEFAULT '',
                tokens TEXT DEFAULT '',
                has_peaks INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Virtual table for Sub-millisecond Full-Text Search
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS audio_fts USING fts5(
                filename,
                tokens,
                description,
                category,
                sub_category,
                designer,
                content='audio_files',
                content_rowid='id',
                tokenize='unicode61 remove_diacritics 2'
            );
        """)

        # Triggers to keep FTS index synchronized
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS audio_ai AFTER INSERT ON audio_files BEGIN
                INSERT INTO audio_fts(rowid, filename, tokens, description, category, sub_category, designer)
                VALUES (new.id, new.filename, new.tokens, new.description, new.category, new.sub_category, new.designer);
            END;
        """)

        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS audio_ad AFTER DELETE ON audio_files BEGIN
                INSERT INTO audio_fts(audio_fts, rowid, filename, tokens, description, category, sub_category, designer)
                VALUES('delete', old.id, old.filename, old.tokens, old.description, old.category, old.sub_category, old.designer);
            END;
        """)

        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS audio_au AFTER UPDATE ON audio_files BEGIN
                INSERT INTO audio_fts(audio_fts, rowid, filename, tokens, description, category, sub_category, designer)
                VALUES('delete', old.id, old.filename, old.tokens, old.description, old.category, old.sub_category, old.designer);
                INSERT INTO audio_fts(rowid, filename, tokens, description, category, sub_category, designer)
                VALUES (new.id, new.filename, new.tokens, new.description, new.category, new.sub_category, new.designer);
            END;
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_rel_path ON audio_files(rel_path);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_category ON audio_files(category);")
    conn.close()
