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
                display_name TEXT DEFAULT '',
                extension TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mtime REAL NOT NULL,
                duration REAL DEFAULT 0,
                sample_rate INTEGER DEFAULT 0,
                channels INTEGER DEFAULT 0,
                bit_depth INTEGER DEFAULT 0,
                category TEXT DEFAULT '',
                sub_category TEXT DEFAULT '',
                pack TEXT DEFAULT '',
                folder TEXT DEFAULT '',
                title TEXT DEFAULT '',
                description TEXT DEFAULT '',
                designer TEXT DEFAULT '',
                tokens TEXT DEFAULT '',
                has_peaks INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Migration: Add columns if table existed prior
        cols = [c[1] for c in conn.execute("PRAGMA table_info(audio_files)").fetchall()]
        if "pack" not in cols:
            conn.execute("ALTER TABLE audio_files ADD COLUMN pack TEXT DEFAULT '';")
        if "folder" not in cols:
            conn.execute("ALTER TABLE audio_files ADD COLUMN folder TEXT DEFAULT '';")
        if "display_name" not in cols:
            conn.execute("ALTER TABLE audio_files ADD COLUMN display_name TEXT DEFAULT '';")
        if "is_classified" not in cols:
            conn.execute("ALTER TABLE audio_files ADD COLUMN is_classified INTEGER DEFAULT 0;")
        
        # Virtual table for Sub-millisecond Full-Text Search
        conn.execute("DROP TABLE IF EXISTS audio_fts;")
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS audio_fts USING fts5(
                filename,
                display_name,
                tokens,
                pack,
                folder,
                description,
                category,
                sub_category,
                designer,
                content='audio_files',
                content_rowid='id',
                tokenize='unicode61 remove_diacritics 2'
            );
        """)

        # Re-create triggers
        conn.execute("DROP TRIGGER IF EXISTS audio_ai;")
        conn.execute("""
            CREATE TRIGGER audio_ai AFTER INSERT ON audio_files BEGIN
                INSERT INTO audio_fts(rowid, filename, display_name, tokens, pack, folder, description, category, sub_category, designer)
                VALUES (new.id, new.filename, new.display_name, new.tokens, new.pack, new.folder, new.description, new.category, new.sub_category, new.designer);
            END;
        """)

        conn.execute("DROP TRIGGER IF EXISTS audio_ad;")
        conn.execute("""
            CREATE TRIGGER audio_ad AFTER DELETE ON audio_files BEGIN
                INSERT INTO audio_fts(audio_fts, rowid, filename, display_name, tokens, pack, folder, description, category, sub_category, designer)
                VALUES('delete', old.id, old.filename, old.display_name, old.tokens, old.pack, old.folder, old.description, old.category, old.sub_category, old.designer);
            END;
        """)

        conn.execute("DROP TRIGGER IF EXISTS audio_au;")
        conn.execute("""
            CREATE TRIGGER audio_au AFTER UPDATE ON audio_files BEGIN
                INSERT INTO audio_fts(audio_fts, rowid, filename, display_name, tokens, pack, folder, description, category, sub_category, designer)
                VALUES('delete', old.id, old.filename, old.display_name, old.tokens, old.pack, old.folder, old.description, old.category, old.sub_category, old.designer);
                INSERT INTO audio_fts(rowid, filename, display_name, tokens, pack, folder, description, category, sub_category, designer)
                VALUES (new.id, new.filename, new.display_name, new.tokens, new.pack, new.folder, new.description, new.category, new.sub_category, new.designer);
            END;
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_rel_path ON audio_files(rel_path);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_category ON audio_files(category);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audio_pack ON audio_files(pack);")

        # User personal collection table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_collection (
                audio_id INTEGER PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(audio_id) REFERENCES audio_files(id) ON DELETE CASCADE
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_collection_created ON user_collection(created_at);")

        # Repopulate FTS index if audio_files has rows
        conn.execute("""
            INSERT INTO audio_fts(rowid, filename, display_name, tokens, pack, folder, description, category, sub_category, designer)
            SELECT id, filename, display_name, tokens, pack, folder, description, category, sub_category, designer FROM audio_files;
        """)

    conn.close()
