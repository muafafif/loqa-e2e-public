from app.services.db_adapter import get_db, DbConn
import uuid
import time
import json
from typing import Optional
from app.core.config import settings



def _get_conn() -> DbConn:
    return get_db("conversations")



def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT,
            kb_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            locked INTEGER NOT NULL DEFAULT 0,
            chat_mode TEXT NOT NULL DEFAULT 'rag'
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conv_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            citations TEXT,
            created_at INTEGER NOT NULL,
            failed INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS conv_fts USING fts5(
            conv_id UNINDEXED,
            content,
            content='messages',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO conv_fts(rowid, conv_id, content)
            VALUES (new.rowid, new.conv_id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO conv_fts(conv_fts, rowid, conv_id, content)
            VALUES ('delete', old.rowid, old.conv_id, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
            INSERT INTO conv_fts(conv_fts, rowid, conv_id, content)
            VALUES ('delete', old.rowid, old.conv_id, old.content);
            INSERT INTO conv_fts(rowid, conv_id, content)
            VALUES (new.rowid, new.conv_id, new.content);
        END;
    """)
    # Migrations for older schemas
    for migration in [
        "ALTER TABLE conversations ADD COLUMN locked INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE conversations ADD COLUMN chat_mode TEXT NOT NULL DEFAULT 'rag'",
        "ALTER TABLE messages ADD COLUMN failed INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE conversations ADD COLUMN pocket_id INTEGER",
        "CREATE INDEX IF NOT EXISTS idx_conv_pocket ON conversations(pocket_id)",
        "ALTER TABLE conversations ADD COLUMN persona_prompt TEXT",
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except Exception:
            pass
    conn.close()


# ── Crypto helpers ─────────────────────────────────────────────────────────────

def _encrypt_content(text: str, key: bytes) -> str:
    from app.services.crypto_service import encrypt
    return encrypt(text, key)


def _decrypt_content(ciphertext: str, key: bytes) -> str:
    from app.services.crypto_service import decrypt
    return decrypt(ciphertext, key)


def _maybe_encrypt(text: str, key: Optional[bytes]) -> str:
    if key is None or not text:
        return text
    return _encrypt_content(text, key)


def _maybe_decrypt(text: str, key: Optional[bytes], is_locked: bool) -> str:
    if not is_locked or key is None or not text:
        return text
    try:
        return _decrypt_content(text, key)
    except Exception:
        return "[🔒 Terkunci — masukkan PIN untuk membaca]"


# ── Conversation CRUD ─────────────────────────────────────────────────────────

def create_conversation(first_message: str, kb_id: Optional[str] = None, locked: bool = False, chat_mode: str = "rag", pocket_id: Optional[int] = None) -> dict:
    conv_id = str(uuid.uuid4())
    title = first_message[:60].strip()
    if len(first_message) > 60:
        title += "…"
    now = int(time.time() * 1000)
    conn = _get_conn()
    conn.execute(
        "INSERT INTO conversations(id, title, kb_id, created_at, updated_at, locked, chat_mode, pocket_id) VALUES (?,?,?,?,?,?,?,?)",
        (conv_id, title, kb_id, now, now, 1 if locked else 0, chat_mode, pocket_id),
    )
    conn.commit()
    conn.close()
    return {"id": conv_id, "title": title, "kb_id": kb_id, "created_at": now, "updated_at": now, "pinned": 0, "locked": int(locked), "chat_mode": chat_mode, "pocket_id": pocket_id}


def list_conversations(limit: int = 100, offset: int = 0, chat_mode: Optional[str] = None, pocket_id: Optional[int] = None, kb_id: Optional[str] = None, exclude_mode: Optional[str] = None) -> list[dict]:
    where = []
    params: list = []
    if chat_mode:
        where.append("chat_mode=?"); params.append(chat_mode)
    if exclude_mode:
        where.append("chat_mode!=?"); params.append(exclude_mode)
    if pocket_id is not None:
        where.append("pocket_id=?"); params.append(pocket_id)
    if kb_id is not None:
        where.append("kb_id=?"); params.append(kb_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])
    conn = _get_conn()
    rows = conn.execute(
        f"SELECT id, title, kb_id, created_at, updated_at, pinned, locked, chat_mode, pocket_id FROM conversations "
        f"{where_sql} ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_conversations(query: str, chat_mode: Optional[str] = None, pocket_id: Optional[int] = None, kb_id: Optional[str] = None, exclude_mode: Optional[str] = None) -> list[dict]:
    conn = _get_conn()
    extra_filters = []
    extra_params = []
    if chat_mode:
        extra_filters.append("c.chat_mode=?"); extra_params.append(chat_mode)
    if exclude_mode:
        extra_filters.append("c.chat_mode!=?"); extra_params.append(exclude_mode)
    if pocket_id is not None:
        extra_filters.append("c.pocket_id=?"); extra_params.append(pocket_id)
    if kb_id is not None:
        extra_filters.append("c.kb_id=?"); extra_params.append(kb_id)
    extra_sql = ("AND " + " AND ".join(extra_filters)) if extra_filters else ""

    if conn.dialect == "sqlite":
        params = [query + "*", f"%{query}%"] + extra_params
        sql = f"""
            SELECT DISTINCT c.id, c.title, c.kb_id, c.created_at, c.updated_at, c.pinned, c.locked, c.chat_mode, c.pocket_id
            FROM conversations c
            WHERE c.id IN (
                SELECT conv_id FROM conv_fts WHERE conv_fts MATCH ?
                UNION
                SELECT id FROM conversations WHERE title LIKE ?
            )
            {extra_sql}
            ORDER BY c.pinned DESC, c.updated_at DESC
            LIMIT 50
        """
    else:
        # PostgreSQL: FTS5 not available — fall back to ILIKE on title + message content
        like = f"%{query}%"
        params = [like, like] + extra_params
        sql = f"""
            SELECT DISTINCT c.id, c.title, c.kb_id, c.created_at, c.updated_at, c.pinned, c.locked, c.chat_mode, c.pocket_id
            FROM conversations c
            WHERE c.id IN (
                SELECT DISTINCT conv_id FROM messages WHERE content ILIKE ?
                UNION
                SELECT id FROM conversations WHERE title ILIKE ?
            )
            {extra_sql}
            ORDER BY c.pinned DESC, c.updated_at DESC
            LIMIT 50
        """

    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_conversation(conv_id: str) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, title, summary, kb_id, created_at, updated_at, pinned, locked, chat_mode, pocket_id, persona_prompt FROM conversations WHERE id=?",
        (conv_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_persona_prompt(conv_id: str, persona_prompt: Optional[str]):
    conn = _get_conn()
    conn.execute(
        "UPDATE conversations SET persona_prompt=?, updated_at=? WHERE id=?",
        (persona_prompt or None, int(time.time() * 1000), conv_id),
    )
    conn.commit()
    conn.close()


def get_messages(conv_id: str, key: Optional[bytes] = None) -> list[dict]:
    conv = get_conversation(conv_id)
    is_locked = bool(conv and conv.get("locked"))
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, role, content, citations, created_at, failed FROM messages WHERE conv_id=? ORDER BY created_at ASC",
        (conv_id,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["content"] = _maybe_decrypt(d["content"], key, is_locked)
        if d["citations"]:
            try:
                cit_raw = _maybe_decrypt(d["citations"], key, is_locked)
                d["citations"] = json.loads(cit_raw)
            except Exception:
                d["citations"] = None
        result.append(d)
    return result


def add_message(conv_id: str, role: str, content: str, citations=None, key: Optional[bytes] = None, failed: bool = False) -> str:
    msg_id = str(uuid.uuid4())
    now = int(time.time() * 1000)

    # Check lock status and write message within the same connection so the
    # lock state cannot change between the check and the insert.
    conn = _get_conn()
    conv_row = conn.execute(
        "SELECT locked FROM conversations WHERE id=?", (conv_id,)
    ).fetchone()
    is_locked = bool(conv_row and conv_row["locked"])
    effective_key = key if is_locked else None

    stored_content = _maybe_encrypt(content, effective_key)
    cit_str = None
    if citations:
        raw = json.dumps(citations)
        cit_str = _maybe_encrypt(raw, effective_key)

    with conn:
        conn.execute(
            "INSERT INTO messages(id, conv_id, role, content, citations, created_at, failed) VALUES (?,?,?,?,?,?,?)",
            (msg_id, conv_id, role, stored_content, cit_str, now, 1 if failed else 0),
        )
        conn.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id))
    conn.close()
    return msg_id


def update_message(msg_id: str, content: str, citations=None, key: Optional[bytes] = None, failed: bool = False):
    # Check lock status and write within the same connection.
    conn = _get_conn()
    row = conn.execute(
        """SELECT m.conv_id, c.locked
           FROM messages m JOIN conversations c ON c.id = m.conv_id
           WHERE m.id=?""",
        (msg_id,),
    ).fetchone()
    if not row:
        conn.close()
        return

    is_locked = bool(row["locked"])
    effective_key = key if is_locked else None

    stored_content = _maybe_encrypt(content, effective_key)
    cit_str = None
    if citations:
        raw = json.dumps(citations)
        cit_str = _maybe_encrypt(raw, effective_key)

    with conn:
        conn.execute(
            "UPDATE messages SET content=?, citations=?, failed=? WHERE id=?",
            (stored_content, cit_str, 1 if failed else 0, msg_id),
        )
    conn.close()


def mark_failed(msg_id: str):
    conn = _get_conn()
    conn.execute("UPDATE messages SET failed=1 WHERE id=?", (msg_id,))
    conn.commit()
    conn.close()


def update_summary(conv_id: str, summary: str):
    conn = _get_conn()
    conn.execute("UPDATE conversations SET summary=? WHERE id=?", (summary, conv_id))
    conn.commit()
    conn.close()


def set_locked(conv_id: str, locked: bool, key: Optional[bytes] = None):
    """Toggle lock on a conversation. Re-encrypts or decrypts all messages atomically."""
    if locked and key is None:
        raise ValueError("Key required to lock conversation")

    conn = _get_conn()
    conv_row = conn.execute(
        "SELECT locked FROM conversations WHERE id=?", (conv_id,)
    ).fetchone()
    if not conv_row:
        conn.close()
        return

    currently_locked = bool(conv_row["locked"])
    if currently_locked == locked:
        conn.close()
        return

    if not locked and currently_locked and key is None:
        conn.close()
        raise ValueError("Key required to unlock conversation")

    # Read all messages and prepare re-encrypted content before entering the
    # write transaction (crypto is CPU-bound; keep the lock window short).
    rows = conn.execute(
        "SELECT id, content, citations FROM messages WHERE conv_id=?", (conv_id,)
    ).fetchall()

    updates = []
    for r in rows:
        if locked:
            new_content = _encrypt_content(r["content"], key)
            new_cit = _encrypt_content(r["citations"], key) if r["citations"] else None
        else:
            new_content = _decrypt_content(r["content"], key)
            new_cit = None
            if r["citations"]:
                try:
                    new_cit = _decrypt_content(r["citations"], key)
                except Exception:
                    new_cit = r["citations"]
        updates.append((new_content, new_cit, r["id"]))

    # Write all updates + lock flag in one atomic transaction.
    with conn:
        for new_content, new_cit, msg_id in updates:
            conn.execute(
                "UPDATE messages SET content=?, citations=? WHERE id=?",
                (new_content, new_cit, msg_id),
            )
        conn.execute(
            "UPDATE conversations SET locked=? WHERE id=?",
            (1 if locked else 0, conv_id),
        )
    conn.close()


def pin_conversation(conv_id: str, pinned: bool):
    conn = _get_conn()
    conn.execute("UPDATE conversations SET pinned=? WHERE id=?", (1 if pinned else 0, conv_id))
    conn.commit()
    conn.close()


def delete_conversation(conv_id: str):
    conn = _get_conn()
    conn.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    conn.commit()
    conn.close()


def delete_all_conversations(chat_mode: Optional[str] = None, kb_id: Optional[str] = None, exclude_mode: Optional[str] = None):
    conn = _get_conn()
    where = []
    params: list = []
    if chat_mode:
        where.append("chat_mode=?"); params.append(chat_mode)
    if exclude_mode:
        where.append("chat_mode!=?"); params.append(exclude_mode)
    if kb_id is not None:
        where.append("kb_id=?"); params.append(kb_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    conn.execute(f"DELETE FROM conversations {where_sql}", params)
    conn.commit()
    conn.close()


def get_context_messages(conv_id: str, max_tokens: int, threshold: float = 0.7, key: Optional[bytes] = None) -> tuple[list[dict], bool]:
    msgs = get_messages(conv_id, key=key)
    if not msgs:
        return [], False

    # Exclude failed assistant messages and their paired user messages from context
    clean_msgs = []
    i = 0
    while i < len(msgs):
        m = msgs[i]
        if m.get("failed"):
            i += 1
            continue
        # If this is a user message and the next message is a failed assistant reply, skip the pair
        if m["role"] == "user" and i + 1 < len(msgs) and msgs[i + 1].get("failed"):
            i += 2
            continue
        clean_msgs.append(m)
        i += 1

    token_budget = int(max_tokens * threshold)
    selected = []
    used = 0

    for m in reversed(clean_msgs):
        tokens = len(m["content"]) // 4
        if used + tokens > token_budget and selected:
            break
        selected.insert(0, m)
        used += tokens

    needs_summary = len(selected) < len(clean_msgs)
    return selected, needs_summary


init_db()
