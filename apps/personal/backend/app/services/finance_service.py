from app.services.db_adapter import get_db, DbConn
import time
from typing import Optional
from app.core.config import settings

_APP_LOCK_KEY = "finance_app_locked"


def _get_conn() -> DbConn:
    return get_db("finance")



def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'cash',
            balance     REAL NOT NULL DEFAULT 0.0,
            currency    TEXT NOT NULL DEFAULT 'IDR',
            color       TEXT NOT NULL DEFAULT '#0284c7',
            note        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            type        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#6b7280',
            icon        TEXT NOT NULL DEFAULT 'tag',
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pockets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#0284c7',
            icon        TEXT NOT NULL DEFAULT 'folder',
            locked      INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pocket_id     INTEGER REFERENCES pockets(id) ON DELETE SET NULL,
            type          TEXT NOT NULL,
            amount        REAL NOT NULL,
            date          TEXT NOT NULL,
            description   TEXT,
            note          TEXT,
            tags          TEXT,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS finance_config (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tx_account  ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
        CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(date DESC);
        CREATE INDEX IF NOT EXISTS idx_tx_type     ON transactions(type);
    """)
    conn.commit()
    _run_migrations(conn)
    _seed_defaults(conn)
    conn.close()


def _run_migrations(conn: DbConn):
    migrations = [
        "ALTER TABLE transactions ADD COLUMN pocket_id INTEGER REFERENCES pockets(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_tx_pocket ON transactions(pocket_id)",
        "ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_tx_to_account ON transactions(to_account_id)",
        """CREATE TABLE IF NOT EXISTS financial_goals (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            target_amount REAL NOT NULL,
            saved_amount  REAL NOT NULL DEFAULT 0.0,
            deadline      TEXT,
            color         TEXT NOT NULL DEFAULT '#0284c7',
            icon          TEXT NOT NULL DEFAULT 'target',
            note          TEXT,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL
        )""",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # column/table already exists


def _seed_defaults(conn: DbConn):
    """Insert default business accounting categories only once on first run."""
    count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    if count > 0:
        return
    now = _now()
    defaults = [
        # ── Beban / Expenses ──────────────────────────────────────────────────
        ("Beban Gaji & Tunjangan",    "expense", "#ef4444", "users"),
        ("Beban Sewa",                "expense", "#f97316", "building"),
        ("Beban Utilitas",            "expense", "#f59e0b", "zap"),
        ("Beban Pemasaran & Iklan",   "expense", "#8b5cf6", "megaphone"),
        ("Beban Operasional",         "expense", "#3b82f6", "settings"),
        ("Beban Bahan Baku",          "expense", "#06b6d4", "package"),
        ("Beban Transportasi",        "expense", "#64748b", "truck"),
        ("Beban Perjalanan Dinas",    "expense", "#0891b2", "plane"),
        ("Beban Perlengkapan Kantor", "expense", "#84cc16", "clipboard"),
        ("Beban Teknologi & SaaS",    "expense", "#6366f1", "monitor"),
        ("Beban Pajak",               "expense", "#dc2626", "receipt"),
        ("Beban Bunga & Keuangan",    "expense", "#b45309", "percent"),
        ("Beban Lain-lain",           "expense", "#6b7280", "tag"),
        # ── Pendapatan / Revenue ──────────────────────────────────────────────
        ("Pendapatan Penjualan",      "income",  "#10b981", "trending-up"),
        ("Pendapatan Jasa",           "income",  "#14b8a6", "briefcase"),
        ("Pendapatan Sewa Aset",      "income",  "#0284c7", "home"),
        ("Pendapatan Investasi",      "income",  "#f59e0b", "bar-chart-2"),
        ("Pendapatan Bunga",          "income",  "#a78bfa", "percent"),
        ("Pendapatan Lain-lain",      "income",  "#6b7280", "plus-circle"),
        # ── Transfer / Antar Akun ─────────────────────────────────────────────
        ("Transfer Antar Akun",       "transfer","#94a3b8", "arrow-right-left"),
    ]
    conn.executemany(
        "INSERT INTO categories(name, type, color, icon, created_at) VALUES (?,?,?,?,?)",
        [(name, typ, color, icon, now) for name, typ, color, icon in defaults],
    )
    conn.commit()


def _now() -> int:
    return int(time.time() * 1000)


# ── Accounts ──────────────────────────────────────────────────────────────────

def list_accounts() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, name, type, balance, currency, color, note, created_at, updated_at "
        "FROM accounts ORDER BY name ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_account(account_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, name, type, balance, currency, color, note, created_at, updated_at "
        "FROM accounts WHERE id=?", (account_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_account(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO accounts(name, type, balance, currency, color, note, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (data["name"], data.get("type", "cash"), data.get("balance", 0.0),
         data.get("currency", "IDR"), data.get("color", "#0284c7"),
         data.get("note"), now, now),
    )
    conn.commit()
    account_id = conn.last_insert_id(cur)
    conn.close()
    return get_account(account_id)


def update_account(account_id: int, data: dict) -> Optional[dict]:
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        return get_account(account_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(
        f"UPDATE accounts SET {set_clause} WHERE id=?",
        (*fields.values(), account_id),
    )
    conn.commit()
    conn.close()
    return get_account(account_id)


def delete_account(account_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    conn.commit()
    conn.close()


# ── Categories ────────────────────────────────────────────────────────────────

def list_categories(type_filter: Optional[str] = None) -> list[dict]:
    conn = _get_conn()
    if type_filter:
        rows = conn.execute(
            "SELECT id, name, type, color, icon, created_at FROM categories WHERE type=? ORDER BY name ASC",
            (type_filter,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, name, type, color, icon, created_at FROM categories ORDER BY type ASC, name ASC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_category(category_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, name, type, color, icon, created_at FROM categories WHERE id=?",
        (category_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_category(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO categories(name, type, color, icon, created_at) VALUES (?,?,?,?,?)",
        (data["name"], data["type"], data.get("color", "#6b7280"),
         data.get("icon", "tag"), now),
    )
    conn.commit()
    cat_id = conn.last_insert_id(cur)
    conn.close()
    return get_category(cat_id)


def update_category(category_id: int, data: dict) -> Optional[dict]:
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        return get_category(category_id)
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(
        f"UPDATE categories SET {set_clause} WHERE id=?",
        (*fields.values(), category_id),
    )
    conn.commit()
    conn.close()
    return get_category(category_id)


def delete_category(category_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM categories WHERE id=?", (category_id,))
    conn.commit()
    conn.close()


# ── Transactions ──────────────────────────────────────────────────────────────

def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    pocket_id: Optional[int] = None,
    tx_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    where = []
    params = []

    if account_id is not None:
        where.append("t.account_id=?")
        params.append(account_id)
    if category_id is not None:
        where.append("t.category_id=?")
        params.append(category_id)
    if pocket_id is not None:
        where.append("t.pocket_id=?")
        params.append(pocket_id)
    if tx_type:
        where.append("t.type=?")
        params.append(tx_type)
    if date_from:
        where.append("t.date>=?")
        params.append(date_from)
    if date_to:
        where.append("t.date<=?")
        params.append(date_to)
    conn = _get_conn()
    if q:
        lk = conn.like_op()
        where.append(f"(t.description {lk} ? OR t.note {lk} ? OR t.tags {lk} ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])
    rows = conn.execute(
        f"""
        SELECT t.id, t.account_id, t.category_id, t.pocket_id, t.to_account_id,
               t.type, t.amount, t.date,
               t.description, t.note, t.tags, t.created_at, t.updated_at,
               a.name AS account_name, a.currency,
               a2.name AS to_account_name,
               c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
               p.name AS pocket_name, p.locked AS pocket_locked
        FROM transactions t
        LEFT JOIN accounts a  ON t.account_id    = a.id
        LEFT JOIN accounts a2 ON t.to_account_id = a2.id
        LEFT JOIN categories c ON t.category_id  = c.id
        LEFT JOIN pockets p   ON t.pocket_id     = p.id
        {where_sql}
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    pocket_id: Optional[int] = None,
    tx_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
) -> int:
    where = []
    params = []
    if account_id is not None:
        where.append("t.account_id=?"); params.append(account_id)
    if category_id is not None:
        where.append("t.category_id=?"); params.append(category_id)
    if pocket_id is not None:
        where.append("t.pocket_id=?"); params.append(pocket_id)
    if tx_type:
        where.append("t.type=?"); params.append(tx_type)
    if date_from:
        where.append("t.date>=?"); params.append(date_from)
    if date_to:
        where.append("t.date<=?"); params.append(date_to)
    conn = _get_conn()
    if q:
        lk = conn.like_op()
        where.append(f"(t.description {lk} ? OR t.note {lk} ? OR t.tags {lk} ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    count = conn.execute(
        f"SELECT COUNT(*) FROM transactions t {where_sql}", params
    ).fetchone()[0]
    conn.close()
    return count


def get_transaction(tx_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        """
        SELECT t.id, t.account_id, t.category_id, t.pocket_id, t.to_account_id,
               t.type, t.amount, t.date,
               t.description, t.note, t.tags, t.created_at, t.updated_at,
               a.name AS account_name, a.currency,
               a2.name AS to_account_name,
               c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
               p.name AS pocket_name, p.locked AS pocket_locked
        FROM transactions t
        LEFT JOIN accounts a  ON t.account_id    = a.id
        LEFT JOIN accounts a2 ON t.to_account_id = a2.id
        LEFT JOIN categories c ON t.category_id  = c.id
        LEFT JOIN pockets p   ON t.pocket_id     = p.id
        WHERE t.id=?
        """,
        (tx_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_transaction(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    with conn:
        cur = conn.execute(
            "INSERT INTO transactions(account_id, category_id, pocket_id, to_account_id, type, amount, date, "
            "description, note, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (data["account_id"], data.get("category_id"), data.get("pocket_id"),
             data.get("to_account_id"),
             data["type"], data["amount"], data["date"],
             data.get("description"), data.get("note"),
             data.get("tags"), now, now),
        )
        tx_id = conn.last_insert_id(cur)
        _apply_balance(conn, data, sign=+1)
    conn.close()
    return get_transaction(tx_id)


def update_transaction(tx_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    with conn:
        old = conn.execute(
            """
            SELECT t.id, t.account_id, t.category_id, t.pocket_id, t.to_account_id,
                   t.type, t.amount, t.date, t.description, t.note, t.tags,
                   t.created_at, t.updated_at,
                   a.name AS account_name, a.currency,
                   a2.name AS to_account_name,
                   c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   p.name AS pocket_name, p.locked AS pocket_locked
            FROM transactions t
            LEFT JOIN accounts a  ON t.account_id    = a.id
            LEFT JOIN accounts a2 ON t.to_account_id = a2.id
            LEFT JOIN categories c ON t.category_id  = c.id
            LEFT JOIN pockets p   ON t.pocket_id     = p.id
            WHERE t.id=?
            """,
            (tx_id,),
        ).fetchone()
        if not old:
            return None
        old = dict(old)

        # Reverse old balance effect
        _apply_balance(conn, old, sign=-1)

        # Explicit None values must also be persisted (e.g. clearing to_account_id)
        fields = {k: v for k, v in data.items() if k != "updated_at"}
        fields["updated_at"] = _now()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id=?",
            (*fields.values(), tx_id),
        )

        # Build merged record for balance calculation
        merged = {**old, **fields}
        _apply_balance(conn, merged, sign=+1)

    conn.close()
    return get_transaction(tx_id)


def delete_transaction(tx_id: int):
    conn = _get_conn()
    with conn:
        tx = conn.execute(
            "SELECT id, account_id, to_account_id, type, amount FROM transactions WHERE id=?",
            (tx_id,),
        ).fetchone()
        if not tx:
            return
        _apply_balance(conn, dict(tx), sign=-1)
        conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
    conn.close()


def _apply_balance(conn: DbConn, tx: dict, sign: int):
    """Apply or reverse the balance effect of a transaction (sign=+1 apply, sign=-1 reverse)."""
    tx_type = tx["type"]
    amount = tx["amount"]
    account_id = tx["account_id"]
    to_account_id = tx.get("to_account_id")
    now = _now()

    if tx_type == "income":
        conn.execute(
            "UPDATE accounts SET balance = balance + ?, updated_at=? WHERE id=?",
            (amount * sign, now, account_id),
        )
    elif tx_type == "expense":
        conn.execute(
            "UPDATE accounts SET balance = balance - ?, updated_at=? WHERE id=?",
            (amount * sign, now, account_id),
        )
    elif tx_type == "transfer" and to_account_id:
        # source loses money, destination gains money
        conn.execute(
            "UPDATE accounts SET balance = balance - ?, updated_at=? WHERE id=?",
            (amount * sign, now, account_id),
        )
        conn.execute(
            "UPDATE accounts SET balance = balance + ?, updated_at=? WHERE id=?",
            (amount * sign, now, to_account_id),
        )


# ── Pockets ───────────────────────────────────────────────────────────────────

def list_pockets() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, name, color, icon, locked, created_at, updated_at "
        "FROM pockets ORDER BY name ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_pocket(pocket_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, name, color, icon, locked, created_at, updated_at "
        "FROM pockets WHERE id=?", (pocket_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_pocket(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO pockets(name, color, icon, locked, created_at, updated_at) VALUES (?,?,?,?,?,?)",
        (data["name"], data.get("color", "#0284c7"), data.get("icon", "folder"), 0, now, now),
    )
    pocket_id = conn.last_insert_id(cur)
    conn.commit()
    conn.close()
    return get_pocket(pocket_id)


def update_pocket(pocket_id: int, data: dict) -> Optional[dict]:
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        return get_pocket(pocket_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(
        f"UPDATE pockets SET {set_clause} WHERE id=?",
        (*fields.values(), pocket_id),
    )
    conn.commit()
    conn.close()
    return get_pocket(pocket_id)


def delete_pocket(pocket_id: int):
    conn = _get_conn()
    # Transactions will have pocket_id set to NULL (ON DELETE SET NULL)
    conn.execute("DELETE FROM pockets WHERE id=?", (pocket_id,))
    conn.commit()
    conn.close()


def set_pocket_locked(pocket_id: int, locked: bool) -> Optional[dict]:
    conn = _get_conn()
    conn.execute(
        "UPDATE pockets SET locked=?, updated_at=? WHERE id=?",
        (1 if locked else 0, _now(), pocket_id),
    )
    conn.commit()
    conn.close()
    return get_pocket(pocket_id)


# ── App-level lock flag ───────────────────────────────────────────────────────

def get_finance_app_locked() -> bool:
    conn = _get_conn()
    row = conn.execute(
        "SELECT value FROM finance_config WHERE key=?", (_APP_LOCK_KEY,)
    ).fetchone()
    conn.close()
    return row["value"] == "1" if row else False


def set_finance_app_locked(locked: bool):
    conn = _get_conn()
    conn.execute(
        "INSERT INTO finance_config(key, value) VALUES (?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (_APP_LOCK_KEY, "1" if locked else "0"),
    )
    conn.commit()
    conn.close()


# ── Summary / Stats ───────────────────────────────────────────────────────────

def get_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pocket_id: Optional[int] = None,
    account_id: Optional[int] = None,
) -> dict:
    where = []
    params = []
    if date_from:
        where.append("t.date>=?"); params.append(date_from)
    if date_to:
        where.append("t.date<=?"); params.append(date_to)
    if pocket_id is not None:
        where.append("t.pocket_id=?"); params.append(pocket_id)
    if account_id is not None:
        where.append("t.account_id=?"); params.append(account_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    conn = _get_conn()
    row = conn.execute(
        f"""
        SELECT
            COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
            COUNT(*) AS tx_count
        FROM transactions t {where_sql}
        """,
        params,
    ).fetchone()

    by_category = conn.execute(
        f"""
        SELECT c.name, c.color, c.icon, t.type,
               SUM(t.amount) AS total, COUNT(*) AS count
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        {where_sql}
        GROUP BY t.category_id, t.type
        ORDER BY total DESC
        """,
        params,
    ).fetchall()

    total_balance = conn.execute("SELECT COALESCE(SUM(balance),0) FROM accounts").fetchone()[0]
    conn.close()

    return {
        "total_income": row["total_income"],
        "total_expense": row["total_expense"],
        "net": row["total_income"] - row["total_expense"],
        "tx_count": row["tx_count"],
        "total_balance": total_balance,
        "by_category": [dict(r) for r in by_category],
    }


def get_timeline(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pocket_id: Optional[int] = None,
    account_id: Optional[int] = None,
) -> list[dict]:
    """Daily income/expense totals within the given range."""
    where = []
    params = []
    if date_from:
        where.append("date>=?"); params.append(date_from)
    if date_to:
        where.append("date<=?"); params.append(date_to)
    if pocket_id is not None:
        where.append("pocket_id=?"); params.append(pocket_id)
    if account_id is not None:
        where.append("account_id=?"); params.append(account_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    conn = _get_conn()
    rows = conn.execute(
        f"""
        SELECT date,
               COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
               COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
        FROM transactions
        {where_sql}
        GROUP BY date
        ORDER BY date ASC
        """,
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_monthly(
    months: int = 12,
    pocket_id: Optional[int] = None,
    account_id: Optional[int] = None,
) -> list[dict]:
    """Income/expense per calendar month, last N months."""
    extra = []
    params: list = [f"-{months} months"]
    if pocket_id is not None:
        extra.append("AND pocket_id=?"); params.append(pocket_id)
    if account_id is not None:
        extra.append("AND account_id=?"); params.append(account_id)
    extra_sql = " ".join(extra)

    conn = _get_conn()
    rows = conn.execute(
        f"""
        SELECT {conn.month_format('date')} AS month,
               COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
               COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense
        FROM transactions
        WHERE date >= date('now', ?)
        {extra_sql}
        GROUP BY month
        ORDER BY month ASC
        """,
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_accounts_summary(account_id: Optional[int] = None) -> list[dict]:
    """Balance per account with type info for chart display."""
    conn = _get_conn()
    if account_id is not None:
        rows = conn.execute(
            "SELECT id, name, type, balance, currency, color FROM accounts WHERE id=? ORDER BY balance DESC",
            (account_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, name, type, balance, currency, color FROM accounts ORDER BY balance DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Financial Goals ───────────────────────────────────────────────────────────

def _get_goal(conn: DbConn, goal_id: int) -> Optional[dict]:
    row = conn.execute(
        "SELECT id, name, target_amount, saved_amount, deadline, color, icon, note, created_at, updated_at "
        "FROM financial_goals WHERE id=?",
        (goal_id,),
    ).fetchone()
    return dict(row) if row else None


def list_goals() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, name, target_amount, saved_amount, deadline, color, icon, note, created_at, updated_at "
        "FROM financial_goals ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_goal(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO financial_goals(name, target_amount, saved_amount, deadline, color, icon, note, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (
            data["name"],
            data["target_amount"],
            data.get("saved_amount", 0.0),
            data.get("deadline"),
            data.get("color", "#0284c7"),
            data.get("icon", "target"),
            data.get("note"),
            now,
            now,
        ),
    )
    conn.commit()
    goal_id = conn.last_insert_id(cur)
    result = _get_goal(conn, goal_id)
    conn.close()
    return result


def update_goal(goal_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    existing = _get_goal(conn, goal_id)
    if not existing:
        conn.close()
        return None
    # Allow explicit None for deadline and note (clearing them)
    allowed = {"name", "target_amount", "saved_amount", "deadline", "color", "icon", "note"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn.close()
        return existing
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn.execute(
        f"UPDATE financial_goals SET {set_clause} WHERE id=?",
        (*fields.values(), goal_id),
    )
    conn.commit()
    result = _get_goal(conn, goal_id)
    conn.close()
    return result


def delete_goal(goal_id: int) -> bool:
    conn = _get_conn()
    existing = _get_goal(conn, goal_id)
    if not existing:
        conn.close()
        return False
    conn.execute("DELETE FROM financial_goals WHERE id=?", (goal_id,))
    conn.commit()
    conn.close()
    return True


init_db()
