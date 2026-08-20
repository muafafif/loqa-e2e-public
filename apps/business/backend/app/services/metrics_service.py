import time
from datetime import datetime, timezone

from app.services.db_adapter import get_db, DbConn


def _get_conn() -> DbConn:
    return get_db("metrics")


def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS messages (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ts            REAL NOT NULL,
            session_id    TEXT NOT NULL,
            role          TEXT NOT NULL,
            provider      TEXT NOT NULL DEFAULT '',
            model_name    TEXT NOT NULL DEFAULT '',
            input_tokens  INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms    INTEGER NOT NULL DEFAULT 0,
            kb_id         TEXT,
            rag_used      INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS kb_stats (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            ts     REAL NOT NULL,
            kb_id  TEXT NOT NULL,
            chunks INTEGER NOT NULL DEFAULT 0,
            docs   INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_messages_ts      ON messages(ts);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    """)
    conn.close()


def record_message(
    *,
    session_id: str,
    role: str,
    provider: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    kb_id: str | None,
    rag_used: bool,
):
    conn = _get_conn()
    conn.execute(
        """INSERT INTO messages
           (ts, session_id, role, provider, model_name,
            input_tokens, output_tokens, latency_ms, kb_id, rag_used)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            time.time(), session_id, role, provider, model_name,
            input_tokens, output_tokens, latency_ms,
            kb_id, 1 if rag_used else 0,
        ),
    )
    conn.commit()
    conn.close()


def record_kb_stat(kb_id: str, chunks: int, docs: int):
    conn = _get_conn()
    conn.execute(
        "INSERT INTO kb_stats (ts, kb_id, chunks, docs) VALUES (?,?,?,?)",
        (time.time(), kb_id, chunks, docs),
    )
    conn.commit()
    conn.close()


def _period_bounds(period: str) -> tuple[float, float]:
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = start.replace(day=start.day - start.weekday())
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        raise ValueError(f"Unknown period: {period}")
    return start.timestamp(), now.timestamp()


def get_session_metrics(session_id: str) -> dict:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT role, provider, model_name,
                  SUM(input_tokens) as input_tokens,
                  SUM(output_tokens) as output_tokens,
                  AVG(latency_ms) as avg_latency,
                  MAX(latency_ms) as max_latency,
                  COUNT(*) as messages,
                  SUM(rag_used) as rag_count
           FROM messages WHERE session_id=?
           GROUP BY role""",
        (session_id,),
    ).fetchall()

    total = conn.execute(
        """SELECT SUM(input_tokens) as ti, SUM(output_tokens) as to_,
                  COUNT(*) as msgs, SUM(rag_used) as rag,
                  AVG(latency_ms) as avg_lat, MAX(latency_ms) as max_lat,
                  MIN(ts) as first_ts
           FROM messages WHERE session_id=?""",
        (session_id,),
    ).fetchone()
    conn.close()

    return {
        "session_id": session_id,
        "total_input_tokens": total["ti"] or 0,
        "total_output_tokens": total["to_"] or 0,
        "total_tokens": (total["ti"] or 0) + (total["to_"] or 0),
        "message_count": total["msgs"] or 0,
        "rag_count": total["rag"] or 0,
        "avg_latency_ms": round(total["avg_lat"] or 0),
        "max_latency_ms": round(total["max_lat"] or 0),
        "session_duration_s": round(time.time() - (total["first_ts"] or time.time())),
        "by_role": [dict(r) for r in rows],
    }


def get_period_metrics(period: str) -> dict:
    start, end = _period_bounds(period)
    conn = _get_conn()

    totals = conn.execute(
        """SELECT
             COUNT(*) as messages,
             SUM(input_tokens) as input_tokens,
             SUM(output_tokens) as output_tokens,
             AVG(latency_ms) as avg_latency,
             MAX(latency_ms) as max_latency,
             SUM(rag_used) as rag_count,
             COUNT(DISTINCT session_id) as sessions
           FROM messages WHERE ts >= ? AND ts <= ?""",
        (start, end),
    ).fetchone()

    by_model = conn.execute(
        """SELECT model_name, provider,
             SUM(input_tokens) as input_tokens,
             SUM(output_tokens) as output_tokens,
             COUNT(*) as messages,
             AVG(latency_ms) as avg_latency
           FROM messages WHERE ts >= ? AND ts <= ? AND role='assistant'
           GROUP BY model_name, provider""",
        (start, end),
    ).fetchall()

    if period == "day":
        bucket = conn.ts_to_hour("ts")
    else:
        bucket = conn.ts_to_date("ts")

    timeline = conn.execute(
        f"""SELECT {bucket} as label,
              SUM(input_tokens + output_tokens) as tokens,
              COUNT(*) as messages
            FROM messages WHERE ts >= ? AND ts <= ?
            GROUP BY label ORDER BY label""",
        (start, end),
    ).fetchall()

    conn.close()

    return {
        "period": period,
        "messages": totals["messages"] or 0,
        "input_tokens": totals["input_tokens"] or 0,
        "output_tokens": totals["output_tokens"] or 0,
        "total_tokens": (totals["input_tokens"] or 0) + (totals["output_tokens"] or 0),
        "avg_latency_ms": round(totals["avg_latency"] or 0),
        "max_latency_ms": round(totals["max_latency"] or 0),
        "rag_count": totals["rag_count"] or 0,
        "sessions": totals["sessions"] or 0,
        "by_model": [dict(r) for r in by_model],
        "timeline": [dict(r) for r in timeline],
    }


def get_kb_metrics() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT kb_id, chunks, docs, ts
           FROM kb_stats
           WHERE id IN (
             SELECT MAX(id) FROM kb_stats GROUP BY kb_id
           )
           ORDER BY kb_id""",
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


init_db()
