"""
Database adapter — SQLite (default) or PostgreSQL.

Usage in service files:
    from app.services.db_adapter import get_db, DbConn

    def _get_conn() -> DbConn:
        return get_db("finance")

The adapter reads database config from app_settings.json at call time,
so switching databases takes effect immediately without restarting.
"""
import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings

# ── Config helpers ────────────────────────────────────────────────────────────

_SETTINGS_FILE = settings.data_dir / "app_settings.json"


def _load_db_config() -> dict:
    """Return the database section from app_settings.json, or empty dict."""
    try:
        if _SETTINGS_FILE.exists():
            with open(_SETTINGS_FILE) as f:
                data = json.load(f)
            return data.get("database", {})
    except Exception:
        pass
    return {}


def _is_postgres_enabled(cfg: dict) -> bool:
    return (
        cfg.get("enabled", False)
        and cfg.get("host", "").strip() != ""
        and cfg.get("dbname", "").strip() != ""
    )


# ── SQLite adapter ────────────────────────────────────────────────────────────

class _SQLiteConn:
    """Thin wrapper around sqlite3.Connection that exposes a uniform interface."""

    dialect = "sqlite"

    def __init__(self, path: Path):
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")

    # ── Core DB methods ───────────────────────────────────────────────────────

    def execute(self, sql: str, params=()) -> sqlite3.Cursor:
        return self._conn.execute(sql, params)

    def executescript(self, sql: str) -> None:
        self._conn.executescript(sql)

    def executemany(self, sql: str, seq) -> None:
        self._conn.executemany(sql, seq)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def cursor(self):
        return self._conn.cursor()

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    # ── SQL dialect helpers ───────────────────────────────────────────────────

    def month_format(self, col: str) -> str:
        """SQL expression to format a date column as 'YYYY-MM'."""
        return f"strftime('%Y-%m', {col})"

    def autoincrement_pk(self) -> str:
        return "INTEGER PRIMARY KEY AUTOINCREMENT"

    def placeholder(self, n: int = 1) -> str:
        """Return n positional placeholders: '?, ?, ?'"""
        return ", ".join(["?"] * n)

    def last_insert_id(self, cursor) -> int:
        return cursor.lastrowid

    def insert_or_ignore(self, table: str, cols: list[str], vals: list) -> int:
        placeholders = self.placeholder(len(cols))
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
        cur = self.execute(sql, vals)
        self.commit()
        return cur.lastrowid

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def lock_for_update(self, table: str, where_sql: str, params: tuple) -> None:
        """SQLite: no-op — WAL + single-writer serializes all writes automatically."""
        pass

    def like_op(self) -> str:
        """Case-insensitive LIKE operator."""
        return "LIKE"

    def ts_to_hour(self, col: str) -> str:
        """SQL expression: unix-epoch float column → 'HH:00' string."""
        return f"strftime('%H:00', datetime({col}, 'unixepoch'))"

    def ts_to_date(self, col: str) -> str:
        """SQL expression: unix-epoch float column → 'YYYY-MM-DD' string."""
        return f"strftime('%Y-%m-%d', datetime({col}, 'unixepoch'))"


# ── PostgreSQL adapter ────────────────────────────────────────────────────────

class _PostgresConn:
    """Wrapper around psycopg2 connection with uniform interface."""

    dialect = "postgres"

    def __init__(self, cfg: dict):
        try:
            import psycopg2
            import psycopg2.extras
        except ImportError:
            raise RuntimeError(
                "psycopg2 tidak terinstal. Jalankan: pip install psycopg2-binary"
            )
        self._conn = psycopg2.connect(
            host=cfg.get("host", "localhost"),
            port=int(cfg.get("port", 5432)),
            dbname=cfg.get("dbname", ""),
            user=cfg.get("user", ""),
            password=cfg.get("password", ""),
            connect_timeout=10,
        )
        self._conn.autocommit = False
        # Use DictCursor so rows behave like sqlite3.Row (col access by name)
        import psycopg2.extras
        self._cursor_factory = psycopg2.extras.RealDictCursor

    # ── Core DB methods ───────────────────────────────────────────────────────

    def execute(self, sql: str, params=()) -> Any:
        sql = self._adapt_sql(sql)
        cur = self._conn.cursor(cursor_factory=self._cursor_factory)
        cur.execute(sql, params or None)
        return cur

    def executescript(self, sql: str) -> None:
        """Execute a multi-statement DDL block (CREATE TABLE IF NOT EXISTS, etc.)."""
        sql = self._adapt_ddl(sql)
        cur = self._conn.cursor()
        cur.execute(sql)
        self._conn.commit()

    def executemany(self, sql: str, seq) -> None:
        sql = self._adapt_sql(sql)
        cur = self._conn.cursor()
        cur.executemany(sql, seq)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def cursor(self):
        return self._conn.cursor(cursor_factory=self._cursor_factory)

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    # ── SQL dialect helpers ───────────────────────────────────────────────────

    def month_format(self, col: str) -> str:
        return f"TO_CHAR({col}::date, 'YYYY-MM')"

    def autoincrement_pk(self) -> str:
        return "BIGSERIAL PRIMARY KEY"

    def placeholder(self, n: int = 1) -> str:
        return ", ".join([f"%s"] * n)

    def last_insert_id(self, cursor) -> int:
        cursor.execute("SELECT lastval()")
        return cursor.fetchone()[0]

    def insert_or_ignore(self, table: str, cols: list[str], vals: list) -> int:
        placeholders = self.placeholder(len(cols))
        sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING RETURNING id"
        cur = self.execute(sql, vals)
        self.commit()
        row = cur.fetchone()
        return row["id"] if row else None

    def now_ms(self) -> int:
        return int(time.time() * 1000)

    def lock_for_update(self, table: str, where_sql: str, params: tuple) -> None:
        """PostgreSQL: issue SELECT FOR UPDATE to lock matching rows for the duration of the transaction."""
        self.execute(f"SELECT 1 FROM {table} WHERE {where_sql} FOR UPDATE", params)

    def like_op(self) -> str:
        """Case-insensitive LIKE operator."""
        return "ILIKE"

    def ts_to_hour(self, col: str) -> str:
        """SQL expression: unix-epoch float column → 'HH:00' string."""
        return f"TO_CHAR(TO_TIMESTAMP({col}), 'HH24:00')"

    def ts_to_date(self, col: str) -> str:
        """SQL expression: unix-epoch float column → 'YYYY-MM-DD' string."""
        return f"TO_CHAR(TO_TIMESTAMP({col}), 'YYYY-MM-DD')"

    # ── SQL translation ───────────────────────────────────────────────────────

    def _adapt_sql(self, sql: str) -> str:
        """Translate SQLite-specific DML/query syntax to PostgreSQL."""
        import re
        # ? placeholders → %s
        sql = re.sub(r'\?', '%s', sql)
        # strftime('%Y-%m', col) → TO_CHAR(col::date, 'YYYY-MM')
        sql = re.sub(
            r"strftime\('%Y-%m',\s*([^)]+)\)",
            lambda m: f"TO_CHAR({m.group(1).strip()}::date, 'YYYY-MM')",
            sql
        )
        # strftime('%Y', col) → TO_CHAR(col::date, 'YYYY')
        sql = re.sub(
            r"strftime\('%Y',\s*([^)]+)\)",
            lambda m: f"TO_CHAR({m.group(1).strip()}::date, 'YYYY')",
            sql
        )
        # INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
        sql = re.sub(r'INSERT\s+OR\s+IGNORE\s+INTO', 'INSERT INTO', sql, flags=re.IGNORECASE)
        sql = re.sub(r'INSERT\s+OR\s+REPLACE\s+INTO', 'INSERT INTO', sql, flags=re.IGNORECASE)
        return sql

    def _adapt_ddl(self, sql: str) -> str:
        """Translate SQLite DDL to PostgreSQL DDL."""
        import re
        sql = self._adapt_sql(sql)
        # INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
        sql = re.sub(
            r'INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT',
            'BIGSERIAL PRIMARY KEY',
            sql, flags=re.IGNORECASE
        )
        # TEXT NOT NULL DEFAULT '...' stays valid in Postgres
        # PRAGMA statements → remove
        sql = re.sub(r'PRAGMA\s+\w+(?:\s*=\s*\w+)?\s*;?', '', sql, flags=re.IGNORECASE)
        # CREATE VIRTUAL TABLE ... USING fts5 → not supported in PostgreSQL, drop it
        sql = re.sub(
            r'CREATE\s+VIRTUAL\s+TABLE\s+IF\s+NOT\s+EXISTS\s+\w+\s+USING\s+fts5[^;]+;',
            '',
            sql, flags=re.IGNORECASE | re.DOTALL
        )
        # CREATE TRIGGER blocks that feed fts5 tables → drop them too (the table won't exist)
        sql = re.sub(
            r'CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+\w+.*?END\s*;',
            '',
            sql, flags=re.IGNORECASE | re.DOTALL
        )
        return sql


# ── Public interface ──────────────────────────────────────────────────────────

# Type alias for type hints in service files
DbConn = _SQLiteConn | _PostgresConn

# Map db_name → SQLite file name
_DB_FILES: dict[str, str] = {
    "finance":       "finance.db",
    "inventory":     "inventory.db",
    "notes":         "notes.db",
    "conversations": "conversations.db",
    "metrics":       "metrics.db",
    "habit":         "habit.db",
}


def get_db(db_name: str) -> DbConn:
    """
    Return a database connection for the given logical database name.
    Reads config fresh each call — switching databases takes effect immediately.
    """
    cfg = _load_db_config()
    if _is_postgres_enabled(cfg):
        # All logical databases map to the same Postgres instance
        # (each service uses its own table prefix/schema — no collision)
        return _PostgresConn(cfg)
    # Default: SQLite
    filename = _DB_FILES.get(db_name)
    if not filename:
        raise ValueError(f"Unknown db_name: {db_name!r}")
    return _SQLiteConn(settings.data_dir / filename)


def test_postgres_connection(cfg: dict) -> tuple[bool, str]:
    """Test a PostgreSQL connection config. Returns (ok, message)."""
    try:
        import psycopg2
    except ImportError:
        return False, "psycopg2 tidak terinstal. Jalankan: pip install psycopg2-binary"
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=cfg.get("host", "localhost"),
            port=int(cfg.get("port", 5432)),
            dbname=cfg.get("dbname", ""),
            user=cfg.get("user", ""),
            password=cfg.get("password", ""),
            connect_timeout=8,
        )
        cur = conn.cursor()
        cur.execute("SELECT version()")
        version = cur.fetchone()[0]
        conn.close()
        return True, f"Terhubung: {version.split(',')[0]}"
    except Exception as e:
        return False, str(e)


def run_migrations(db_name: str, conn: DbConn) -> None:
    """
    Run init_db for the given database using the provided connection.
    Called after successfully saving a new database config.
    """
    if db_name == "finance":
        from app.services.finance_service import init_db as _init
    elif db_name == "inventory":  # personal tidak punya ini
        from app.services.inventory_service import init_db as _init
    elif db_name == "notes":
        from app.services.note_service import init_db as _init
    elif db_name == "conversations":
        from app.services.conversation_service import init_db as _init
    else:
        return
    _init()
