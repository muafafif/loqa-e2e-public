from app.services.db_adapter import get_db, DbConn
import time
import uuid
import os
from pathlib import Path
from typing import Optional
from app.core.config import settings

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB per image
MAX_IMAGES_PER_PRODUCT = 8
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}



def _now() -> int:
    return int(time.time() * 1000)


def _get_conn() -> DbConn:
    return get_db("inventory")



def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS warehouses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            location    TEXT,
            note        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS product_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#6b7280',
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
            name        TEXT NOT NULL,
            sku         TEXT,
            unit        TEXT NOT NULL DEFAULT 'pcs',
            min_stock   REAL NOT NULL DEFAULT 0.0,
            active      INTEGER NOT NULL DEFAULT 1,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS product_variants (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            sku_suffix  TEXT,
            fixed_cost  REAL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_batches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_id      INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
            warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            movement_id     INTEGER,
            purchase_price  REAL NOT NULL,
            qty_initial     REAL NOT NULL,
            qty_remaining   REAL NOT NULL,
            date            TEXT NOT NULL,
            created_at      INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_levels (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_id   INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            qty          REAL NOT NULL DEFAULT 0.0,
            avg_cost     REAL NOT NULL DEFAULT 0.0,
            UNIQUE(variant_id, warehouse_id)
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_id          INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
            warehouse_id        INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
            type                TEXT NOT NULL,
            qty                 REAL NOT NULL,
            unit_cost           REAL,
            cost_method         TEXT,
            total_cost          REAL,
            note                TEXT,
            date                TEXT NOT NULL,
            finance_tx_id       INTEGER,
            finance_linked      INTEGER NOT NULL DEFAULT 0,
            created_at          INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_movements_variant   ON stock_movements(variant_id);
        CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON stock_movements(warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_movements_date      ON stock_movements(date);
        CREATE INDEX IF NOT EXISTS idx_batches_variant     ON stock_batches(variant_id, warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_levels_variant      ON stock_levels(variant_id, warehouse_id);
    """)
    conn.commit()

    # Incremental migrations
    for sql in [
        "ALTER TABLE product_variants ADD COLUMN selling_price REAL",
        "ALTER TABLE stock_movements ADD COLUMN selling_price REAL",
        "ALTER TABLE products ADD COLUMN is_for_sale INTEGER NOT NULL DEFAULT 1",
        # Brand / Category / Subcategory
        """CREATE TABLE IF NOT EXISTS brands (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS subcategories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            description TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )""",
        "ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL",
        "ALTER TABLE products ADD COLUMN subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id)",
        "CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id)",
        "CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id)",
        # Color moves to variant level
        "ALTER TABLE product_variants ADD COLUMN color TEXT NOT NULL DEFAULT '#6b7280'",
        # Default unit cost pre-fill for stock-in movements
        "ALTER TABLE product_variants ADD COLUMN default_unit_cost REAL",
        # Product description and images
        "ALTER TABLE products ADD COLUMN description TEXT",
        """CREATE TABLE IF NOT EXISTS product_images (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            filename    TEXT NOT NULL,
            mime_type   TEXT NOT NULL,
            size_bytes  INTEGER NOT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)",
        # Import history log
        """CREATE TABLE IF NOT EXISTS import_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type     TEXT NOT NULL,
            filename        TEXT NOT NULL,
            total_rows      INTEGER NOT NULL DEFAULT 0,
            imported        INTEGER NOT NULL DEFAULT 0,
            skipped         INTEGER NOT NULL DEFAULT 0,
            products_imported INTEGER NOT NULL DEFAULT 0,
            variants_imported INTEGER NOT NULL DEFAULT 0,
            errors_json     TEXT NOT NULL DEFAULT '[]',
            rows_json       TEXT NOT NULL DEFAULT '[]',
            created_at      INTEGER NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS idx_import_logs_created ON import_logs(created_at DESC)",
    ]:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # already applied

    conn.close()


# ── Warehouses ────────────────────────────────────────────────────────────────

def list_warehouses() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM warehouses ORDER BY name ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_warehouse(warehouse_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM warehouses WHERE id=?", (warehouse_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_warehouse(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO warehouses(name, location, note, created_at, updated_at) VALUES (?,?,?,?,?)",
        (data["name"], data.get("location"), data.get("note"), now, now),
    )
    conn.commit()
    wid = conn.last_insert_id(cur)
    conn.close()
    return get_warehouse(wid)


def update_warehouse(warehouse_id: int, data: dict) -> Optional[dict]:
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        return get_warehouse(warehouse_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(
        f"UPDATE warehouses SET {set_clause} WHERE id=?",
        (*fields.values(), warehouse_id),
    )
    conn.commit()
    conn.close()
    return get_warehouse(warehouse_id)


def delete_warehouse(warehouse_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM warehouses WHERE id=?", (warehouse_id,))
    conn.commit()
    conn.close()


# ── Product Categories ────────────────────────────────────────────────────────

def list_product_categories() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM product_categories ORDER BY name ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_product_category(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO product_categories(name, color, created_at) VALUES (?,?,?)",
        (data["name"], data.get("color", "#6b7280"), now),
    )
    conn.commit()
    cid = conn.last_insert_id(cur)
    row = conn.execute("SELECT * FROM product_categories WHERE id=?", (cid,)).fetchone()
    conn.close()
    return dict(row)


def update_product_category(category_id: int, data: dict) -> Optional[dict]:
    fields = {k: v for k, v in data.items() if v is not None}
    if not fields:
        conn = _get_conn()
        row = conn.execute("SELECT * FROM product_categories WHERE id=?", (category_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE product_categories SET {set_clause} WHERE id=?", (*fields.values(), category_id))
    conn.commit()
    row = conn.execute("SELECT * FROM product_categories WHERE id=?", (category_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_product_category(category_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM product_categories WHERE id=?", (category_id,))
    conn.commit()
    conn.close()


# ── Brands ────────────────────────────────────────────────────────────────────

def list_brands(
    category_id: Optional[int] = None,
    subcategory_id: Optional[int] = None,
    name_search: Optional[str] = None,
) -> list[dict]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if category_id is not None:
        conditions.append("EXISTS (SELECT 1 FROM products p2 JOIN subcategories sc2 ON p2.subcategory_id=sc2.id WHERE p2.brand_id=b.id AND sc2.category_id=?)")
        params.append(category_id)
    if subcategory_id is not None:
        conditions.append("EXISTS (SELECT 1 FROM products p2 WHERE p2.brand_id=b.id AND p2.subcategory_id=?)")
        params.append(subcategory_id)
    if name_search:
        conditions.append(f"b.name {conn.like_op()} ?")
        params.append(f"%{name_search}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
        f"""SELECT b.*, COUNT(p.id) AS product_count
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id
            {where}
            GROUP BY b.id ORDER BY b.name ASC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_brand(brand_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM brands WHERE id=?", (brand_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_brand(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO brands(name, description, created_at, updated_at) VALUES (?,?,?,?)",
        (data["name"], data.get("description"), now, now),
    )
    conn.commit()
    bid = conn.last_insert_id(cur)
    conn.close()
    return get_brand(bid)


def update_brand(brand_id: int, data: dict) -> Optional[dict]:
    allowed = {"name", "description"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return get_brand(brand_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE brands SET {set_clause} WHERE id=?", (*fields.values(), brand_id))
    conn.commit()
    conn.close()
    return get_brand(brand_id)


def delete_brand(brand_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM brands WHERE id=?", (brand_id,))
    conn.commit()
    conn.close()


# ── Categories ────────────────────────────────────────────────────────────────

def list_categories(name_search: Optional[str] = None) -> list[dict]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if name_search:
        conditions.append(f"c.name {conn.like_op()} ?")
        params.append(f"%{name_search}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
        f"""SELECT c.*, COUNT(sc.id) AS subcategory_count
            FROM categories c
            LEFT JOIN subcategories sc ON sc.category_id = c.id
            {where}
            GROUP BY c.id ORDER BY c.name ASC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_category(category_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM categories WHERE id=?", (category_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_category(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO categories(name, description, created_at, updated_at) VALUES (?,?,?,?)",
        (data["name"], data.get("description"), now, now),
    )
    conn.commit()
    cid = conn.last_insert_id(cur)
    conn.close()
    return get_category(cid)


def update_category(category_id: int, data: dict) -> Optional[dict]:
    allowed = {"name", "description"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return get_category(category_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE categories SET {set_clause} WHERE id=?", (*fields.values(), category_id))
    conn.commit()
    conn.close()
    return get_category(category_id)


def delete_category(category_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM categories WHERE id=?", (category_id,))
    conn.commit()
    conn.close()


# ── Subcategories ─────────────────────────────────────────────────────────────

def list_subcategories(
    category_id: Optional[int] = None,
    name_search: Optional[str] = None,
) -> list[dict]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if category_id is not None:
        conditions.append("sc.category_id=?")
        params.append(category_id)
    if name_search:
        conditions.append(f"sc.name {conn.like_op()} ?")
        params.append(f"%{name_search}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
        f"""SELECT sc.*, c.name AS category_name, COUNT(p.id) AS product_count
            FROM subcategories sc
            JOIN categories c ON sc.category_id = c.id
            LEFT JOIN products p ON p.subcategory_id = sc.id
            {where}
            GROUP BY sc.id ORDER BY c.name ASC, sc.name ASC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_subcategory(subcategory_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        """SELECT sc.*, c.name AS category_name
           FROM subcategories sc
           JOIN categories c ON sc.category_id = c.id
           WHERE sc.id=?""",
        (subcategory_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_subcategory(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO subcategories(category_id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)",
        (data["category_id"], data["name"], data.get("description"), now, now),
    )
    conn.commit()
    sid = conn.last_insert_id(cur)
    conn.close()
    return get_subcategory(sid)


def update_subcategory(subcategory_id: int, data: dict) -> Optional[dict]:
    allowed = {"category_id", "name", "description"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return get_subcategory(subcategory_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE subcategories SET {set_clause} WHERE id=?", (*fields.values(), subcategory_id))
    conn.commit()
    conn.close()
    return get_subcategory(subcategory_id)


def delete_subcategory(subcategory_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM subcategories WHERE id=?", (subcategory_id,))
    conn.commit()
    conn.close()


# ── Products ──────────────────────────────────────────────────────────────────

def list_products(
    active_only: bool = False,
    brand_id: Optional[int] = None,
    subcategory_id: Optional[int] = None,
    category_id: Optional[int] = None,
    name_search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    conn = _get_conn()
    conditions = []
    params: list = []
    if active_only:
        conditions.append("p.active=1")
    if brand_id:
        conditions.append("p.brand_id=?"); params.append(brand_id)
    if subcategory_id:
        conditions.append("p.subcategory_id=?"); params.append(subcategory_id)
    if category_id:
        conditions.append("sc.category_id=?"); params.append(category_id)
    if name_search:
        conditions.append(f"p.name {conn.like_op()} ?"); params.append(f"%{name_search}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total_row = conn.execute(
        f"""SELECT COUNT(DISTINCT p.id)
            FROM products p
            LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
            {where}""",
        params,
    ).fetchone()
    total = total_row[0] if total_row else 0

    rows = conn.execute(
        f"""SELECT p.*,
               b.name AS brand_name,
               sc.name AS subcategory_name,
               c.id AS category_id, c.name AS category_name
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
            LEFT JOIN categories c ON sc.category_id = c.id
            {where}
            ORDER BY p.name ASC
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        variants = conn.execute(
            "SELECT * FROM product_variants WHERE product_id=? ORDER BY name ASC",
            (d["id"],),
        ).fetchall()
        d["variants"] = [dict(v) for v in variants]
        images = conn.execute(
            "SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order ASC, id ASC",
            (d["id"],),
        ).fetchall()
        d["images"] = [dict(img) for img in images]
        result.append(d)
    conn.close()
    return {"products": result, "total": total}


def get_product(product_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        """SELECT p.*,
               b.name AS brand_name,
               sc.name AS subcategory_name,
               c.id AS category_id, c.name AS category_name
           FROM products p
           LEFT JOIN brands b ON p.brand_id = b.id
           LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
           LEFT JOIN categories c ON sc.category_id = c.id
           WHERE p.id=?""",
        (product_id,),
    ).fetchone()
    if not row:
        conn.close()
        return None
    d = dict(row)
    variants = conn.execute(
        "SELECT * FROM product_variants WHERE product_id=? ORDER BY name ASC",
        (product_id,),
    ).fetchall()
    d["variants"] = [dict(v) for v in variants]
    images = conn.execute(
        "SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order ASC, id ASC",
        (product_id,),
    ).fetchall()
    d["images"] = [dict(img) for img in images]
    conn.close()
    return d


def create_product(data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """INSERT INTO products(name, sku, unit, min_stock, active, is_for_sale,
               brand_id, subcategory_id, description, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (data["name"], data.get("sku"),
         data.get("unit", "pcs"), data.get("min_stock", 0.0),
         1 if data.get("active", True) else 0,
         1 if data.get("is_for_sale", True) else 0,
         data.get("brand_id"), data.get("subcategory_id"),
         data.get("description"), now, now),
    )
    conn.commit()
    pid = conn.last_insert_id(cur)
    conn.close()
    return get_product(pid)


def update_product(product_id: int, data: dict) -> Optional[dict]:
    allowed = {"name", "sku", "unit", "min_stock", "active", "is_for_sale", "brand_id", "subcategory_id", "description"}
    fields = {k: v for k, v in data.items() if k in allowed and v is not None}
    if "active" in data:
        fields["active"] = 1 if data["active"] else 0
    if "is_for_sale" in data:
        fields["is_for_sale"] = 1 if data["is_for_sale"] else 0
    # allow explicit null for brand_id / subcategory_id / description
    for fk in ("brand_id", "subcategory_id", "description"):
        if fk in data:
            fields[fk] = data[fk]
    if not fields:
        return get_product(product_id)
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE products SET {set_clause} WHERE id=?", (*fields.values(), product_id))
    conn.commit()
    conn.close()
    return get_product(product_id)


def delete_product(product_id: int):
    # Clean up image files first
    conn = _get_conn()
    imgs = conn.execute("SELECT filename FROM product_images WHERE product_id=?", (product_id,)).fetchall()
    conn.execute("DELETE FROM products WHERE id=?", (product_id,))
    conn.commit()
    conn.close()
    for img in imgs:
        _delete_image_file(img["filename"])


# ── Product Images ─────────────────────────────────────────────────────────────

def _delete_image_file(filename: str):
    try:
        path = settings.product_images_dir / filename
        if path.exists():
            path.unlink()
    except Exception:
        pass


def list_product_images(product_id: int) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order ASC, id ASC",
        (product_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_product_image(product_id: int, file_bytes: bytes, mime_type: str) -> dict:
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError(f"Tipe file tidak didukung. Gunakan JPEG, PNG, atau WebP.")
    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Ukuran gambar melebihi batas {MAX_IMAGE_BYTES // 1024 // 1024} MB.")

    conn = _get_conn()
    count = conn.execute(
        "SELECT COUNT(*) FROM product_images WHERE product_id=?", (product_id,)
    ).fetchone()[0]
    if count >= MAX_IMAGES_PER_PRODUCT:
        conn.close()
        raise ValueError(f"Maksimal {MAX_IMAGES_PER_PRODUCT} gambar per produk.")

    ext = IMAGE_EXT[mime_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    path = settings.product_images_dir / filename
    path.write_bytes(file_bytes)

    now = _now()
    cur = conn.execute(
        """INSERT INTO product_images(product_id, filename, mime_type, size_bytes, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (product_id, filename, mime_type, len(file_bytes), count, now),
    )
    conn.commit()
    img_id = conn.last_insert_id(cur)
    row = conn.execute("SELECT * FROM product_images WHERE id=?", (img_id,)).fetchone()
    conn.close()
    return dict(row)


def delete_product_image(image_id: int) -> bool:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM product_images WHERE id=?", (image_id,)).fetchone()
    if not row:
        conn.close()
        return False
    conn.execute("DELETE FROM product_images WHERE id=?", (image_id,))
    conn.commit()
    conn.close()
    _delete_image_file(row["filename"])
    return True


def reorder_product_images(product_id: int, image_ids: list[int]):
    conn = _get_conn()
    for order, img_id in enumerate(image_ids):
        conn.execute(
            "UPDATE product_images SET sort_order=? WHERE id=? AND product_id=?",
            (order, img_id, product_id),
        )
    conn.commit()
    conn.close()


# ── Import Logs ───────────────────────────────────────────────────────────────

def save_import_log(
    import_type: str,
    filename: str,
    total_rows: int,
    imported: int,
    skipped: int,
    errors: list[dict],
    all_rows: list[dict],
    products_imported: int = 0,
    variants_imported: int = 0,
) -> dict:
    import json
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """INSERT INTO import_logs(import_type, filename, total_rows, imported, skipped,
               products_imported, variants_imported, errors_json, rows_json, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (import_type, filename, total_rows, imported, skipped,
         products_imported, variants_imported,
         json.dumps(errors, ensure_ascii=False),
         json.dumps(all_rows, ensure_ascii=False),
         now),
    )
    conn.commit()
    log_id = conn.last_insert_id(cur)
    conn.close()
    return get_import_log(log_id)


def list_import_logs(limit: int = 50, offset: int = 0) -> dict:
    conn = _get_conn()
    total = conn.execute("SELECT COUNT(*) FROM import_logs").fetchone()[0]
    rows = conn.execute(
        """SELECT id, import_type, filename, total_rows, imported, skipped,
                  products_imported, variants_imported,
                  json_array_length(errors_json) AS error_count,
                  created_at
           FROM import_logs ORDER BY created_at DESC LIMIT ? OFFSET ?""",
        (limit, offset),
    ).fetchall()
    conn.close()
    return {"logs": [dict(r) for r in rows], "total": total}


def get_import_log(log_id: int) -> Optional[dict]:
    import json
    conn = _get_conn()
    row = conn.execute("SELECT * FROM import_logs WHERE id=?", (log_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["errors"] = json.loads(d.pop("errors_json", "[]"))
    d["rows"] = json.loads(d.pop("rows_json", "[]"))
    return d


def delete_import_log(log_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM import_logs WHERE id=?", (log_id,))
    conn.commit()
    conn.close()


def build_result_csv(log: dict) -> str:
    """
    Return a CSV with ALL original rows plus two appended columns:
      status  — "ok" | "error"
      message — "" for ok rows, reason for error rows

    Rows that already have _status/_message (set by csv_import_service) are used
    directly. Rows without those keys (older logs) fall back to the errors list.
    """
    import csv as _csv, io, json

    rows: list[dict] = log.get("rows", [])
    if not rows:
        return ""

    errors: list[dict] = log.get("errors", [])

    # Fallback: build row_number → message map from errors list (for legacy logs)
    err_map: dict[int, str] = {}
    for e in errors:
        row_num = e.get("row", 0)
        msg = f"[{e.get('field','')}] {e.get('message','')}"
        if row_num not in err_map:
            err_map[row_num] = msg
        else:
            err_map[row_num] += " | " + msg

    result_rows = []
    for i, row in enumerate(rows, start=2):
        r = {k: v for k, v in row.items() if not k.startswith("_")}
        if "_status" in row:
            r["status"] = row["_status"]
            r["message"] = row.get("_message", "")
        else:
            # Legacy log — derive from err_map
            if i in err_map:
                r["status"] = "error"
                r["message"] = err_map[i]
            else:
                r["status"] = "ok"
                r["message"] = ""
        result_rows.append(r)

    buf = io.StringIO()
    fieldnames = list(result_rows[0].keys())
    writer = _csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(result_rows)
    return buf.getvalue()


# ── Product Variants ──────────────────────────────────────────────────────────

def create_variant(product_id: int, data: dict) -> dict:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO product_variants(product_id, name, sku_suffix, fixed_cost, selling_price, default_unit_cost, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (product_id, data["name"], data.get("sku_suffix"), data.get("fixed_cost"), data.get("selling_price"), data.get("default_unit_cost"), data.get("color", "#6b7280"), now, now),
    )
    conn.commit()
    vid = conn.last_insert_id(cur)
    row = conn.execute("SELECT * FROM product_variants WHERE id=?", (vid,)).fetchone()
    conn.close()
    return dict(row)


def update_variant(variant_id: int, data: dict) -> Optional[dict]:
    allowed = {"name", "sku_suffix", "fixed_cost", "selling_price", "default_unit_cost", "color"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn = _get_conn()
        row = conn.execute("SELECT * FROM product_variants WHERE id=?", (variant_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in fields)
    conn = _get_conn()
    conn.execute(f"UPDATE product_variants SET {set_clause} WHERE id=?", (*fields.values(), variant_id))
    conn.commit()
    row = conn.execute("SELECT * FROM product_variants WHERE id=?", (variant_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_variant(variant_id: int):
    conn = _get_conn()
    conn.execute("DELETE FROM product_variants WHERE id=?", (variant_id,))
    conn.commit()
    conn.close()


# ── Stock Levels ──────────────────────────────────────────────────────────────

def get_stock_level(variant_id: int, warehouse_id: int, conn: DbConn) -> tuple[float, float]:
    """Returns (qty, avg_cost) for a variant+warehouse."""
    row = conn.execute(
        "SELECT qty, avg_cost FROM stock_levels WHERE variant_id=? AND warehouse_id=?",
        (variant_id, warehouse_id),
    ).fetchone()
    return (row["qty"], row["avg_cost"]) if row else (0.0, 0.0)


def _upsert_stock_level(variant_id: int, warehouse_id: int, qty: float, avg_cost: float, conn: DbConn):
    conn.execute(
        """INSERT INTO stock_levels(variant_id, warehouse_id, qty, avg_cost)
           VALUES (?,?,?,?)
           ON CONFLICT(variant_id, warehouse_id) DO UPDATE SET qty=excluded.qty, avg_cost=excluded.avg_cost""",
        (variant_id, warehouse_id, qty, avg_cost),
    )


def list_stock_levels(
    warehouse_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    category_id: Optional[int] = None,
    subcategory_id: Optional[int] = None,
    product_name_search: Optional[str] = None,
) -> list[dict]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if warehouse_id is not None:
        conditions.append("sl.warehouse_id=?")
        params.append(warehouse_id)
    if brand_id is not None:
        conditions.append("p.brand_id=?")
        params.append(brand_id)
    if subcategory_id is not None:
        conditions.append("p.subcategory_id=?")
        params.append(subcategory_id)
    if category_id is not None:
        conditions.append("sc.category_id=?")
        params.append(category_id)
    if product_name_search:
        conditions.append(f"p.name {conn.like_op()} ?")
        params.append(f"%{product_name_search}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
        f"""SELECT sl.*, pv.name AS variant_name, pv.sku_suffix,
               p.id AS product_id, p.name AS product_name, p.unit, p.min_stock, p.sku AS product_sku,
               p.brand_id,
               b.name AS brand_name,
               sc.id AS subcategory_id, sc.name AS subcategory_name,
               sc.category_id,
               w.name AS warehouse_name
            FROM stock_levels sl
            JOIN product_variants pv ON sl.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
            JOIN warehouses w ON sl.warehouse_id = w.id
            {where}
            ORDER BY p.name ASC, pv.name ASC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Cost calculation helpers ──────────────────────────────────────────────────

def _calc_fifo_cost(variant_id: int, warehouse_id: int, qty_needed: float, conn: DbConn) -> tuple[float, list[dict]]:
    """
    Returns (total_cost, list of batch deductions).
    Raises ValueError if insufficient stock.
    """
    batches = conn.execute(
        """SELECT id, qty_remaining, purchase_price FROM stock_batches
           WHERE variant_id=? AND warehouse_id=? AND qty_remaining > 0
           ORDER BY date ASC, id ASC""",
        (variant_id, warehouse_id),
    ).fetchall()

    total_cost = 0.0
    deductions = []
    remaining = qty_needed

    for b in batches:
        if remaining <= 0:
            break
        take = min(remaining, b["qty_remaining"])
        total_cost += take * b["purchase_price"]
        deductions.append({"id": b["id"], "qty": take, "price": b["purchase_price"]})
        remaining -= take

    if remaining > 0.001:
        raise ValueError(f"Stok tidak mencukupi: kurang {remaining:.3f} unit")

    return total_cost, deductions


def _apply_fifo_deductions(deductions: list[dict], conn: DbConn):
    for d in deductions:
        conn.execute(
            "UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id=?",
            (d["qty"], d["id"]),
        )


# ── Stock Movements ───────────────────────────────────────────────────────────

def create_movement(data: dict, finance_service=None) -> dict:
    """
    data keys: variant_id, warehouse_id, type, qty, unit_cost, cost_method,
               note, date, link_finance, finance_account_id, finance_category_id,
               selling_price (for OUT movements; pre-filled from variant if omitted)
    finance_service: the finance_service module, injected to avoid circular import
    """
    import datetime
    now = _now()
    date = data.get("date") or datetime.date.today().isoformat()
    variant_id   = data["variant_id"]
    warehouse_id = data["warehouse_id"]
    mv_type      = data["type"]
    qty          = float(data["qty"])
    unit_cost    = data.get("unit_cost")
    cost_method  = data.get("cost_method", "average")
    selling_price = data.get("selling_price")

    if mv_type in ("in", "out") and qty <= 0:
        raise ValueError("Qty harus lebih dari 0")
    if mv_type in ("opname", "adjustment") and qty == 0:
        raise ValueError("Qty tidak boleh 0")

    conn = _get_conn()
    try:
        # Lock the stock_levels row so concurrent movements on the same
        # variant+warehouse are serialized (no-op on SQLite, SELECT FOR UPDATE on PG).
        conn.lock_for_update(
            "stock_levels",
            "variant_id=? AND warehouse_id=?",
            (variant_id, warehouse_id),
        )
        cur_qty, cur_avg = get_stock_level(variant_id, warehouse_id, conn)
        total_cost = None
        finance_tx_id = None

        if mv_type == "in":
            # pre-fill unit_cost from variant default if not provided
            if unit_cost is None:
                vrow = conn.execute("SELECT default_unit_cost FROM product_variants WHERE id=?", (variant_id,)).fetchone()
                if vrow and vrow["default_unit_cost"] is not None:
                    unit_cost = vrow["default_unit_cost"]
            if unit_cost is None:
                raise ValueError("unit_cost wajib untuk stok masuk")
            total_cost = qty * unit_cost
            new_qty = cur_qty + qty
            # recalculate avg cost
            new_avg = ((cur_qty * cur_avg) + total_cost) / new_qty if new_qty > 0 else unit_cost
            _upsert_stock_level(variant_id, warehouse_id, new_qty, new_avg, conn)

        elif mv_type == "out":
            if cur_qty < qty:
                raise ValueError(f"Stok tidak mencukupi: tersedia {cur_qty:.3f}")

            # pre-fill selling_price from variant default if not provided
            if selling_price is None:
                vrow = conn.execute("SELECT selling_price FROM product_variants WHERE id=?", (variant_id,)).fetchone()
                if vrow and vrow["selling_price"] is not None:
                    selling_price = vrow["selling_price"]

            if cost_method == "fifo":
                total_cost, deductions = _calc_fifo_cost(variant_id, warehouse_id, qty, conn)
                _apply_fifo_deductions(deductions, conn)
                unit_cost = total_cost / qty if qty > 0 else 0.0
            elif cost_method == "fixed":
                row = conn.execute("SELECT fixed_cost FROM product_variants WHERE id=?", (variant_id,)).fetchone()
                fc = row["fixed_cost"] if row and row["fixed_cost"] is not None else 0.0
                unit_cost = fc
                total_cost = qty * fc
                # deduct from batches proportionally (oldest first)
                rem = qty
                batches = conn.execute(
                    "SELECT id, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? AND qty_remaining>0 ORDER BY date ASC, id ASC",
                    (variant_id, warehouse_id),
                ).fetchall()
                for b in batches:
                    if rem <= 0:
                        break
                    take = min(rem, b["qty_remaining"])
                    conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining-? WHERE id=?", (take, b["id"]))
                    rem -= take
            else:  # average
                unit_cost = cur_avg
                total_cost = qty * cur_avg
                # deduct batches oldest first
                rem = qty
                batches = conn.execute(
                    "SELECT id, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? AND qty_remaining>0 ORDER BY date ASC, id ASC",
                    (variant_id, warehouse_id),
                ).fetchall()
                for b in batches:
                    if rem <= 0:
                        break
                    take = min(rem, b["qty_remaining"])
                    conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining-? WHERE id=?", (take, b["id"]))
                    rem -= take

            new_qty = cur_qty - qty
            if new_qty < 0:
                raise ValueError(f"Stok tidak mencukupi: tersedia {cur_qty:.3f}")
            _upsert_stock_level(variant_id, warehouse_id, new_qty, cur_avg, conn)

        elif mv_type in ("opname", "adjustment"):
            # qty here is the delta (positive = found more, negative = shrinkage)
            new_qty = cur_qty + qty
            if new_qty < 0:
                raise ValueError("Qty hasil opname tidak boleh negatif")
            new_avg = cur_avg  # avg cost unchanged on opname
            if unit_cost is not None:
                total_cost = abs(qty) * unit_cost
            _upsert_stock_level(variant_id, warehouse_id, new_qty, new_avg, conn)
            # adjust batches if shrinkage
            if qty < 0:
                rem = abs(qty)
                batches = conn.execute(
                    "SELECT id, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? AND qty_remaining>0 ORDER BY date ASC, id ASC",
                    (variant_id, warehouse_id),
                ).fetchall()
                for b in batches:
                    if rem <= 0:
                        break
                    take = min(rem, b["qty_remaining"])
                    conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining-? WHERE id=?", (take, b["id"]))
                    rem -= take

        # ── Finance integration ───────────────────────────────────────────────
        if data.get("link_finance") and finance_service and total_cost and total_cost > 0:
            acc_id = data.get("finance_account_id")
            cat_id = data.get("finance_category_id")
            if acc_id:
                tx_type = "expense" if mv_type in ("out", "opname", "adjustment") else "expense"
                if mv_type == "in":
                    tx_type = "expense"  # purchasing stock = expense (COGS when sold)
                fx_data = {
                    "account_id": acc_id,
                    "category_id": cat_id,
                    "type": tx_type,
                    "amount": total_cost,
                    "date": date,
                    "description": data.get("note") or f"Stok {mv_type}",
                    "note": "Otomatis dari Inventaris",
                }
                try:
                    tx = finance_service.create_transaction(fx_data)
                    finance_tx_id = tx["id"]
                except Exception:
                    pass  # finance integration failure is non-fatal

        cur2 = conn.execute(
            """INSERT INTO stock_movements(variant_id, warehouse_id, type, qty, unit_cost, cost_method, total_cost, note, date, finance_tx_id, finance_linked, selling_price, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (variant_id, warehouse_id, mv_type, qty, unit_cost, cost_method,
             total_cost, data.get("note"), date,
             finance_tx_id, 1 if finance_tx_id else 0, selling_price, now),
        )
        mv_id = conn.last_insert_id(cur2)

        # Insert batch for IN with movement_id already set
        if mv_type == "in":
            conn.execute(
                """INSERT INTO stock_batches(variant_id, warehouse_id, movement_id, purchase_price, qty_initial, qty_remaining, date, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (variant_id, warehouse_id, mv_id, unit_cost, qty, qty, date, now),
            )

        conn.commit()

        row = conn.execute("SELECT * FROM stock_movements WHERE id=?", (mv_id,)).fetchone()
        conn.close()
        return dict(row)

    except Exception:
        conn.close()
        raise


def patch_movement_finance(movement_id: int, data: dict, finance_service=None) -> dict:
    """
    Toggle or update the finance link for an existing movement.
    data keys:
      link_finance: bool  — True to create/update link, False to remove it
      finance_account_id: int | None
      finance_category_id: int | None
    """
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM stock_movements WHERE id=?", (movement_id,)).fetchone()
        if not row:
            raise ValueError(f"Movement {movement_id} tidak ditemukan")
        mv = dict(row)

        link = bool(data.get("link_finance", False))

        # Remove existing finance transaction if present
        old_tx_id = mv.get("finance_tx_id")
        if old_tx_id and finance_service:
            try:
                finance_service.delete_transaction(old_tx_id)
            except Exception:
                pass  # tx may have been deleted manually — non-fatal

        if not link:
            # Unlink: clear finance fields
            conn.execute(
                "UPDATE stock_movements SET finance_tx_id=NULL, finance_linked=0 WHERE id=?",
                (movement_id,),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM stock_movements WHERE id=?", (movement_id,)).fetchone()
            conn.close()
            return dict(row)

        # Link: create a new finance transaction
        acc_id = data.get("finance_account_id")
        cat_id = data.get("finance_category_id")
        if not acc_id:
            raise ValueError("Akun keuangan wajib dipilih untuk mencatat keuangan")
        if not finance_service:
            raise ValueError("Finance service tidak tersedia")

        total_cost = mv.get("total_cost") or 0
        if total_cost <= 0:
            raise ValueError("Nilai HPP pergerakan ini 0 — tidak dapat dicatat ke keuangan")

        mv_type = mv["type"]
        tx_type = "income" if mv_type == "out" else "expense"
        amount = mv.get("selling_price", total_cost) if mv_type == "out" else total_cost
        if mv_type == "out" and mv.get("selling_price"):
            amount = mv["selling_price"] * mv["qty"]
        else:
            amount = total_cost

        fx_data = {
            "account_id": acc_id,
            "category_id": cat_id,
            "type": tx_type,
            "amount": amount,
            "date": mv["date"],
            "description": mv.get("note") or f"Stok {mv_type}",
            "note": "Otomatis dari Inventaris",
        }
        tx = finance_service.create_transaction(fx_data)
        new_tx_id = tx["id"]

        conn.execute(
            "UPDATE stock_movements SET finance_tx_id=?, finance_linked=1 WHERE id=?",
            (new_tx_id, movement_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM stock_movements WHERE id=?", (movement_id,)).fetchone()
        conn.close()
        return dict(row)

    except Exception:
        conn.close()
        raise


def delete_movement(movement_id: int, finance_service=None) -> None:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM stock_movements WHERE id=?", (movement_id,)).fetchone()
        if not row:
            raise ValueError(f"Movement {movement_id} tidak ditemukan")
        mv = dict(row)

        variant_id   = mv["variant_id"]
        warehouse_id = mv["warehouse_id"]
        mv_type      = mv["type"]
        qty          = mv["qty"]  # always positive for in/out/adjustment; delta for opname

        cur_qty, cur_avg = get_stock_level(variant_id, warehouse_id, conn)

        if mv_type == "in":
            new_qty = cur_qty - qty
            if new_qty < -0.001:  # toleransi floating point
                raise ValueError(
                    f"Tidak dapat menghapus: stok saat ini ({cur_qty:.3f}) lebih kecil dari qty movement ({qty:.3f}). "
                    "Hapus pergerakan stok keluar yang bergantung pada batch ini terlebih dahulu."
                )
            # Remove the batch created by this movement
            conn.execute(
                "DELETE FROM stock_batches WHERE movement_id=? AND variant_id=? AND warehouse_id=?",
                (movement_id, variant_id, warehouse_id),
            )
            # Recalculate avg_cost from remaining batches
            remaining = conn.execute(
                "SELECT purchase_price, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? AND qty_remaining>0",
                (variant_id, warehouse_id),
            ).fetchall()
            if new_qty > 0 and remaining:
                total_val = sum(r["purchase_price"] * r["qty_remaining"] for r in remaining)
                total_rem = sum(r["qty_remaining"] for r in remaining)
                new_avg = total_val / total_rem if total_rem > 0 else 0.0
            else:
                new_avg = cur_avg
            _upsert_stock_level(variant_id, warehouse_id, max(0.0, new_qty), new_avg, conn)

        elif mv_type == "out":
            # Restore qty; refill batches newest-first (reverse of FIFO deduction)
            new_qty = cur_qty + qty
            rem = qty
            batches = conn.execute(
                "SELECT id, qty_initial, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? ORDER BY date DESC, id DESC",
                (variant_id, warehouse_id),
            ).fetchall()
            for b in batches:
                if rem <= 0:
                    break
                space = b["qty_initial"] - b["qty_remaining"]
                restore = min(rem, space)
                if restore > 0:
                    conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining+? WHERE id=?", (restore, b["id"]))
                    rem -= restore
            _upsert_stock_level(variant_id, warehouse_id, new_qty, cur_avg, conn)

        elif mv_type in ("opname", "adjustment"):
            # qty is the delta applied; reverse it
            new_qty = cur_qty - qty
            if qty < 0:
                # Was shrinkage — batches were deducted; restore newest-first
                rem = abs(qty)
                batches = conn.execute(
                    "SELECT id, qty_initial, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? ORDER BY date DESC, id DESC",
                    (variant_id, warehouse_id),
                ).fetchall()
                for b in batches:
                    if rem <= 0:
                        break
                    space = b["qty_initial"] - b["qty_remaining"]
                    restore = min(rem, space)
                    if restore > 0:
                        conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining+? WHERE id=?", (restore, b["id"]))
                        rem -= restore
            _upsert_stock_level(variant_id, warehouse_id, max(0.0, new_qty), cur_avg, conn)

        # Delete linked finance transaction (non-fatal)
        if mv.get("finance_tx_id") and finance_service:
            try:
                finance_service.delete_transaction(mv["finance_tx_id"])
            except Exception:
                pass

        conn.execute("DELETE FROM stock_movements WHERE id=?", (movement_id,))
        conn.commit()
        conn.close()
    except Exception:
        conn.close()
        raise


def list_movements(
    variant_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    mv_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    conditions = []
    params: list = []
    if variant_id:
        conditions.append("m.variant_id=?"); params.append(variant_id)
    if warehouse_id:
        conditions.append("m.warehouse_id=?"); params.append(warehouse_id)
    if mv_type:
        conditions.append("m.type=?"); params.append(mv_type)
    if date_from:
        conditions.append("m.date>=?"); params.append(date_from)
    if date_to:
        conditions.append("m.date<=?"); params.append(date_to)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    conn = _get_conn()
    total = conn.execute(
        f"SELECT COUNT(*) FROM stock_movements m {where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"""SELECT m.*,
               pv.name AS variant_name, pv.sku_suffix,
               p.name AS product_name, p.unit,
               w.name AS warehouse_name
            FROM stock_movements m
            JOIN product_variants pv ON m.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN warehouses w ON m.warehouse_id = w.id
            {where}
            ORDER BY m.date DESC, m.id DESC
            LIMIT ? OFFSET ?""",
        [*params, limit, offset],
    ).fetchall()
    conn.close()
    return {"movements": [dict(r) for r in rows], "total": total}


# ── Stock Opname ──────────────────────────────────────────────────────────────

def create_opname(data: dict, finance_service=None) -> list[dict]:
    """
    Processes a stock opname session. Returns list of created movements.
    Stock is set directly to physical_qty (not delta-based) to avoid stale reads.
    Shrinkage (negative delta) can be linked to finance as expense.
    """
    import datetime
    now = _now()
    date = data.get("date") or datetime.date.today().isoformat()
    results = []

    # Single connection for the entire opname session — all items commit together
    # so a failure on item N rolls back items 1..N-1 as well.
    conn = _get_conn()
    try:
        for item in data.get("items", []):
            variant_id   = item["variant_id"]
            warehouse_id = item["warehouse_id"]
            physical_qty = float(item["physical_qty"])

            if physical_qty < 0:
                raise ValueError("Qty fisik tidak boleh negatif")

            # Lock the row so no concurrent movement can change qty between our
            # read and write (no-op on SQLite, SELECT FOR UPDATE on PostgreSQL).
            conn.lock_for_update(
                "stock_levels",
                "variant_id=? AND warehouse_id=?",
                (variant_id, warehouse_id),
            )
            cur_qty, cur_avg = get_stock_level(variant_id, warehouse_id, conn)
            delta = physical_qty - cur_qty

            if abs(delta) < 0.001:
                continue  # no difference, skip

            total_cost = None
            finance_tx_id = None

            # Set stock level directly to physical qty
            _upsert_stock_level(variant_id, warehouse_id, physical_qty, cur_avg, conn)

            # Adjust batches
            if delta < 0:
                # Shrinkage — deduct from oldest batches
                rem = abs(delta)
                batches = conn.execute(
                    "SELECT id, qty_remaining FROM stock_batches WHERE variant_id=? AND warehouse_id=? AND qty_remaining>0 ORDER BY date ASC, id ASC",
                    (variant_id, warehouse_id),
                ).fetchall()
                for b in batches:
                    if rem <= 0:
                        break
                    take = min(rem, b["qty_remaining"])
                    conn.execute("UPDATE stock_batches SET qty_remaining=qty_remaining-? WHERE id=?", (take, b["id"]))
                    rem -= take
                total_cost = abs(delta) * cur_avg
            # positive delta: new stock found — add a batch
            elif delta > 0:
                conn.execute(
                    """INSERT INTO stock_batches(variant_id, warehouse_id, purchase_price, qty_initial, qty_remaining, date, created_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (variant_id, warehouse_id, cur_avg, delta, delta, date, now),
                )

            # Finance integration for shrinkage (outside main transaction — non-fatal)
            if delta < 0 and data.get("link_finance") and finance_service:
                acc_id = data.get("finance_account_id")
                cat_id = data.get("shrinkage_category_id")
                if acc_id and total_cost and total_cost > 0:
                    try:
                        tx = finance_service.create_transaction({
                            "account_id":  acc_id,
                            "category_id": cat_id,
                            "type":        "expense",
                            "amount":      total_cost,
                            "date":        date,
                            "description": data.get("note") or "Penyusutan Stok (Opname)",
                            "note":        "Otomatis dari Inventaris",
                        })
                        finance_tx_id = tx["id"]
                    except Exception:
                        pass

            # Record movement for audit trail
            cur2 = conn.execute(
                """INSERT INTO stock_movements(variant_id, warehouse_id, type, qty, unit_cost, cost_method, total_cost, note, date, finance_tx_id, finance_linked, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (variant_id, warehouse_id, "opname", delta, cur_avg, "average",
                 total_cost, data.get("note") or "Stock Opname", date,
                 finance_tx_id, 1 if finance_tx_id else 0, now),
            )
            mv_id = conn.last_insert_id(cur2)
            results.append(mv_id)

        # Single commit covers all items — atomically or not at all
        conn.commit()

        # Fetch rows after commit (safe: ids already captured)
        rows = [
            dict(conn.execute("SELECT * FROM stock_movements WHERE id=?", (mid,)).fetchone())
            for mid in results
        ]
        conn.close()
        return rows

    except Exception:
        conn.rollback()
        conn.close()
        raise


# ── Dashboard / Reports ───────────────────────────────────────────────────────

def get_dashboard(warehouse_id: Optional[int] = None) -> dict:
    conn = _get_conn()

    # Total stock value — split into tradeable vs operational assets
    wh_filter = "AND sl.warehouse_id=?" if warehouse_id else ""
    params_wh = (warehouse_id,) if warehouse_id else ()
    asset_rows = conn.execute(
        f"""SELECT p.is_for_sale, COALESCE(SUM(sl.qty * sl.avg_cost), 0) AS total
            FROM stock_levels sl
            JOIN product_variants pv ON sl.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            {('WHERE sl.warehouse_id=?' if warehouse_id else '')}
            GROUP BY p.is_for_sale""",
        params_wh,
    ).fetchall()
    trade_asset_value = 0.0
    operational_asset_value = 0.0
    for r in asset_rows:
        if r["is_for_sale"]:
            trade_asset_value = r["total"]
        else:
            operational_asset_value = r["total"]
    total_asset_value = trade_asset_value + operational_asset_value

    # Total product count and low-stock items
    low_stock = conn.execute(
        f"""SELECT COUNT(DISTINCT sl.variant_id) AS cnt
            FROM stock_levels sl
            JOIN product_variants pv ON sl.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE sl.qty <= p.min_stock AND p.active=1
            {wh_filter.replace('sl.warehouse_id', 'sl.warehouse_id')}""",
        params_wh,
    ).fetchone()["cnt"]

    # HPP value (OUT movements) this month
    import datetime
    month_start = datetime.date.today().replace(day=1).isoformat()
    hpp_params = [month_start, "out"]
    hpp_wh = ""
    if warehouse_id:
        hpp_wh = "AND warehouse_id=?"
        hpp_params.append(warehouse_id)
    hpp_row = conn.execute(
        f"SELECT COALESCE(SUM(total_cost), 0) AS total FROM stock_movements WHERE date>=? AND type=? {hpp_wh}",
        hpp_params,
    ).fetchone()
    hpp_this_month = hpp_row["total"]

    # Inventory turnover (last 12 months): COGS / avg stock value
    year_ago = (datetime.date.today().replace(day=1) - datetime.timedelta(days=365)).isoformat()
    cogs_params = [year_ago, "out"]
    if warehouse_id:
        cogs_params.append(warehouse_id)
    cogs_row = conn.execute(
        f"SELECT COALESCE(SUM(total_cost), 0) AS total FROM stock_movements WHERE date>=? AND type=? {'AND warehouse_id=?' if warehouse_id else ''}",
        cogs_params,
    ).fetchone()
    annual_cogs = cogs_row["total"]
    turnover = round(annual_cogs / total_asset_value, 2) if total_asset_value > 0 else 0.0

    # Monthly HPP for chart (last 12 months)
    monthly_params = [year_ago, "out"]
    if warehouse_id:
        monthly_params.append(warehouse_id)
    monthly = conn.execute(
        f"""SELECT {conn.month_format('date')} AS month, COALESCE(SUM(total_cost), 0) AS hpp
            FROM stock_movements
            WHERE date>=? AND type=? {'AND warehouse_id=?' if warehouse_id else ''}
            GROUP BY month ORDER BY month ASC""",
        monthly_params,
    ).fetchall()

    # Gross margin this month (OUT movements with selling_price set)
    gm_params = [month_start, "out"]
    if warehouse_id:
        gm_params.append(warehouse_id)
    gm_row = conn.execute(
        f"""SELECT
               COALESCE(SUM(selling_price * qty), 0) AS revenue,
               COALESCE(SUM(total_cost), 0) AS cogs
            FROM stock_movements
            WHERE date>=? AND type=? AND selling_price IS NOT NULL {hpp_wh}""",
        gm_params,
    ).fetchone()
    gross_revenue_month = gm_row["revenue"]
    gross_margin_month = gross_revenue_month - (gm_row["cogs"] if gm_row["cogs"] else 0)
    gross_margin_pct = round((gross_margin_month / gross_revenue_month * 100), 1) if gross_revenue_month > 0 else 0.0

    # Low-stock items detail
    ls_params = list(params_wh)
    low_items = conn.execute(
        f"""SELECT p.name AS product_name, pv.name AS variant_name,
                   sl.qty, p.min_stock, p.unit, w.name AS warehouse_name,
                   sl.avg_cost
            FROM stock_levels sl
            JOIN product_variants pv ON sl.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN warehouses w ON sl.warehouse_id = w.id
            WHERE sl.qty <= p.min_stock AND p.active=1
            {wh_filter}
            ORDER BY (sl.qty - p.min_stock) ASC
            LIMIT 20""",
        ls_params,
    ).fetchall()

    conn.close()
    return {
        "total_asset_value":        total_asset_value,
        "trade_asset_value":        trade_asset_value,
        "operational_asset_value":  operational_asset_value,
        "hpp_this_month":           hpp_this_month,
        "annual_cogs":              annual_cogs,
        "inventory_turnover":       turnover,
        "low_stock_count":          low_stock,
        "gross_revenue_month":      gross_revenue_month,
        "gross_margin_month":       gross_margin_month,
        "gross_margin_pct":         gross_margin_pct,
        "monthly_hpp":              [dict(r) for r in monthly],
        "low_stock_items":          [dict(r) for r in low_items],
    }


def get_turnover_report(months: int = 12, warehouse_id: Optional[int] = None) -> list[dict]:
    """Monthly: asset value (start of month) vs HPP (out movements)."""
    import datetime
    conn = _get_conn()
    start = (datetime.date.today().replace(day=1) - datetime.timedelta(days=30 * months)).isoformat()
    params = [start, "out"]
    wh = ""
    if warehouse_id:
        wh = "AND warehouse_id=?"
        params.append(warehouse_id)
    rows = conn.execute(
        f"""SELECT {conn.month_format('date')} AS month,
               COALESCE(SUM(total_cost), 0) AS hpp_out,
               COUNT(*) AS tx_count
            FROM stock_movements
            WHERE date>=? AND type=? {wh}
            GROUP BY month ORDER BY month ASC""",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_brand_report() -> list[dict]:
    """Per-brand: product count, stock value, hpp this month, revenue, margin."""
    import datetime
    month_start = datetime.date.today().replace(day=1).isoformat()
    conn = _get_conn()
    rows = conn.execute(
        """SELECT
               b.id AS brand_id, b.name AS brand_name,
               COUNT(DISTINCT p.id) AS product_count,
               COALESCE(SUM(sl.qty * sl.avg_cost), 0) AS stock_value,
               COALESCE(SUM(CASE WHEN m.type='out' AND m.date>=? THEN m.total_cost ELSE 0 END), 0) AS hpp_month,
               COALESCE(SUM(CASE WHEN m.type='out' AND m.date>=? AND m.selling_price IS NOT NULL
                                 THEN m.selling_price * m.qty ELSE 0 END), 0) AS revenue_month
           FROM brands b
           LEFT JOIN products p ON p.brand_id = b.id
           LEFT JOIN product_variants pv ON pv.product_id = p.id
           LEFT JOIN stock_levels sl ON sl.variant_id = pv.id
           LEFT JOIN stock_movements m ON m.variant_id = pv.id
           GROUP BY b.id ORDER BY b.name ASC""",
        (month_start, month_start),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["margin_month"] = d["revenue_month"] - d["hpp_month"]
        d["margin_pct"] = round(d["margin_month"] / d["revenue_month"] * 100, 1) if d["revenue_month"] > 0 else 0.0
        result.append(d)
    return result


def get_category_report() -> list[dict]:
    """Per-category → subcategory: product count, stock value, hpp, margin."""
    import datetime
    month_start = datetime.date.today().replace(day=1).isoformat()
    conn = _get_conn()
    rows = conn.execute(
        """SELECT
               c.id AS category_id, c.name AS category_name,
               sc.id AS subcategory_id, sc.name AS subcategory_name,
               COUNT(DISTINCT p.id) AS product_count,
               COALESCE(SUM(sl.qty * sl.avg_cost), 0) AS stock_value,
               COALESCE(SUM(CASE WHEN m.type='out' AND m.date>=? THEN m.total_cost ELSE 0 END), 0) AS hpp_month,
               COALESCE(SUM(CASE WHEN m.type='out' AND m.date>=? AND m.selling_price IS NOT NULL
                                 THEN m.selling_price * m.qty ELSE 0 END), 0) AS revenue_month
           FROM categories c
           LEFT JOIN subcategories sc ON sc.category_id = c.id
           LEFT JOIN products p ON p.subcategory_id = sc.id
           LEFT JOIN product_variants pv ON pv.product_id = p.id
           LEFT JOIN stock_levels sl ON sl.variant_id = pv.id
           LEFT JOIN stock_movements m ON m.variant_id = pv.id
           GROUP BY c.id, sc.id ORDER BY c.name ASC, sc.name ASC""",
        (month_start, month_start),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["margin_month"] = d["revenue_month"] - d["hpp_month"]
        d["margin_pct"] = round(d["margin_month"] / d["revenue_month"] * 100, 1) if d["revenue_month"] > 0 else 0.0
        result.append(d)
    return result


def get_profit_per_product(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warehouse_id: Optional[int] = None,
) -> list[dict]:
    """
    Per-variant profit report for OUT movements with selling_price set.
    Only includes products where is_for_sale=1.
    Returns rows ordered by revenue DESC.
    """
    conn = _get_conn()
    conditions = ["sm.type='out'", "sm.selling_price IS NOT NULL", "p.is_for_sale=1"]
    params: list = []
    if date_from:
        conditions.append("sm.date>=?"); params.append(date_from)
    if date_to:
        conditions.append("sm.date<=?"); params.append(date_to)
    if warehouse_id:
        conditions.append("sm.warehouse_id=?"); params.append(warehouse_id)
    where = "WHERE " + " AND ".join(conditions)

    rows = conn.execute(
        f"""SELECT
               p.id AS product_id,
               p.name AS product_name,
               p.sku AS product_sku,
               pv.id AS variant_id,
               pv.name AS variant_name,
               pv.sku_suffix,
               p.unit,
               COALESCE(SUM(sm.qty), 0) AS qty_sold,
               COALESCE(SUM(sm.selling_price * sm.qty), 0) AS revenue,
               COALESCE(SUM(sm.total_cost), 0) AS total_cost_sum
            FROM stock_movements sm
            JOIN product_variants pv ON sm.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            {where}
            GROUP BY p.id, pv.id
            ORDER BY revenue DESC""",
        params,
    ).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        variant_id = d["variant_id"]
        revenue = float(d["revenue"])
        cogs = float(d["total_cost_sum"])

        # Derive cost method from the most recent OUT movement for this variant
        cm_row = conn.execute(
            """SELECT cost_method FROM stock_movements
               WHERE variant_id=? AND type='out'
               ORDER BY date DESC, id DESC LIMIT 1""",
            (variant_id,),
        ).fetchone()
        cost_method = (cm_row["cost_method"] if cm_row and cm_row["cost_method"] else "average")

        profit = revenue - cogs
        margin = round(profit / revenue * 100, 1) if revenue > 0 else 0.0

        # Stock levels (sum across warehouses, or filtered to specific warehouse)
        if warehouse_id:
            sl_row = conn.execute(
                "SELECT COALESCE(SUM(qty), 0) AS qty, COALESCE(AVG(avg_cost), 0) AS avg_cost FROM stock_levels WHERE variant_id=? AND warehouse_id=?",
                (variant_id, warehouse_id),
            ).fetchone()
        else:
            sl_row = conn.execute(
                "SELECT COALESCE(SUM(qty), 0) AS qty, COALESCE(AVG(avg_cost), 0) AS avg_cost FROM stock_levels WHERE variant_id=?",
                (variant_id,),
            ).fetchone()
        stock_qty = float(sl_row["qty"]) if sl_row else 0.0
        avg_cost = float(sl_row["avg_cost"]) if sl_row else 0.0

        result.append({
            "product_id":     d["product_id"],
            "product_name":   d["product_name"],
            "product_sku":    d["product_sku"],
            "variant_id":     variant_id,
            "variant_name":   d["variant_name"],
            "sku_suffix":     d["sku_suffix"],
            "unit":           d["unit"],
            "cost_method":    cost_method,
            "qty_sold":       float(d["qty_sold"]),
            "revenue":        revenue,
            "cogs_fifo":      cogs,
            "cogs_average":   cogs,
            "cogs_fixed":     cogs,
            "profit_fifo":    profit,
            "profit_average": profit,
            "profit_fixed":   profit,
            "margin_fifo":    margin,
            "margin_average": margin,
            "margin_fixed":   margin,
            "stock_qty":      stock_qty,
            "stock_value":    round(stock_qty * avg_cost, 2),
        })

    conn.close()
    return result


init_db()
