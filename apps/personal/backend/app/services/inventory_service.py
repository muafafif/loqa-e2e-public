from typing import Optional

from app.services.db_adapter import get_db, DbConn


def _now() -> int:
    import time
    return int(time.time() * 1000)


def _get_conn() -> DbConn:
    return get_db("inventory")


def init_db():
    conn = _get_conn()
    try:
        migrations = [
            # locations (replaces warehouses — simple label only)
            """CREATE TABLE IF NOT EXISTS locations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE,
                note       TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            # item categories
            """CREATE TABLE IF NOT EXISTS item_categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE,
                color      TEXT NOT NULL DEFAULT '#6366f1',
                created_at INTEGER NOT NULL
            )""",
            # items (no variants, no SKU, no cost tracking)
            """CREATE TABLE IF NOT EXISTS items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                category_id INTEGER REFERENCES item_categories(id) ON DELETE SET NULL,
                location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                unit        TEXT NOT NULL DEFAULT 'pcs',
                qty         REAL NOT NULL DEFAULT 0,
                min_qty     REAL NOT NULL DEFAULT 0,
                note        TEXT,
                active      INTEGER NOT NULL DEFAULT 1,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            )""",
            # stock movements (qty only, no cost)
            """CREATE TABLE IF NOT EXISTS movements (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
                type        TEXT NOT NULL CHECK(type IN ('in','out','adjustment')),
                qty         REAL NOT NULL,
                note        TEXT,
                date        TEXT NOT NULL,
                created_at  INTEGER NOT NULL
            )""",
        ]
        for sql in migrations:
            try:
                conn.execute(sql)
            except Exception:
                pass
        conn.commit()
    finally:
        conn.close()


# ── Locations ─────────────────────────────────────────────────────────────────

def list_locations() -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT * FROM locations ORDER BY name").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_location(data: dict) -> dict:
    conn = _get_conn()
    try:
        now = _now()
        cur = conn.execute(
            "INSERT INTO locations (name, note, created_at, updated_at) VALUES (?,?,?,?)",
            (data["name"].strip(), data.get("note"), now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM locations WHERE id=?", (conn.last_insert_id(cur),)).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_location(location_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    try:
        fields, values = [], []
        for k in ("name", "note"):
            if k in data:
                fields.append(f"{k}=?")
                values.append(data[k].strip() if isinstance(data[k], str) else data[k])
        if not fields:
            return None
        fields.append("updated_at=?")
        values += [_now(), location_id]
        conn.execute(f"UPDATE locations SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM locations WHERE id=?", (location_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_location(location_id: int):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM locations WHERE id=?", (location_id,))
        conn.commit()
    finally:
        conn.close()


# ── Categories ────────────────────────────────────────────────────────────────

def list_categories() -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT c.*, COUNT(i.id) AS item_count
               FROM item_categories c
               LEFT JOIN items i ON i.category_id = c.id
               GROUP BY c.id ORDER BY c.name"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_category(data: dict) -> dict:
    conn = _get_conn()
    try:
        now = _now()
        cur = conn.execute(
            "INSERT INTO item_categories (name, color, created_at) VALUES (?,?,?)",
            (data["name"].strip(), data.get("color", "#6366f1"), now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM item_categories WHERE id=?", (conn.last_insert_id(cur),)).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_category(category_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    try:
        fields, values = [], []
        for k in ("name", "color"):
            if k in data:
                fields.append(f"{k}=?")
                values.append(data[k].strip() if isinstance(data[k], str) else data[k])
        if not fields:
            return None
        values.append(category_id)
        conn.execute(f"UPDATE item_categories SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM item_categories WHERE id=?", (category_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_category(category_id: int):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM item_categories WHERE id=?", (category_id,))
        conn.commit()
    finally:
        conn.close()


# ── Items ─────────────────────────────────────────────────────────────────────

def _item_row(row) -> dict:
    return dict(row)


def list_items(
    category_id: Optional[int] = None,
    location_id: Optional[int] = None,
    low_stock_only: bool = False,
    active_only: bool = True,
    q: Optional[str] = None,
) -> list[dict]:
    conn = _get_conn()
    try:
        sql = """
            SELECT i.*,
                   c.name  AS category_name,
                   c.color AS category_color,
                   l.name  AS location_name
            FROM items i
            LEFT JOIN item_categories c ON c.id = i.category_id
            LEFT JOIN locations l       ON l.id = i.location_id
            WHERE 1=1
        """
        params: list = []
        if active_only:
            sql += " AND i.active=1"
        if category_id is not None:
            sql += " AND i.category_id=?"
            params.append(category_id)
        if location_id is not None:
            sql += " AND i.location_id=?"
            params.append(location_id)
        if low_stock_only:
            sql += " AND i.min_qty > 0 AND i.qty <= i.min_qty"
        if q:
            sql += f" AND i.name {conn.like_op()} ?"
            params.append(f"%{q}%")
        sql += " ORDER BY i.name"
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_item(item_id: int) -> Optional[dict]:
    conn = _get_conn()
    try:
        row = conn.execute(
            """SELECT i.*,
                      c.name  AS category_name,
                      c.color AS category_color,
                      l.name  AS location_name
               FROM items i
               LEFT JOIN item_categories c ON c.id = i.category_id
               LEFT JOIN locations l       ON l.id = i.location_id
               WHERE i.id=?""",
            (item_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_item(data: dict) -> dict:
    conn = _get_conn()
    try:
        now = _now()
        cur = conn.execute(
            """INSERT INTO items
               (name, category_id, location_id, unit, qty, min_qty, note, active, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,1,?,?)""",
            (
                data["name"].strip(),
                data.get("category_id"),
                data.get("location_id"),
                data.get("unit", "pcs"),
                data.get("qty", 0),
                data.get("min_qty", 0),
                data.get("note"),
                now, now,
            ),
        )
        conn.commit()
        return get_item(conn.last_insert_id(cur))
    finally:
        conn.close()


def update_item(item_id: int, data: dict) -> Optional[dict]:
    conn = _get_conn()
    try:
        fields, values = [], []
        for k in ("name", "unit", "note"):
            if k in data:
                values.append(data[k].strip() if isinstance(data[k], str) and data[k] else data[k])
                fields.append(f"{k}=?")
        for k in ("category_id", "location_id", "min_qty", "active"):
            if k in data:
                fields.append(f"{k}=?")
                values.append(data[k])
        if not fields:
            return get_item(item_id)
        fields.append("updated_at=?")
        values += [_now(), item_id]
        conn.execute(f"UPDATE items SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        return get_item(item_id)
    finally:
        conn.close()


def delete_item(item_id: int):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM items WHERE id=?", (item_id,))
        conn.commit()
    finally:
        conn.close()


# ── Movements ─────────────────────────────────────────────────────────────────

def _apply_movement_qty(item_id: int, move_type: str, qty: float, conn: DbConn):
    """Update items.qty based on movement type."""
    if move_type == "in":
        conn.execute("UPDATE items SET qty = qty + ?, updated_at=? WHERE id=?", (qty, _now(), item_id))
    elif move_type == "out":
        conn.execute("UPDATE items SET qty = qty - ?, updated_at=? WHERE id=?", (qty, _now(), item_id))
    elif move_type == "adjustment":
        # qty is the absolute new value
        conn.execute("UPDATE items SET qty = ?, updated_at=? WHERE id=?", (qty, _now(), item_id))


def create_movement(data: dict) -> dict:
    conn = _get_conn()
    try:
        now = _now()
        # Lock the items row before reading so concurrent movements are
        # serialized (no-op on SQLite, SELECT FOR UPDATE on PostgreSQL).
        conn.lock_for_update("items", "id=?", (data["item_id"],))
        item = conn.execute("SELECT id, qty FROM items WHERE id=?", (data["item_id"],)).fetchone()
        if not item:
            raise ValueError("Item not found")

        move_type = data["type"]
        qty = float(data["qty"])
        if qty <= 0:
            raise ValueError("Qty must be positive")

        if move_type == "out" and item["qty"] < qty:
            raise ValueError(f"Stok tidak mencukupi: tersedia {item['qty']}")

        cur = conn.execute(
            """INSERT INTO movements (item_id, location_id, type, qty, note, date, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                data["item_id"],
                data.get("location_id"),
                move_type,
                qty,
                data.get("note"),
                data["date"],
                now,
            ),
        )
        _apply_movement_qty(data["item_id"], move_type, qty, conn)
        conn.commit()

        row = conn.execute(
            """SELECT m.*, i.name AS item_name, i.unit,
                      l.name AS location_name
               FROM movements m
               JOIN items i ON i.id = m.item_id
               LEFT JOIN locations l ON l.id = m.location_id
               WHERE m.id=?""",
            (conn.last_insert_id(cur),),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def list_movements(
    item_id: Optional[int] = None,
    location_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    conn = _get_conn()
    try:
        where = "WHERE 1=1"
        params: list = []
        if item_id is not None:
            where += " AND m.item_id=?"
            params.append(item_id)
        if location_id is not None:
            where += " AND m.location_id=?"
            params.append(location_id)

        total = conn.execute(
            f"SELECT COUNT(*) FROM movements m {where}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""SELECT m.*, i.name AS item_name, i.unit,
                       l.name AS location_name
                FROM movements m
                JOIN items i ON i.id = m.item_id
                LEFT JOIN locations l ON l.id = m.location_id
                {where}
                ORDER BY m.created_at DESC
                LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()
        return {"movements": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


def delete_movement(movement_id: int):
    """Delete a movement and reverse its qty effect on the item."""
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM movements WHERE id=?", (movement_id,)).fetchone()
        if not row:
            return
        move = dict(row)
        # Reverse: in→subtract, out→add, adjustment cannot be reversed meaningfully
        if move["type"] == "in":
            conn.execute(
                "UPDATE items SET qty = qty - ?, updated_at=? WHERE id=?",
                (move["qty"], _now(), move["item_id"]),
            )
        elif move["type"] == "out":
            conn.execute(
                "UPDATE items SET qty = qty + ?, updated_at=? WHERE id=?",
                (move["qty"], _now(), move["item_id"]),
            )
        conn.execute("DELETE FROM movements WHERE id=?", (movement_id,))
        conn.commit()
    finally:
        conn.close()


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_dashboard() -> dict:
    conn = _get_conn()
    try:
        total_items = conn.execute(
            "SELECT COUNT(*) FROM items WHERE active=1"
        ).fetchone()[0]

        low_stock = conn.execute(
            """SELECT i.id, i.name, i.qty, i.min_qty, i.unit,
                      l.name AS location_name,
                      c.name AS category_name,
                      c.color AS category_color
               FROM items i
               LEFT JOIN locations l       ON l.id = i.location_id
               LEFT JOIN item_categories c ON c.id = i.category_id
               WHERE i.active=1 AND i.min_qty > 0 AND i.qty <= i.min_qty
               ORDER BY (i.qty - i.min_qty)"""
        ).fetchall()

        by_category = conn.execute(
            """SELECT c.name AS category_name, c.color, COUNT(i.id) AS item_count,
                      SUM(i.qty) AS total_qty
               FROM item_categories c
               LEFT JOIN items i ON i.category_id = c.id AND i.active=1
               GROUP BY c.id ORDER BY item_count DESC"""
        ).fetchall()

        by_location = conn.execute(
            """SELECT l.name AS location_name, COUNT(i.id) AS item_count
               FROM locations l
               LEFT JOIN items i ON i.location_id = l.id AND i.active=1
               GROUP BY l.id ORDER BY item_count DESC"""
        ).fetchall()

        recent_movements = conn.execute(
            """SELECT m.*, i.name AS item_name, i.unit,
                      l.name AS location_name
               FROM movements m
               JOIN items i ON i.id = m.item_id
               LEFT JOIN locations l ON l.id = m.location_id
               ORDER BY m.created_at DESC LIMIT 10"""
        ).fetchall()

        return {
            "total_items": total_items,
            "low_stock_count": len(low_stock),
            "low_stock_items": [dict(r) for r in low_stock],
            "by_category": [dict(r) for r in by_category],
            "by_location": [dict(r) for r in by_location],
            "recent_movements": [dict(r) for r in recent_movements],
        }
    finally:
        conn.close()
