from app.services.db_adapter import get_db, DbConn
from app.services.finance_service import create_transaction
import time
from typing import Optional


def _now() -> int:
    return int(time.time() * 1000)


def _get_conn() -> DbConn:
    return get_db("project")


# ── Init ─────────────────────────────────────────────────────────────────────

def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            client_name     TEXT,
            client_contact  TEXT,
            status          TEXT NOT NULL DEFAULT 'active',
            start_date      TEXT,
            end_date        TEXT,
            contract_value  REAL,
            description     TEXT,
            color           TEXT NOT NULL DEFAULT '#6b7280',
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_budget_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            category    TEXT NOT NULL DEFAULT 'Umum',
            description TEXT NOT NULL,
            qty         REAL NOT NULL DEFAULT 1,
            unit        TEXT NOT NULL DEFAULT 'ls',
            unit_price  REAL NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_workers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            role        TEXT,
            rate_type   TEXT NOT NULL DEFAULT 'fixed',
            rate_amount REAL NOT NULL DEFAULT 0,
            status      TEXT NOT NULL DEFAULT 'active',
            note        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_worker_payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id       INTEGER NOT NULL REFERENCES project_workers(id) ON DELETE CASCADE,
            project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            amount          REAL NOT NULL,
            date            TEXT NOT NULL,
            note            TEXT,
            link_finance    INTEGER NOT NULL DEFAULT 0,
            finance_tx_id   INTEGER,
            created_at      INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_invoices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            invoice_number  TEXT NOT NULL,
            amount          REAL NOT NULL,
            status          TEXT NOT NULL DEFAULT 'draft',
            issued_date     TEXT NOT NULL,
            due_date        TEXT,
            paid_date       TEXT,
            note            TEXT,
            link_finance    INTEGER NOT NULL DEFAULT 0,
            finance_tx_id   INTEGER,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );
    """)
    _run_migrations(conn)


def _run_migrations(conn: DbConn):
    migrations = [
        "CREATE INDEX IF NOT EXISTS idx_proj_status ON projects(status)",
        "CREATE INDEX IF NOT EXISTS idx_budget_project ON project_budget_items(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_workers_project ON project_workers(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_payments_project ON project_worker_payments(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_payments_worker ON project_worker_payments(worker_id)",
        "CREATE INDEX IF NOT EXISTS idx_invoices_project ON project_invoices(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_invoices_status ON project_invoices(status)",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # already exists


# ── Projects ──────────────────────────────────────────────────────────────────

def list_projects(status: Optional[str] = None) -> list[dict]:
    conn = _get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC",
            (status,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM projects ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_project(project_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return dict(row) if row else None


def create_project(data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute(
        """INSERT INTO projects
           (name, client_name, client_contact, status, start_date, end_date,
            contract_value, description, color, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            data["name"], data.get("client_name"), data.get("client_contact"),
            data.get("status", "active"), data.get("start_date"), data.get("end_date"),
            data.get("contract_value"), data.get("description"),
            data.get("color", "#6b7280"), now, now,
        ),
    )
    conn.commit()
    row_id = conn.last_insert_id(cur)
    conn.close()
    return get_project(row_id)


def update_project(project_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields = []
    vals = []
    allowed = ["name", "client_name", "client_contact", "status", "start_date",
               "end_date", "contract_value", "description", "color"]
    for k in allowed:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if not fields:
        conn.close()
        return get_project(project_id)
    vals += [_now(), project_id]
    conn.execute(
        f"UPDATE projects SET {', '.join(fields)}, updated_at = ? WHERE id = ?",
        vals,
    )
    conn.commit()
    conn.close()
    return get_project(project_id)


def delete_project(project_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_dashboard() -> dict:
    conn = _get_conn()

    totals = conn.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status='on_hold' THEN 1 ELSE 0 END) as on_hold,
            SUM(contract_value) as total_contract_value
        FROM projects
    """).fetchone()

    rab_total = conn.execute("""
        SELECT SUM(bi.qty * bi.unit_price) as total
        FROM project_budget_items bi
        JOIN projects p ON bi.project_id = p.id
        WHERE p.status = 'active'
    """).fetchone()

    paid_workers = conn.execute(
        "SELECT SUM(amount) as total FROM project_worker_payments"
    ).fetchone()

    invoices_pending = conn.execute("""
        SELECT COUNT(*) as count, SUM(amount) as total
        FROM project_invoices
        WHERE status IN ('draft', 'sent')
    """).fetchone()

    recent_projects = conn.execute("""
        SELECT p.*,
            (SELECT SUM(bi.qty * bi.unit_price) FROM project_budget_items bi WHERE bi.project_id = p.id) as rab_total,
            (SELECT SUM(wp.amount) FROM project_worker_payments wp WHERE wp.project_id = p.id) as paid_workers,
            (SELECT COUNT(*) FROM project_workers pw WHERE pw.project_id = p.id) as worker_count
        FROM projects p
        WHERE p.status = 'active'
        ORDER BY p.updated_at DESC
        LIMIT 5
    """).fetchall()

    return {
        "total_projects": totals["total"] or 0,
        "active_projects": totals["active"] or 0,
        "completed_projects": totals["completed"] or 0,
        "on_hold_projects": totals["on_hold"] or 0,
        "total_contract_value": totals["total_contract_value"] or 0,
        "total_rab": rab_total["total"] or 0,
        "total_paid_workers": paid_workers["total"] or 0,
        "invoices_pending_count": invoices_pending["count"] or 0,
        "invoices_pending_value": invoices_pending["total"] or 0,
        "recent_projects": [dict(r) for r in recent_projects],
    }


# ── Budget Items (RAB) ────────────────────────────────────────────────────────

def list_budget_items(project_id: int) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM project_budget_items WHERE project_id = ? ORDER BY category, id",
        (project_id,),
    ).fetchall()
    items = [dict(r) for r in rows]
    for item in items:
        item["total_price"] = item["qty"] * item["unit_price"]
    return items


def create_budget_item(project_id: int, data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute(
        """INSERT INTO project_budget_items
           (project_id, category, description, qty, unit, unit_price, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            project_id, data.get("category", "Umum"), data["description"],
            data.get("qty", 1), data.get("unit", "ls"),
            data.get("unit_price", 0), now, now,
        ),
    )
    conn.commit()
    row_id = conn.last_insert_id(cur)
    row = conn.execute("SELECT * FROM project_budget_items WHERE id = ?", (row_id,)).fetchone()
    conn.close()
    item = dict(row)
    item["total_price"] = item["qty"] * item["unit_price"]
    return item


def update_budget_item(item_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields, vals = [], []
    for k in ["category", "description", "qty", "unit", "unit_price"]:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if fields:
        vals += [_now(), item_id]
        conn.execute(
            f"UPDATE project_budget_items SET {', '.join(fields)}, updated_at = ? WHERE id = ?",
            vals,
        )
        conn.commit()
    row = conn.execute("SELECT * FROM project_budget_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    item = dict(row)
    item["total_price"] = item["qty"] * item["unit_price"]
    return item


def delete_budget_item(item_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM project_budget_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


# ── Workers ───────────────────────────────────────────────────────────────────

def list_workers(project_id: int) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT w.*,
               (SELECT SUM(p.amount) FROM project_worker_payments p WHERE p.worker_id = w.id) as total_paid
           FROM project_workers w
           WHERE w.project_id = ?
           ORDER BY w.created_at""",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def create_worker(project_id: int, data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute(
        """INSERT INTO project_workers
           (project_id, name, role, rate_type, rate_amount, status, note, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            project_id, data["name"], data.get("role"),
            data.get("rate_type", "fixed"), data.get("rate_amount", 0),
            data.get("status", "active"), data.get("note"), now, now,
        ),
    )
    conn.commit()
    row_id = conn.last_insert_id(cur)
    row = conn.execute(
        "SELECT *, 0 as total_paid FROM project_workers WHERE id = ?", (row_id,)
    ).fetchone()
    conn.close()
    return dict(row)


def update_worker(worker_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields, vals = [], []
    for k in ["name", "role", "rate_type", "rate_amount", "status", "note"]:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if fields:
        vals += [_now(), worker_id]
        conn.execute(
            f"UPDATE project_workers SET {', '.join(fields)}, updated_at = ? WHERE id = ?",
            vals,
        )
        conn.commit()
    row = conn.execute(
        """SELECT w.*,
               (SELECT SUM(p.amount) FROM project_worker_payments p WHERE p.worker_id = w.id) as total_paid
           FROM project_workers w WHERE w.id = ?""",
        (worker_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_worker(worker_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM project_workers WHERE id = ?", (worker_id,))
    conn.commit()
    conn.close()


# ── Worker Payments ───────────────────────────────────────────────────────────

def list_worker_payments(project_id: int) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT wp.*, w.name as worker_name, w.role as worker_role
           FROM project_worker_payments wp
           JOIN project_workers w ON wp.worker_id = w.id
           WHERE wp.project_id = ?
           ORDER BY wp.date DESC, wp.created_at DESC""",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def create_worker_payment(project_id: int, data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    finance_tx_id = None
    link_finance = 1 if data.get("link_finance") else 0

    if link_finance and data.get("account_id") and data.get("category_id"):
        worker_name = data.get("worker_name", "Pekerja")
        tx = create_transaction({
            "account_id": data["account_id"],
            "category_id": data["category_id"],
            "type": "expense",
            "amount": data["amount"],
            "date": data["date"],
            "description": f"Pembayaran: {worker_name}",
            "note": data.get("note"),
        })
        finance_tx_id = tx.get("id")

    cur = conn.execute(
        """INSERT INTO project_worker_payments
           (worker_id, project_id, amount, date, note, link_finance, finance_tx_id, created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            data["worker_id"], project_id, data["amount"], data["date"],
            data.get("note"), link_finance, finance_tx_id, now,
        ),
    )
    conn.commit()
    row_id = conn.last_insert_id(cur)
    row = conn.execute(
        """SELECT wp.*, w.name as worker_name, w.role as worker_role
           FROM project_worker_payments wp
           JOIN project_workers w ON wp.worker_id = w.id
           WHERE wp.id = ?""",
        (row_id,),
    ).fetchone()
    conn.close()
    return dict(row)


def update_worker_payment_link(payment_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    payment = conn.execute(
        "SELECT * FROM project_worker_payments WHERE id = ?", (payment_id,)
    ).fetchone()
    if not payment:
        return None

    link_finance = 1 if data.get("link_finance") else 0
    finance_tx_id = payment["finance_tx_id"]

    if link_finance and not finance_tx_id and data.get("account_id") and data.get("category_id"):
        worker = conn.execute(
            "SELECT name FROM project_workers WHERE id = ?", (payment["worker_id"],)
        ).fetchone()
        worker_name = worker["name"] if worker else "Pekerja"
        tx = create_transaction({
            "account_id": data["account_id"],
            "category_id": data["category_id"],
            "type": "expense",
            "amount": payment["amount"],
            "date": payment["date"],
            "description": f"Pembayaran: {worker_name}",
            "note": payment["note"],
        })
        finance_tx_id = tx.get("id")

    conn.execute(
        "UPDATE project_worker_payments SET link_finance = ?, finance_tx_id = ? WHERE id = ?",
        (link_finance, finance_tx_id, payment_id),
    )
    conn.commit()
    row = conn.execute(
        """SELECT wp.*, w.name as worker_name, w.role as worker_role
           FROM project_worker_payments wp
           JOIN project_workers w ON wp.worker_id = w.id
           WHERE wp.id = ?""",
        (payment_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_worker_payment(payment_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM project_worker_payments WHERE id = ?", (payment_id,))
    conn.commit()
    conn.close()


# ── Invoices ──────────────────────────────────────────────────────────────────

def list_invoices(project_id: int) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM project_invoices WHERE project_id = ? ORDER BY issued_date DESC",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def create_invoice(project_id: int, data: dict) -> dict:
    conn = _get_conn()
    now = _now()
    finance_tx_id = None
    link_finance = 1 if data.get("link_finance") else 0

    if link_finance and data.get("account_id") and data.get("category_id"):
        tx = create_transaction({
            "account_id": data["account_id"],
            "category_id": data["category_id"],
            "type": "income",
            "amount": data["amount"],
            "date": data["issued_date"],
            "description": f"Invoice {data['invoice_number']}",
            "note": data.get("note"),
        })
        finance_tx_id = tx.get("id")

    cur = conn.execute(
        """INSERT INTO project_invoices
           (project_id, invoice_number, amount, status, issued_date, due_date,
            paid_date, note, link_finance, finance_tx_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            project_id, data["invoice_number"], data["amount"],
            data.get("status", "draft"), data["issued_date"],
            data.get("due_date"), data.get("paid_date"),
            data.get("note"), link_finance, finance_tx_id, now, now,
        ),
    )
    conn.commit()
    row_id = conn.last_insert_id(cur)
    row = conn.execute("SELECT * FROM project_invoices WHERE id = ?", (row_id,)).fetchone()
    conn.close()
    return dict(row)


def update_invoice(invoice_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    fields, vals = [], []
    for k in ["invoice_number", "amount", "status", "issued_date", "due_date", "paid_date", "note"]:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    if fields:
        vals += [_now(), invoice_id]
        conn.execute(
            f"UPDATE project_invoices SET {', '.join(fields)}, updated_at = ? WHERE id = ?",
            vals,
        )
        conn.commit()
    row = conn.execute("SELECT * FROM project_invoices WHERE id = ?", (invoice_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_invoice_link(invoice_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    invoice = conn.execute(
        "SELECT * FROM project_invoices WHERE id = ?", (invoice_id,)
    ).fetchone()
    if not invoice:
        return None

    link_finance = 1 if data.get("link_finance") else 0
    finance_tx_id = invoice["finance_tx_id"]

    if link_finance and not finance_tx_id and data.get("account_id") and data.get("category_id"):
        tx = create_transaction({
            "account_id": data["account_id"],
            "category_id": data["category_id"],
            "type": "income",
            "amount": invoice["amount"],
            "date": invoice["issued_date"],
            "description": f"Invoice {invoice['invoice_number']}",
            "note": invoice["note"],
        })
        finance_tx_id = tx.get("id")

    conn.execute(
        "UPDATE project_invoices SET link_finance = ?, finance_tx_id = ?, updated_at = ? WHERE id = ?",
        (link_finance, finance_tx_id, _now(), invoice_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM project_invoices WHERE id = ?", (invoice_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_invoice(invoice_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM project_invoices WHERE id = ?", (invoice_id,))
    conn.commit()
    conn.close()
