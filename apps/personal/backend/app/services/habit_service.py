import json
import time
from typing import Optional
from app.services.db_adapter import get_db, DbConn


def _get_conn() -> DbConn:
    return get_db("habit")


def _now() -> int:
    return int(time.time() * 1000)


def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS habits (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            description   TEXT,
            icon          TEXT NOT NULL DEFAULT '⭐',
            color         TEXT NOT NULL DEFAULT '#0284c7',
            frequency     TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
            reminder_time TEXT,
            active        INTEGER NOT NULL DEFAULT 1,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS habit_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            date       TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(habit_id, date)
        );

        CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
    """)
    conn.close()


# ── Habits ────────────────────────────────────────────────────────────────────

def _row_to_habit(row) -> dict:
    d = dict(row)
    if isinstance(d.get("frequency"), str):
        try:
            d["frequency"] = json.loads(d["frequency"])
        except Exception:
            d["frequency"] = [0, 1, 2, 3, 4, 5, 6]
    return d


def list_habits(active_only: bool = False) -> list[dict]:
    conn = _get_conn()
    sql = (
        "SELECT id, name, description, icon, color, frequency, reminder_time, active, created_at, updated_at "
        "FROM habits"
    )
    if active_only:
        sql += " WHERE active=1"
    sql += " ORDER BY created_at ASC"
    rows = conn.execute(sql).fetchall()
    conn.close()
    return [_row_to_habit(r) for r in rows]


def get_habit(habit_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, name, description, icon, color, frequency, reminder_time, active, created_at, updated_at "
        "FROM habits WHERE id=?", (habit_id,)
    ).fetchone()
    conn.close()
    return _row_to_habit(row) if row else None


def create_habit(data: dict) -> dict:
    now = _now()
    freq = json.dumps(data.get("frequency", [0, 1, 2, 3, 4, 5, 6]))
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO habits(name, description, icon, color, frequency, reminder_time, active, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,1,?,?)",
        (
            data["name"],
            data.get("description"),
            data.get("icon", "⭐"),
            data.get("color", "#0284c7"),
            freq,
            data.get("reminder_time"),
            now, now,
        ),
    )
    conn.commit()
    habit_id = conn.last_insert_id(cur)
    row = conn.execute(
        "SELECT id, name, description, icon, color, frequency, reminder_time, active, created_at, updated_at "
        "FROM habits WHERE id=?", (habit_id,)
    ).fetchone()
    conn.close()
    return _row_to_habit(row)


def update_habit(habit_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    existing_row = conn.execute("SELECT id FROM habits WHERE id=?", (habit_id,)).fetchone()
    if not existing_row:
        conn.close()
        return None
    allowed = {"name", "description", "icon", "color", "frequency", "reminder_time", "active"}
    fields: dict = {}
    for k, v in data.items():
        if k not in allowed:
            continue
        if k == "frequency":
            fields[k] = json.dumps(v) if isinstance(v, list) else v
        else:
            fields[k] = v
    if not fields:
        row = conn.execute(
            "SELECT id, name, description, icon, color, frequency, reminder_time, active, created_at, updated_at "
            "FROM habits WHERE id=?", (habit_id,)
        ).fetchone()
        conn.close()
        return _row_to_habit(row)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE habits SET {set_clause} WHERE id=?", (*fields.values(), habit_id))
    conn.commit()
    row = conn.execute(
        "SELECT id, name, description, icon, color, frequency, reminder_time, active, created_at, updated_at "
        "FROM habits WHERE id=?", (habit_id,)
    ).fetchone()
    conn.close()
    return _row_to_habit(row)


def delete_habit(habit_id: int) -> bool:
    conn = _get_conn()
    existing = conn.execute("SELECT id FROM habits WHERE id=?", (habit_id,)).fetchone()
    if not existing:
        conn.close()
        return False
    conn.execute("DELETE FROM habits WHERE id=?", (habit_id,))
    conn.commit()
    conn.close()
    return True


# ── Check-in / Logs ───────────────────────────────────────────────────────────

def check_in(habit_id: int, date: str) -> dict:
    """Toggle check-in for a habit on a given date. Returns {checked: bool, date: str}."""
    now = _now()
    conn = _get_conn()
    existing = conn.execute(
        "SELECT id FROM habit_logs WHERE habit_id=? AND date=?", (habit_id, date)
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM habit_logs WHERE habit_id=? AND date=?", (habit_id, date))
        conn.commit()
        conn.close()
        return {"checked": False, "date": date}
    conn.execute(
        "INSERT INTO habit_logs(habit_id, date, created_at) VALUES (?,?,?)",
        (habit_id, date, now),
    )
    conn.commit()
    conn.close()
    return {"checked": True, "date": date}


def get_logs_range(habit_id: int, date_from: str, date_to: str) -> list[str]:
    """Return sorted list of dates where habit was completed in [date_from, date_to]."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT date FROM habit_logs WHERE habit_id=? AND date>=? AND date<=? ORDER BY date ASC",
        (habit_id, date_from, date_to),
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


def get_stats(habit_id: int) -> dict:
    """Return streak, completion rates, and recent 84-day heatmap data."""
    conn = _get_conn()

    # All logs ordered by date DESC
    rows = conn.execute(
        "SELECT date FROM habit_logs WHERE habit_id=? ORDER BY date DESC",
        (habit_id,),
    ).fetchall()
    conn.close()

    dates_desc = [r[0] for r in rows]
    dates_set = set(dates_desc)
    total = len(dates_desc)

    from datetime import date, timedelta
    today = date.today()

    # Current streak
    current_streak = 0
    check = today
    while check.isoformat() in dates_set:
        current_streak += 1
        check -= timedelta(days=1)
    # If today not checked, try from yesterday
    if current_streak == 0:
        check = today - timedelta(days=1)
        while check.isoformat() in dates_set:
            current_streak += 1
            check -= timedelta(days=1)

    # Longest streak
    longest_streak = 0
    run = 0
    if dates_desc:
        sorted_dates = sorted(dates_set)
        run = 1
        longest_streak = 1
        for i in range(1, len(sorted_dates)):
            prev = date.fromisoformat(sorted_dates[i - 1])
            curr = date.fromisoformat(sorted_dates[i])
            if (curr - prev).days == 1:
                run += 1
                longest_streak = max(longest_streak, run)
            else:
                run = 1

    # Completion rates
    def rate(days: int) -> float:
        count = sum(
            1 for i in range(days)
            if (today - timedelta(days=i)).isoformat() in dates_set
        )
        return round(count / days * 100, 1)

    # 84-day heatmap (12 weeks)
    heatmap = []
    for i in range(83, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        heatmap.append({"date": d, "checked": d in dates_set})

    return {
        "total": total,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "rate_7": rate(7),
        "rate_30": rate(30),
        "heatmap": heatmap,
    }


def get_today_status(date: str) -> list[dict]:
    """Return all active habits with today's check-in status."""
    conn = _get_conn()
    habits = conn.execute(
        "SELECT id, name, description, icon, color, frequency, reminder_time FROM habits WHERE active=1 ORDER BY created_at ASC"
    ).fetchall()
    checked_ids = set(
        r[0] for r in conn.execute(
            "SELECT habit_id FROM habit_logs WHERE date=?", (date,)
        ).fetchall()
    )
    conn.close()
    result = []
    for h in habits:
        d = dict(h)
        try:
            d["frequency"] = json.loads(d["frequency"])
        except Exception:
            d["frequency"] = [0, 1, 2, 3, 4, 5, 6]
        d["checked_today"] = h[0] in checked_ids
        result.append(d)
    return result
