from app.services.db_adapter import get_db, DbConn
import re
import time
from typing import Optional
from app.core.config import settings

_WIKILINK_RE = re.compile(r'\[\[([^\]]+)\]\]')


def _get_conn() -> DbConn:
    return get_db("notes")



def _now() -> int:
    return int(time.time() * 1000)


def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#6366f1',
            icon        TEXT NOT NULL DEFAULT 'folder',
            parent_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT 'Untitled',
            content     TEXT NOT NULL DEFAULT '',
            folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            kb_id       TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

        CREATE TABLE IF NOT EXISTS note_backlinks (
            source_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            target_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            PRIMARY KEY (source_id, target_id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            title, content,
            content=notes, content_rowid=id,
            tokenize='unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert
        AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_fts_after_update
        AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
            INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete
        AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
        END;
    """)
    conn.commit()
    _run_migrations(conn)
    conn.close()


def _run_migrations(conn: DbConn):
    migrations: list[str] = [
        # Kolom untuk tracking apakah catatan panjang sudah diindex ke chroma notes collection
        "ALTER TABLE notes ADD COLUMN indexed INTEGER NOT NULL DEFAULT 0",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass


# ─── Folders ─────────────────────────────────────────────────────────────────

def list_folders() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM folders ORDER BY sort_order, name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_folder(data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute(
        "INSERT INTO folders (name, color, icon, parent_id, sort_order, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data["name"], data.get("color", "#6366f1"), data.get("icon", "folder"),
         data.get("parent_id"), data.get("sort_order", 0), now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM folders WHERE id=?", (conn.last_insert_id(cur),)).fetchone()
    conn.close()
    return dict(row)


def update_folder(folder_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields, vals = [], []
    for key in ("name", "color", "icon", "parent_id", "sort_order"):
        if key in data and data[key] is not None:
            fields.append(f"{key}=?")
            vals.append(data[key])
    if not fields:
        conn.close()
        return get_folder(folder_id)
    vals += [_now(), folder_id]
    conn.execute(f"UPDATE folders SET {', '.join(fields)}, updated_at=? WHERE id=?", vals)
    conn.commit()
    row = conn.execute("SELECT * FROM folders WHERE id=?", (folder_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_folder(folder_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM folders WHERE id=?", (folder_id,))
    conn.commit()
    conn.close()


def get_folder(folder_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM folders WHERE id=?", (folder_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Notes ───────────────────────────────────────────────────────────────────

def list_notes(folder_id: Optional[int] = None) -> list[dict]:
    conn = _get_conn()
    if folder_id is not None:
        rows = conn.execute(
            "SELECT id, title, folder_id, pinned, kb_id, created_at, updated_at "
            "FROM notes WHERE folder_id=? ORDER BY pinned DESC, updated_at DESC",
            (folder_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, title, folder_id, pinned, kb_id, indexed, created_at, updated_at "
            "FROM notes ORDER BY pinned DESC, updated_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_note(note_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_note(data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    title = data.get("title", "Untitled") or "Untitled"
    content = data.get("content", "") or ""
    cur = conn.execute(
        "INSERT INTO notes (title, content, folder_id, pinned, created_at, updated_at) "
        "VALUES (?, ?, ?, 0, ?, ?)",
        (title, content, data.get("folder_id"), now, now),
    )
    note_id = conn.last_insert_id(cur)
    conn.commit()
    _update_backlinks(conn, note_id, content)
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    conn.close()
    return dict(row)


def update_note(note_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields, vals = [], []
    for key in ("title", "content", "folder_id"):
        if key in data and data[key] is not None:
            fields.append(f"{key}=?")
            vals.append(data[key])
    if "pinned" in data and data["pinned"] is not None:
        fields.append("pinned=?")
        vals.append(1 if data["pinned"] else 0)
    if not fields:
        conn.close()
        return get_note(note_id)
    vals += [_now(), note_id]
    conn.execute(f"UPDATE notes SET {', '.join(fields)}, updated_at=? WHERE id=?", vals)
    conn.commit()
    if "content" in data and data["content"] is not None:
        _update_backlinks(conn, note_id, data["content"])
        conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_note(note_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
    conn.commit()
    conn.close()


# ─── Backlinks ───────────────────────────────────────────────────────────────

def _update_backlinks(conn: DbConn, source_id: int, content: str):
    links = set(_WIKILINK_RE.findall(content))
    conn.execute("DELETE FROM note_backlinks WHERE source_id=?", (source_id,))
    for title in links:
        row = conn.execute(
            "SELECT id FROM notes WHERE title=?", (title.strip(),)
        ).fetchone()
        if row and row["id"] != source_id:
            try:
                conn.execute(
                    "INSERT INTO note_backlinks (source_id, target_id) VALUES (?, ?)",
                    (source_id, row["id"]),
                )
            except Exception:
                pass


def get_backlinks(note_id: int) -> list[dict]:
    """Notes that link TO note_id via [[wikilink]]."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT n.id, n.title, n.updated_at FROM notes n "
        "JOIN note_backlinks bl ON bl.source_id = n.id "
        "WHERE bl.target_id=?",
        (note_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Graph ───────────────────────────────────────────────────────────────────

def get_graph() -> dict:
    conn = _get_conn()
    notes = conn.execute("SELECT id, title FROM notes").fetchall()
    links = conn.execute("SELECT source_id, target_id FROM note_backlinks").fetchall()
    conn.close()
    return {
        "nodes": [{"id": r["id"], "title": r["title"]} for r in notes],
        "links": [{"source": r["source_id"], "target": r["target_id"]} for r in links],
    }


# ─── Search ──────────────────────────────────────────────────────────────────

def search_notes(query: str, limit: int = 30) -> list[dict]:
    conn = _get_conn()
    if conn.dialect == "sqlite":
        rows = conn.execute(
            "SELECT n.id, n.title, n.folder_id, n.updated_at, "
            "snippet(notes_fts, 1, '<mark>', '</mark>', '…', 20) AS excerpt "
            "FROM notes_fts "
            "JOIN notes n ON n.id = notes_fts.rowid "
            "WHERE notes_fts MATCH ? "
            "ORDER BY rank LIMIT ?",
            (query, limit),
        ).fetchall()
    else:
        # PostgreSQL: FTS5 not available — fall back to ILIKE, no snippet
        like = f"%{query}%"
        rows = conn.execute(
            "SELECT id, title, folder_id, updated_at, NULL AS excerpt "
            "FROM notes "
            "WHERE title ILIKE ? OR content ILIKE ? "
            "ORDER BY updated_at DESC LIMIT ?",
            (like, like, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── KB index ────────────────────────────────────────────────────────────────

def set_note_kb(note_id: int, kb_id: Optional[str]):
    conn = _get_conn()
    conn.execute("UPDATE notes SET kb_id=? WHERE id=?", (kb_id, note_id))
    conn.commit()
    conn.close()


def set_note_indexed(note_id: int, indexed: bool):
    conn = _get_conn()
    conn.execute("UPDATE notes SET indexed=? WHERE id=?", (1 if indexed else 0, note_id))
    conn.commit()
    conn.close()
