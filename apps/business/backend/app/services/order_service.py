import csv
import io
from app.services.db_adapter import get_db, DbConn
import time
from typing import Optional
from app.core.config import settings



def _now() -> int:
    return int(time.time() * 1000)


def _get_conn() -> DbConn:
    return get_db("inventory")



def init_db():
    conn = _get_conn()
    for sql in [
        # Wilayah master data
        """CREATE TABLE IF NOT EXISTS cities (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS districts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            city_id     INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS villages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS idx_districts_city ON districts(city_id)",
        "CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district_id)",
        # Shipping addresses
        """CREATE TABLE IF NOT EXISTS shipping_addresses (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            label           TEXT NOT NULL,
            recipient_name  TEXT,
            phone           TEXT,
            city_id         INTEGER REFERENCES cities(id) ON DELETE SET NULL,
            district_id     INTEGER REFERENCES districts(id) ON DELETE SET NULL,
            village_id      INTEGER REFERENCES villages(id) ON DELETE SET NULL,
            detail          TEXT,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        )""",
        # Orders
        """CREATE TABLE IF NOT EXISTS orders (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number        TEXT NOT NULL UNIQUE,
            customer_name       TEXT,
            customer_phone      TEXT,
            note                TEXT,
            status              TEXT NOT NULL DEFAULT 'open',
            shipping_address_id INTEGER REFERENCES shipping_addresses(id) ON DELETE SET NULL,
            warehouse_id        INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
            account_id          INTEGER,
            category_id         INTEGER,
            cost_method         TEXT NOT NULL DEFAULT 'fifo',
            total_amount        REAL NOT NULL DEFAULT 0,
            date                TEXT NOT NULL,
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS order_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            variant_id      INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
            qty             REAL NOT NULL,
            selling_price   REAL NOT NULL,
            subtotal        REAL NOT NULL,
            movement_id     INTEGER,
            finance_tx_id   INTEGER,
            created_at      INTEGER NOT NULL
        )""",
        # Order settings stored as key-value
        """CREATE TABLE IF NOT EXISTS order_settings (
            key     TEXT PRIMARY KEY,
            value   TEXT
        )""",
        "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_orders_date   ON orders(date)",
        "CREATE INDEX IF NOT EXISTS idx_order_items   ON order_items(order_id)",
        # Migrations
        "ALTER TABLE order_items ADD COLUMN cost_method TEXT",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass
    conn.close()


# ── Settings ───────────────────────────────────────────────────────────────────

def get_order_settings() -> dict:
    conn = _get_conn()
    rows = conn.execute("SELECT key, value FROM order_settings").fetchall()
    conn.close()
    result = {r["key"]: r["value"] for r in rows}
    return {
        "default_account_id": int(result["default_account_id"]) if result.get("default_account_id") else None,
        "default_category_id": int(result["default_category_id"]) if result.get("default_category_id") else None,
        "default_cost_method": result.get("default_cost_method", "fifo"),
        "default_warehouse_id": int(result["default_warehouse_id"]) if result.get("default_warehouse_id") else None,
    }


def save_order_settings(data: dict) -> dict:
    conn = _get_conn()
    for key, value in data.items():
        if value is None:
            conn.execute("DELETE FROM order_settings WHERE key=?", (key,))
        else:
            conn.execute(
                "INSERT INTO order_settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, str(value)),
            )
    conn.commit()
    conn.close()
    return get_order_settings()


# ── Wilayah ────────────────────────────────────────────────────────────────────

def list_cities() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM cities ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_city(name: str) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute("INSERT INTO cities(name, created_at) VALUES(?,?)", (name.strip(), now))
    conn.commit()
    row = conn.execute("SELECT * FROM cities WHERE id=?", (conn.last_insert_id(cur),)).fetchone()
    conn.close()
    return dict(row)


def update_city(city_id: int, name: str) -> Optional[dict]:
    conn = _get_conn()
    conn.execute("UPDATE cities SET name=? WHERE id=?", (name.strip(), city_id))
    conn.commit()
    row = conn.execute("SELECT * FROM cities WHERE id=?", (city_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_city(city_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM cities WHERE id=?", (city_id,))
    conn.commit()
    conn.close()


def list_districts(city_id: Optional[int] = None) -> list[dict]:
    conn = _get_conn()
    if city_id:
        rows = conn.execute(
            "SELECT d.*, c.name AS city_name FROM districts d JOIN cities c ON d.city_id=c.id WHERE d.city_id=? ORDER BY d.name",
            (city_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT d.*, c.name AS city_name FROM districts d JOIN cities c ON d.city_id=c.id ORDER BY c.name, d.name"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_district(city_id: int, name: str) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute("INSERT INTO districts(city_id, name, created_at) VALUES(?,?,?)", (city_id, name.strip(), now))
    conn.commit()
    row = conn.execute(
        "SELECT d.*, c.name AS city_name FROM districts d JOIN cities c ON d.city_id=c.id WHERE d.id=?",
        (conn.last_insert_id(cur),),
    ).fetchone()
    conn.close()
    return dict(row)


def update_district(district_id: int, name: str) -> Optional[dict]:
    conn = _get_conn()
    conn.execute("UPDATE districts SET name=? WHERE id=?", (name.strip(), district_id))
    conn.commit()
    row = conn.execute(
        "SELECT d.*, c.name AS city_name FROM districts d JOIN cities c ON d.city_id=c.id WHERE d.id=?",
        (district_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_district(district_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM districts WHERE id=?", (district_id,))
    conn.commit()
    conn.close()


def list_villages(district_id: Optional[int] = None) -> list[dict]:
    conn = _get_conn()
    if district_id:
        rows = conn.execute(
            """SELECT v.*, d.name AS district_name, c.name AS city_name
               FROM villages v
               JOIN districts d ON v.district_id=d.id
               JOIN cities c ON d.city_id=c.id
               WHERE v.district_id=? ORDER BY v.name""",
            (district_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT v.*, d.name AS district_name, c.name AS city_name
               FROM villages v
               JOIN districts d ON v.district_id=d.id
               JOIN cities c ON d.city_id=c.id
               ORDER BY c.name, d.name, v.name"""
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_village(district_id: int, name: str) -> dict:
    conn = _get_conn()
    now = _now()
    cur = conn.execute("INSERT INTO villages(district_id, name, created_at) VALUES(?,?,?)", (district_id, name.strip(), now))
    conn.commit()
    row = conn.execute(
        """SELECT v.*, d.name AS district_name, c.name AS city_name
           FROM villages v JOIN districts d ON v.district_id=d.id JOIN cities c ON d.city_id=c.id
           WHERE v.id=?""",
        (conn.last_insert_id(cur),),
    ).fetchone()
    conn.close()
    return dict(row)


def update_village(village_id: int, name: str) -> Optional[dict]:
    conn = _get_conn()
    conn.execute("UPDATE villages SET name=? WHERE id=?", (name.strip(), village_id))
    conn.commit()
    row = conn.execute(
        """SELECT v.*, d.name AS district_name, c.name AS city_name
           FROM villages v JOIN districts d ON v.district_id=d.id JOIN cities c ON d.city_id=c.id
           WHERE v.id=?""",
        (village_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_village(village_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM villages WHERE id=?", (village_id,))
    conn.commit()
    conn.close()


def import_wilayah_csv(csv_text: str) -> dict:
    """
    Import CSV with columns: city, district, village
    Creates missing cities/districts/villages, skips duplicates.
    Returns counts of created rows.
    """
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    conn = _get_conn()
    now = _now()
    created = {"cities": 0, "districts": 0, "villages": 0}

    city_cache: dict[str, int] = {}
    district_cache: dict[tuple, int] = {}

    for row in reader:
        city_name = (row.get("city") or row.get("kota") or "").strip()
        district_name = (row.get("district") or row.get("kecamatan") or "").strip()
        village_name = (row.get("village") or row.get("kelurahan") or "").strip()
        if not city_name:
            continue

        # City
        if city_name not in city_cache:
            existing = conn.execute("SELECT id FROM cities WHERE name=?", (city_name,)).fetchone()
            if existing:
                city_cache[city_name] = existing["id"]
            else:
                cur = conn.execute("INSERT INTO cities(name, created_at) VALUES(?,?)", (city_name, now))
                city_cache[city_name] = conn.last_insert_id(cur)
                created["cities"] += 1

        city_id = city_cache[city_name]

        if not district_name:
            continue

        # District
        key_d = (city_id, district_name)
        if key_d not in district_cache:
            existing = conn.execute("SELECT id FROM districts WHERE city_id=? AND name=?", (city_id, district_name)).fetchone()
            if existing:
                district_cache[key_d] = existing["id"]
            else:
                cur = conn.execute("INSERT INTO districts(city_id, name, created_at) VALUES(?,?,?)", (city_id, district_name, now))
                district_cache[key_d] = conn.last_insert_id(cur)
                created["districts"] += 1

        district_id = district_cache[key_d]

        if not village_name:
            continue

        # Village
        existing = conn.execute("SELECT id FROM villages WHERE district_id=? AND name=?", (district_id, village_name)).fetchone()
        if not existing:
            conn.execute("INSERT INTO villages(district_id, name, created_at) VALUES(?,?,?)", (district_id, village_name, now))
            created["villages"] += 1

    conn.commit()
    conn.close()
    return created


# ── Shipping Addresses ─────────────────────────────────────────────────────────

def _addr_row(conn, addr_id: int) -> Optional[dict]:
    row = conn.execute(
        """SELECT a.*,
                  c.name AS city_name,
                  d.name AS district_name,
                  v.name AS village_name
           FROM shipping_addresses a
           LEFT JOIN cities   c ON a.city_id=c.id
           LEFT JOIN districts d ON a.district_id=d.id
           LEFT JOIN villages  v ON a.village_id=v.id
           WHERE a.id=?""",
        (addr_id,),
    ).fetchone()
    return dict(row) if row else None


def list_addresses() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT a.*,
                  c.name AS city_name,
                  d.name AS district_name,
                  v.name AS village_name
           FROM shipping_addresses a
           LEFT JOIN cities   c ON a.city_id=c.id
           LEFT JOIN districts d ON a.district_id=d.id
           LEFT JOIN villages  v ON a.village_id=v.id
           ORDER BY a.label"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_address(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """INSERT INTO shipping_addresses(label, recipient_name, phone, city_id, district_id, village_id, detail, created_at, updated_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (data["label"], data.get("recipient_name"), data.get("phone"),
         data.get("city_id"), data.get("district_id"), data.get("village_id"),
         data.get("detail"), now, now),
    )
    conn.commit()
    result = _addr_row(conn, conn.last_insert_id(cur))
    conn.close()
    return result


def update_address(addr_id: int, data: dict) -> Optional[dict]:
    now = _now()
    conn = _get_conn()
    fields = {k: v for k, v in data.items() if k in
              ("label", "recipient_name", "phone", "city_id", "district_id", "village_id", "detail")}
    fields["updated_at"] = now
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE shipping_addresses SET {set_clause} WHERE id=?", (*fields.values(), addr_id))
    conn.commit()
    result = _addr_row(conn, addr_id)
    conn.close()
    return result


def delete_address(addr_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM shipping_addresses WHERE id=?", (addr_id,))
    conn.commit()
    conn.close()


# ── Order number ───────────────────────────────────────────────────────────────

def _next_order_number(conn) -> str:
    from datetime import date
    prefix = "ORD-" + date.today().strftime("%Y%m%d") + "-"
    lk = conn.like_op()
    row = conn.execute(
        f"SELECT order_number FROM orders WHERE order_number {lk} ? ORDER BY id DESC LIMIT 1",
        (prefix + "%",),
    ).fetchone()
    if row:
        try:
            seq = int(row["order_number"].rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"


# ── Orders ────────────────────────────────────────────────────────────────────

def _order_row(conn, order_id: int) -> Optional[dict]:
    row = conn.execute(
        """SELECT o.*,
                  a.label AS address_label,
                  a.recipient_name, a.phone AS address_phone,
                  c2.name AS city_name, d2.name AS district_name, v2.name AS village_name,
                  a.detail AS address_detail,
                  w.name AS warehouse_name
           FROM orders o
           LEFT JOIN shipping_addresses a  ON o.shipping_address_id=a.id
           LEFT JOIN cities   c2 ON a.city_id=c2.id
           LEFT JOIN districts d2 ON a.district_id=d2.id
           LEFT JOIN villages  v2 ON a.village_id=v2.id
           LEFT JOIN warehouses w ON o.warehouse_id=w.id
           WHERE o.id=?""",
        (order_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    # Attach items with first product image
    items = conn.execute(
        """SELECT oi.*,
                  pv.name AS variant_name, pv.sku_suffix,
                  p.name AS product_name, p.sku AS product_sku, p.unit,
                  (SELECT pi.filename FROM product_images pi
                   WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1
                  ) AS product_image
           FROM order_items oi
           JOIN product_variants pv ON oi.variant_id=pv.id
           JOIN products p ON pv.product_id=p.id
           WHERE oi.order_id=?
           ORDER BY oi.id""",
        (order_id,),
    ).fetchall()
    result["items"] = [dict(i) for i in items]
    return result


def list_orders(status: Optional[str] = None, q: Optional[str] = None, limit: int = 50, offset: int = 0) -> dict:
    conn = _get_conn()
    wheres = []
    params: list = []
    if status:
        wheres.append("o.status=?")
        params.append(status)
    if q:
        lk = conn.like_op()
        wheres.append(f"(o.order_number {lk} ? OR o.customer_name {lk} ?)")
        params += [f"%{q}%", f"%{q}%"]
    where_clause = "WHERE " + " AND ".join(wheres) if wheres else ""
    total = conn.execute(
        f"SELECT COUNT(*) FROM orders o {where_clause}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"""SELECT o.*, a.label AS address_label, w.name AS warehouse_name
            FROM orders o
            LEFT JOIN shipping_addresses a ON o.shipping_address_id=a.id
            LEFT JOIN warehouses w ON o.warehouse_id=w.id
            {where_clause}
            ORDER BY o.created_at DESC LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()
    conn.close()
    return {"orders": [dict(r) for r in rows], "total": total}


def get_order(order_id: int) -> Optional[dict]:
    conn = _get_conn()
    result = _order_row(conn, order_id)
    conn.close()
    return result


# Status transition rules:
# draft/waiting_for_payment → any status
# on_process → completed | cancelled
# completed → cancelled
# cancelled → (none)
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft":               {"waiting_for_payment", "on_process", "completed", "cancelled"},
    "waiting_for_payment": {"draft", "on_process", "completed", "cancelled"},
    "on_process":          {"completed", "cancelled"},
    "completed":           {"cancelled"},
    "cancelled":           set(),
}

# Statuses that require finance transaction to exist
_FINANCE_STATUSES = {"on_process", "completed"}

# Statuses that require stock to be deducted (all non-cancelled)
_STOCK_STATUSES = {"draft", "waiting_for_payment", "on_process", "completed"}


def _create_finance_tx(order: dict, finance_service) -> Optional[int]:
    """Create income finance transaction for an order. Returns tx id or None."""
    account_id = order.get("account_id")
    if not account_id:
        return None
    try:
        tx = finance_service.create_transaction({
            "account_id":  account_id,
            "category_id": order.get("category_id"),
            "type":        "income",
            "amount":      order["total_amount"],
            "date":        order["date"],
            "description": f"Order {order['order_number']}" + (f" — {order['customer_name']}" if order.get("customer_name") else ""),
        })
        return tx["id"]
    except Exception:
        return None


def _delete_finance_tx(order_id: int, conn, finance_service):
    """Delete all finance transactions linked to this order — best-effort."""
    rows = conn.execute(
        "SELECT DISTINCT finance_tx_id FROM order_items WHERE order_id=? AND finance_tx_id IS NOT NULL",
        (order_id,),
    ).fetchall()
    for row in rows:
        try:
            finance_service.delete_transaction(row["finance_tx_id"])
        except Exception:
            pass
    try:
        with conn:
            conn.execute("UPDATE order_items SET finance_tx_id=NULL WHERE order_id=?", (order_id,))
    except Exception:
        pass


def _reverse_stock(order: dict, inventory_service):
    """Delete the original OUT movements for each order item — best-effort.
    Using delete_movement restores batch qty_remaining correctly without
    creating extra IN entries that pollute movement history.
    Falls back to creating an IN movement if the original movement_id is missing.
    """
    for item in order.get("items", []):
        try:
            if item.get("movement_id"):
                inventory_service.delete_movement(item["movement_id"])
            else:
                # movement_id not recorded (legacy data) — create compensating IN
                inventory_service.create_movement({
                    "variant_id":   item["variant_id"],
                    "warehouse_id": order.get("warehouse_id"),
                    "type":         "in",
                    "qty":          item["qty"],
                    "unit_cost":    item.get("selling_price", 0),
                    "note":         f"Batal order {order['order_number']}",
                    "date":         order["date"],
                    "link_finance": False,
                })
        except Exception:
            pass


def create_order(data: dict, inventory_service, finance_service) -> dict:
    """
    Create order in 'draft' status by default.

    Stock is deducted immediately (draft/waiting_for_payment already reduce stock).
    Finance transaction is created only if initial status is on_process or completed.
    """
    now = _now()
    conn = _get_conn()

    order_number = _next_order_number(conn)
    total_amount = sum(item["qty"] * item["selling_price"] for item in data["items"])
    warehouse_id = data.get("warehouse_id")
    order_cost_method = data.get("cost_method", "fifo")  # order-level fallback
    initial_status = data.get("status", "draft")
    if initial_status not in _STOCK_STATUSES | {"cancelled"}:
        initial_status = "draft"

    # Resolve per-item cost_method: item overrides order-level fallback.
    def _item_cost_method(item: dict) -> str:
        return item.get("cost_method") or order_cost_method

    # ── Phase 1: create stock movements — do before inserting order so stock
    # errors abort early. Stock is deducted for all non-cancelled statuses.
    movement_ids: list[Optional[int]] = []
    if initial_status in _STOCK_STATUSES:
        for item in data["items"]:
            mv = inventory_service.create_movement({
                "variant_id":   item["variant_id"],
                "warehouse_id": warehouse_id,
                "type":         "out",
                "qty":          item["qty"],
                "cost_method":  _item_cost_method(item),
                "note":         f"Order {order_number}",
                "date":         data["date"],
                "link_finance": False,
            })
            movement_ids.append(mv["id"])
    else:
        movement_ids = [None] * len(data["items"])

    # ── Phase 2: persist order header + items atomically.
    try:
        with conn:
            cur = conn.execute(
                """INSERT INTO orders(order_number, customer_name, customer_phone, note, status,
                                      shipping_address_id, warehouse_id, account_id, category_id,
                                      cost_method, total_amount, date, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (order_number, data.get("customer_name"), data.get("customer_phone"),
                 data.get("note"), initial_status,
                 data.get("shipping_address_id"), warehouse_id,
                 data.get("account_id"), data.get("category_id"),
                 order_cost_method, total_amount, data["date"], now, now),
            )
            order_id = conn.last_insert_id(cur)

            for item, movement_id in zip(data["items"], movement_ids):
                conn.execute(
                    """INSERT INTO order_items(order_id, variant_id, qty, selling_price, subtotal, movement_id, cost_method, created_at)
                       VALUES(?,?,?,?,?,?,?,?)""",
                    (order_id, item["variant_id"], item["qty"], item["selling_price"],
                     item["qty"] * item["selling_price"], movement_id,
                     _item_cost_method(item), now),
                )
    except Exception:
        conn.close()
        raise

    # ── Phase 3: finance — only for on_process / completed.
    if initial_status in _FINANCE_STATUSES:
        order_snapshot = _order_row(conn, order_id)
        finance_tx_id = _create_finance_tx(order_snapshot, finance_service)
        if finance_tx_id:
            try:
                with conn:
                    conn.execute(
                        "UPDATE order_items SET finance_tx_id=? WHERE order_id=?",
                        (finance_tx_id, order_id),
                    )
            except Exception:
                pass

    result = _order_row(conn, order_id)
    conn.close()
    return result


def change_order_status(order_id: int, new_status: str, inventory_service, finance_service) -> Optional[dict]:
    """
    Transition an order to a new status, applying side effects:

    - draft → on_process/completed : create finance tx
    - waiting_for_payment → on_process/completed : create finance tx
    - on_process/completed → cancelled : reverse stock + delete finance tx
    - draft/waiting_for_payment → cancelled : reverse stock only (no finance tx to delete)
    - any → draft/waiting_for_payment from on_process/completed : not allowed by transition rules
    """
    conn = _get_conn()
    order = _order_row(conn, order_id)
    if not order:
        conn.close()
        return None

    current_status = order["status"]
    if new_status not in _ALLOWED_TRANSITIONS.get(current_status, set()):
        conn.close()
        raise ValueError(f"Cannot transition from '{current_status}' to '{new_status}'")

    now = _now()

    # ── Mark status atomically first.
    try:
        with conn:
            conn.execute(
                "UPDATE orders SET status=?, updated_at=? WHERE id=? AND status=?",
                (new_status, now, order_id, current_status),
            )
    except Exception:
        conn.close()
        raise

    had_finance = current_status in _FINANCE_STATUSES
    needs_finance = new_status in _FINANCE_STATUSES
    going_cancelled = new_status == "cancelled"
    had_stock = current_status in _STOCK_STATUSES

    if going_cancelled:
        # Reverse stock if it was previously deducted.
        if had_stock:
            _reverse_stock(order, inventory_service)
        # Delete finance tx if it existed.
        if had_finance:
            _delete_finance_tx(order_id, conn, finance_service)

    elif needs_finance and not had_finance:
        # Transitioning into a finance-tracked status (e.g. draft → on_process).
        updated_order = _order_row(conn, order_id)
        finance_tx_id = _create_finance_tx(updated_order, finance_service)
        if finance_tx_id:
            try:
                with conn:
                    conn.execute(
                        "UPDATE order_items SET finance_tx_id=? WHERE order_id=?",
                        (finance_tx_id, order_id),
                    )
            except Exception:
                pass

    result = _order_row(conn, order_id)
    conn.close()
    return result


def cancel_order(order_id: int, inventory_service, finance_service) -> Optional[dict]:
    """Cancel an order — delegates to change_order_status."""
    conn = _get_conn()
    order = _order_row(conn, order_id)
    conn.close()
    if not order:
        return None
    if order["status"] == "cancelled":
        return order
    try:
        return change_order_status(order_id, "cancelled", inventory_service, finance_service)
    except ValueError:
        return order


def _sync_order_to_modules(order_before: dict, data: dict, conn, inventory_service, finance_service):
    """
    Propagate order field changes to linked finance transactions and stock movements.
    Called after the orders table has already been updated.

    Fields handled:
      account_id   → update finance tx account
      category_id  → update finance tx category
      date         → update finance tx date + stock movement date
      customer_name → update finance tx description
    """
    if not finance_service:
        return

    order_id = order_before["id"]
    current_status = order_before["status"]

    # Collect all distinct finance_tx_ids linked to this order's items.
    tx_rows = conn.execute(
        "SELECT DISTINCT finance_tx_id FROM order_items WHERE order_id=? AND finance_tx_id IS NOT NULL",
        (order_id,),
    ).fetchall()
    tx_ids = [r["finance_tx_id"] for r in tx_rows]

    # Build the finance tx patch — only include fields that actually changed.
    tx_patch: dict = {}
    if "account_id" in data and data["account_id"] != order_before.get("account_id"):
        tx_patch["account_id"] = data["account_id"]
    if "category_id" in data and data["category_id"] != order_before.get("category_id"):
        tx_patch["category_id"] = data["category_id"]
    if "date" in data and data["date"] != order_before.get("date"):
        tx_patch["date"] = data["date"]
    if "customer_name" in data and data["customer_name"] != order_before.get("customer_name"):
        order_number = order_before["order_number"]
        new_name = data["customer_name"]
        tx_patch["description"] = f"Order {order_number}" + (f" — {new_name}" if new_name else "")

    if tx_patch and current_status in _FINANCE_STATUSES:
        for tx_id in tx_ids:
            try:
                finance_service.update_transaction(tx_id, tx_patch)
            except Exception:
                pass

    # Sync date to stock movements when date changes.
    # order_items and stock_movements are both in inventory.db so we use one conn.
    if "date" in data and data["date"] != order_before.get("date"):
        mv_rows = conn.execute(
            "SELECT movement_id FROM order_items WHERE order_id=? AND movement_id IS NOT NULL",
            (order_id,),
        ).fetchall()
        # conn is already on inventory.db (same db as stock_movements)
        for r in mv_rows:
            try:
                conn.execute(
                    "UPDATE stock_movements SET date=? WHERE id=?",
                    (data["date"], r["movement_id"]),
                )
            except Exception:
                pass
        try:
            conn.commit()
        except Exception:
            pass


def update_order(order_id: int, data: dict, inventory_service=None, finance_service=None) -> Optional[dict]:
    """
    Update editable fields on an order and propagate changes to linked modules.
    Status changes trigger full transition logic via change_order_status.
    """
    allowed_fields = {"customer_name", "customer_phone", "note",
                      "shipping_address_id", "warehouse_id", "account_id", "category_id", "date"}
    valid_statuses = set(_ALLOWED_TRANSITIONS.keys())

    new_status = data.get("status")
    if new_status and new_status not in valid_statuses:
        raise ValueError(f"Invalid status: {new_status}")

    # Snapshot order before any changes (for sync comparison).
    conn = _get_conn()
    order_before = _order_row(conn, order_id)
    conn.close()
    if not order_before:
        return None

    # Apply field updates (excluding status — handled separately).
    fields = {k: v for k, v in data.items() if k in allowed_fields}
    if fields:
        now = _now()
        fields["updated_at"] = now
        set_clause = ", ".join(f"{k}=?" for k in fields)
        conn = _get_conn()
        conn.execute(f"UPDATE orders SET {set_clause} WHERE id=?", (*fields.values(), order_id))
        conn.commit()
        # Sync changes to finance + inventory while connection is still open.
        _sync_order_to_modules(order_before, fields, conn, inventory_service, finance_service)
        conn.close()

    # Apply status transition if requested.
    if new_status and inventory_service and finance_service:
        if order_before["status"] != new_status:
            return change_order_status(order_id, new_status, inventory_service, finance_service)

    conn = _get_conn()
    result = _order_row(conn, order_id)
    conn.close()
    return result


def delete_order(order_id: int, inventory_service=None, finance_service=None):
    """
    Hard delete an order along with all associated stock movements and
    finance transactions, regardless of status.
    """
    conn = _get_conn()
    order = _order_row(conn, order_id)
    if not order:
        conn.close()
        return

    # Reverse stock if order was in a stock-deducting status.
    if order["status"] in _STOCK_STATUSES and inventory_service:
        _reverse_stock(order, inventory_service)

    # Delete finance transactions if they exist.
    if order["status"] in _FINANCE_STATUSES and finance_service:
        _delete_finance_tx(order_id, conn, finance_service)

    conn.execute("DELETE FROM orders WHERE id=?", (order_id,))
    conn.commit()
    conn.close()


def search_products_for_kasir(q: str, limit: int = 10) -> list[dict]:
    """
    Search active, for-sale products and their variants by product name, product SKU,
    or variant SKU suffix. Returns a flat list of variant matches for the SKU suggestion
    dropdown in KasirPanel. Includes first product image filename.
    """
    conn = _get_conn()
    lk = conn.like_op()
    rows = conn.execute(
        f"""SELECT pv.id AS variant_id, pv.name AS variant_name, pv.sku_suffix,
                   pv.selling_price, pv.fixed_cost,
                   p.id AS product_id, p.name AS product_name, p.sku AS product_sku, p.unit,
                   (SELECT pi.filename FROM product_images pi
                    WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1
                   ) AS product_image
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE p.active = 1 AND p.is_for_sale = 1
              AND (
                p.name {lk} ?
                OR p.sku {lk} ?
                OR pv.sku_suffix {lk} ?
                OR (p.sku IS NOT NULL AND pv.sku_suffix IS NOT NULL AND (p.sku || pv.sku_suffix) {lk} ?)
              )
            ORDER BY p.name ASC, pv.name ASC
            LIMIT ?""",
        (f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%", limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Insight summary ───────────────────────────────────────────────────────────

def get_order_summary(date_from: Optional[str] = None, date_to: Optional[str] = None, months: int = 6) -> dict:
    from datetime import date, timedelta
    import calendar

    conn = _get_conn()

    # Resolve date range for overall KPIs
    if date_from and date_to:
        kpi_from, kpi_to = date_from, date_to
    else:
        today = date.today()
        kpi_from = (today - timedelta(days=30)).isoformat()
        kpi_to = today.isoformat()

    # KPI totals (open orders only)
    kpi = conn.execute(
        """SELECT
             COUNT(*) AS total_orders,
             COALESCE(SUM(total_amount), 0) AS total_revenue,
             COALESCE(AVG(total_amount), 0) AS avg_order_value,
             COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled_orders
           FROM orders
           WHERE date BETWEEN ? AND ?""",
        (kpi_from, kpi_to),
    ).fetchone()

    # Monthly trend (last N months, open orders)
    today = date.today()
    monthly = []
    for i in range(months - 1, -1, -1):
        y = today.year
        m = today.month - i
        while m <= 0:
            m += 12
            y -= 1
        month_start = f"{y:04d}-{m:02d}-01"
        last_day = calendar.monthrange(y, m)[1]
        month_end = f"{y:04d}-{m:02d}-{last_day:02d}"
        row = conn.execute(
            """SELECT
                 COALESCE(SUM(total_amount), 0) AS revenue,
                 COUNT(*) AS orders
               FROM orders
               WHERE date BETWEEN ? AND ? AND status IN ('on_process','completed')""",
            (month_start, month_end),
        ).fetchone()
        monthly.append({
            "month": f"{y:04d}-{m:02d}",
            "label": f"{calendar.month_abbr[m]} {y}",
            "revenue": round(row["revenue"], 2),
            "orders": row["orders"],
        })

    # Top products by revenue (on_process + completed, last N months)
    first_month = monthly[0]["month"] + "-01" if monthly else kpi_from
    top_products = conn.execute(
        """SELECT
             p.name AS product_name,
             pv.name AS variant_name,
             SUM(oi.qty) AS total_qty,
             SUM(oi.subtotal) AS total_revenue
           FROM order_items oi
           JOIN orders o ON oi.order_id=o.id
           JOIN product_variants pv ON oi.variant_id=pv.id
           JOIN products p ON pv.product_id=p.id
           WHERE o.status IN ('on_process','completed') AND o.date >= ?
           GROUP BY oi.variant_id
           ORDER BY total_revenue DESC
           LIMIT 10""",
        (first_month,),
    ).fetchall()

    # Daily trend for current month
    this_month_start = f"{today.year:04d}-{today.month:02d}-01"
    this_month_end = f"{today.year:04d}-{today.month:02d}-{calendar.monthrange(today.year, today.month)[1]:02d}"
    daily_rows = conn.execute(
        """SELECT date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue
           FROM orders
           WHERE date BETWEEN ? AND ? AND status IN ('on_process','completed')
           GROUP BY date ORDER BY date""",
        (this_month_start, this_month_end),
    ).fetchall()

    # Status breakdown (all time, within KPI range)
    status_rows = conn.execute(
        """SELECT status, COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS total
           FROM orders
           WHERE date BETWEEN ? AND ?
           GROUP BY status""",
        (kpi_from, kpi_to),
    ).fetchall()
    status_breakdown = {r["status"]: {"count": r["n"], "total": round(r["total"], 2)} for r in status_rows}

    # Monthly stacked by status (same N months as monthly)
    all_statuses = ["draft", "waiting_for_payment", "on_process", "completed", "cancelled"]
    monthly_by_status = []
    for entry in monthly:
        month_start = entry["month"] + "-01"
        last_day = calendar.monthrange(int(entry["month"][:4]), int(entry["month"][5:7]))[1]
        month_end = entry["month"] + f"-{last_day:02d}"
        row_data = {"month": entry["month"], "label": entry["label"]}
        for s in all_statuses:
            r = conn.execute(
                "SELECT COUNT(*) AS n, COALESCE(SUM(total_amount),0) AS rev FROM orders WHERE date BETWEEN ? AND ? AND status=?",
                (month_start, month_end, s),
            ).fetchone()
            row_data[s] = r["n"]
            row_data[f"{s}_rev"] = round(r["rev"], 2)
        monthly_by_status.append(row_data)

    conn.close()

    return {
        "kpi": {
            "total_orders": kpi["total_orders"],
            "total_revenue": round(kpi["total_revenue"], 2),
            "avg_order_value": round(kpi["avg_order_value"], 2),
            "cancelled_orders": kpi["cancelled_orders"],
        },
        "monthly": monthly,
        "monthly_by_status": monthly_by_status,
        "status_breakdown": status_breakdown,
        "top_products": [
            {
                "name": f"{r['product_name']}" + (f" ({r['variant_name']})" if r["variant_name"] else ""),
                "qty": round(r["total_qty"], 2),
                "revenue": round(r["total_revenue"], 2),
            }
            for r in top_products
        ],
        "daily": [
            {"date": r["date"], "orders": r["orders"], "revenue": round(r["revenue"], 2)}
            for r in daily_rows
        ],
    }


# ── Barcode lookup ─────────────────────────────────────────────────────────────

def lookup_by_barcode(barcode: str) -> Optional[dict]:
    """
    Find a product variant by full SKU (product.sku + variant.sku_suffix).
    Returns variant info with current stock levels and first product image.
    """
    conn = _get_conn()
    rows = conn.execute(
        """SELECT pv.id AS variant_id, pv.name AS variant_name, pv.sku_suffix,
                  pv.selling_price, pv.fixed_cost, pv.color,
                  p.id AS product_id, p.name AS product_name, p.sku AS product_sku, p.unit,
                  p.is_for_sale,
                  (SELECT pi.filename FROM product_images pi
                   WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1
                  ) AS product_image
           FROM product_variants pv
           JOIN products p ON pv.product_id=p.id
           WHERE p.active=1
             AND (
               (p.sku IS NOT NULL AND pv.sku_suffix IS NOT NULL AND (p.sku || pv.sku_suffix) = ?)
               OR (p.sku = ? AND (pv.sku_suffix IS NULL OR pv.sku_suffix = ''))
               OR (pv.sku_suffix = ?)
             )""",
        (barcode, barcode, barcode),
    ).fetchall()

    if not rows:
        conn.close()
        return None

    variant = dict(rows[0])
    levels = conn.execute(
        """SELECT sl.*, w.name AS warehouse_name
           FROM stock_levels sl JOIN warehouses w ON sl.warehouse_id=w.id
           WHERE sl.variant_id=?""",
        (variant["variant_id"],),
    ).fetchall()
    variant["stock_levels"] = [dict(l) for l in levels]
    conn.close()
    return variant
