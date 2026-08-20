"""
CSV import service for master data: products+variants, brands, categories,
subcategories, warehouses, product_categories.

Each import function returns:
  {
    "imported": int,
    "errors":   [{"row": int, "field": str, "message": str}],
    "rows":     [{"col": val, ..., "_status": "ok"|"error", "_message": str}]
  }

"rows" mirrors the original CSV rows with two appended columns:
  _status  — "ok" (imported) | "error" (skipped)
  _message — "" for ok rows, human-readable reason for error rows

This allows callers to reconstruct a full result CSV with all original data
intact plus status + message columns.
"""
import csv
import io
from typing import Any

from app.services.db_adapter import get_db


def _conn():
    return get_db("inventory")


# ── Template definitions ──────────────────────────────────────────────────────

TEMPLATES: dict[str, list[str]] = {
    "products": [
        "name", "sku", "unit", "min_stock",
        "brand_name", "subcategory_name", "active", "is_for_sale",
    ],
    "variants": [
        "product_sku", "variant_name", "sku_suffix",
        "fixed_cost", "selling_price", "default_unit_cost",
    ],
    "products_with_variants": [
        "name", "sku", "unit", "min_stock", "brand_name", "subcategory_name",
        "active", "is_for_sale",
        "variant_name", "sku_suffix", "selling_price", "default_unit_cost", "fixed_cost",
    ],
    "brands": ["name", "description"],
    "categories": ["name", "description"],
    "subcategories": ["category_name", "name", "description"],
    "warehouses": ["name", "location", "note"],
    "product_categories": ["name", "color"],
}

TEMPLATE_EXAMPLES: dict[str, list[dict]] = {
    "products": [
        {"name": "Laptop Bisnis", "sku": "LPT-001", "unit": "unit",
         "min_stock": "2", "brand_name": "HP Inc.", "subcategory_name": "Laptop",
         "active": "1", "is_for_sale": "1"},
        {"name": "Monitor 24\"", "sku": "MON-001", "unit": "unit",
         "min_stock": "3", "brand_name": "Samsung", "subcategory_name": "Monitor",
         "active": "1", "is_for_sale": "1"},
    ],
    "variants": [
        {"product_sku": "LPT-001", "variant_name": "8GB RAM", "sku_suffix": "8G",
         "fixed_cost": "7500000", "selling_price": "9500000", "default_unit_cost": "7500000"},
        {"product_sku": "LPT-001", "variant_name": "16GB RAM", "sku_suffix": "16G",
         "fixed_cost": "11000000", "selling_price": "14000000", "default_unit_cost": "11000000"},
    ],
    "products_with_variants": [
        {
            "name": "Laptop Bisnis", "sku": "LPT-001", "unit": "unit", "min_stock": "2",
            "brand_name": "HP Inc.", "subcategory_name": "Laptop", "active": "1", "is_for_sale": "1",
            "variant_name": "8GB RAM", "sku_suffix": "8G",
            "selling_price": "9500000", "default_unit_cost": "7500000", "fixed_cost": "",
        },
        {
            "name": "Laptop Bisnis", "sku": "LPT-001", "unit": "unit", "min_stock": "2",
            "brand_name": "HP Inc.", "subcategory_name": "Laptop", "active": "1", "is_for_sale": "1",
            "variant_name": "16GB RAM", "sku_suffix": "16G",
            "selling_price": "14000000", "default_unit_cost": "11000000", "fixed_cost": "",
        },
        {
            "name": "Monitor 24\"", "sku": "MON-001", "unit": "unit", "min_stock": "3",
            "brand_name": "Samsung", "subcategory_name": "Monitor", "active": "1", "is_for_sale": "1",
            "variant_name": "Default", "sku_suffix": "",
            "selling_price": "2500000", "default_unit_cost": "1800000", "fixed_cost": "",
        },
    ],
    "brands": [
        {"name": "Samsung", "description": "Electronics manufacturer"},
        {"name": "HP Inc.", "description": "Computer hardware"},
    ],
    "categories": [
        {"name": "Elektronik", "description": "Perangkat elektronik"},
        {"name": "Furniture", "description": "Perabot kantor"},
    ],
    "subcategories": [
        {"category_name": "Elektronik", "name": "Monitor", "description": ""},
        {"category_name": "Elektronik", "name": "Laptop", "description": ""},
    ],
    "warehouses": [
        {"name": "Gudang Utama", "location": "Jakarta", "note": ""},
        {"name": "Gudang Cabang", "location": "Bandung", "note": ""},
    ],
    "product_categories": [
        {"name": "Elektronik", "color": "#3b82f6"},
        {"name": "Furniture", "color": "#10b981"},
    ],
}


def generate_template(import_type: str) -> str:
    if import_type not in TEMPLATES:
        raise ValueError(f"Unknown import type: {import_type}")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=TEMPLATES[import_type])
    writer.writeheader()
    for row in TEMPLATE_EXAMPLES.get(import_type, []):
        writer.writerow(row)
    return buf.getvalue()


# ── Helpers ───────────────────────────────────────────────────────────────────

MAX_IMPORT_ROWS = 500


def _parse_csv(content: str, required_cols: list[str]) -> tuple[list[dict], list[dict]]:
    """Parse CSV string. Returns (rows, errors). rows have no _status yet."""
    try:
        reader = csv.DictReader(io.StringIO(content.strip()))
        if not reader.fieldnames:
            return [], [{"row": 0, "field": "file", "message": "File kosong atau tidak ada header"}]
        missing = [c for c in required_cols if c not in reader.fieldnames]
        if missing:
            return [], [{"row": 0, "field": "header",
                         "message": f"Kolom wajib tidak ada: {', '.join(missing)}"}]
        rows = [dict(r) for r in reader]
        if len(rows) > MAX_IMPORT_ROWS:
            return [], [{"row": 0, "field": "file",
                         "message": f"File terlalu besar: {len(rows)} baris melebihi batas {MAX_IMPORT_ROWS} baris per import. Pecah file menjadi beberapa bagian."}]
        return rows, []
    except Exception as e:
        return [], [{"row": 0, "field": "file", "message": f"Gagal membaca CSV: {e}"}]


def _clean(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def _ok(row: dict) -> None:
    """Mark a row as successfully imported."""
    row["_status"] = "ok"
    row["_message"] = ""


def _err(row: dict, errors: list[dict], row_num: int, field: str, message: str) -> None:
    """Mark a row as failed and append to the errors list."""
    row["_status"] = "error"
    row["_message"] = f"[{field}] {message}"
    errors.append({"row": row_num, "field": field, "message": message})


# ── Import: Brands ─────────────────────────────────────────────────────────────

def import_brands(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    existing = {r["name"].lower() for r in conn.execute("SELECT name FROM brands").fetchall()}
    errors: list[dict] = []
    imported = 0

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        name = _clean(row.get("name"))
        if not name:
            _err(row, errors, i, "name", "Nama tidak boleh kosong"); continue
        if name.lower() in existing:
            _err(row, errors, i, "name", f"Brand '{name}' sudah ada"); continue
        conn.execute(
            "INSERT INTO brands(name, description, created_at, updated_at) VALUES(?,?,?,?)",
            (name, _clean(row.get("description")), now, now),
        )
        conn.commit()
        existing.add(name.lower())
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Categories ────────────────────────────────────────────────────────

def import_categories(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    existing = {r["name"].lower() for r in conn.execute("SELECT name FROM categories").fetchall()}
    errors: list[dict] = []
    imported = 0

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        name = _clean(row.get("name"))
        if not name:
            _err(row, errors, i, "name", "Nama tidak boleh kosong"); continue
        if name.lower() in existing:
            _err(row, errors, i, "name", f"Kategori '{name}' sudah ada"); continue
        conn.execute(
            "INSERT INTO categories(name, description, created_at, updated_at) VALUES(?,?,?,?)",
            (name, _clean(row.get("description")), now, now),
        )
        conn.commit()
        existing.add(name.lower())
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Subcategories ─────────────────────────────────────────────────────

def import_subcategories(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["category_name", "name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    cat_map = {r["name"].lower(): r["id"]
               for r in conn.execute("SELECT id, name FROM categories").fetchall()}
    existing = {(r["category_id"], r["name"].lower())
                for r in conn.execute("SELECT category_id, name FROM subcategories").fetchall()}
    errors: list[dict] = []
    imported = 0

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        cat_name = _clean(row.get("category_name"))
        name = _clean(row.get("name"))
        if not name:
            _err(row, errors, i, "name", "Nama tidak boleh kosong"); continue
        if not cat_name:
            _err(row, errors, i, "category_name", "Nama kategori tidak boleh kosong"); continue
        cat_id = cat_map.get(cat_name.lower())
        if cat_id is None:
            _err(row, errors, i, "category_name",
                 f"Kategori '{cat_name}' tidak ditemukan. Tambahkan kategori terlebih dahulu."); continue
        if (cat_id, name.lower()) in existing:
            _err(row, errors, i, "name",
                 f"Subkategori '{name}' di kategori '{cat_name}' sudah ada"); continue
        conn.execute(
            "INSERT INTO subcategories(category_id, name, description, created_at, updated_at) VALUES(?,?,?,?,?)",
            (cat_id, name, _clean(row.get("description")), now, now),
        )
        conn.commit()
        existing.add((cat_id, name.lower()))
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Warehouses ────────────────────────────────────────────────────────

def import_warehouses(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    existing = {r["name"].lower() for r in conn.execute("SELECT name FROM warehouses").fetchall()}
    errors: list[dict] = []
    imported = 0

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        name = _clean(row.get("name"))
        if not name:
            _err(row, errors, i, "name", "Nama tidak boleh kosong"); continue
        if name.lower() in existing:
            _err(row, errors, i, "name", f"Gudang '{name}' sudah ada"); continue
        conn.execute(
            "INSERT INTO warehouses(name, location, note, created_at, updated_at) VALUES(?,?,?,?,?)",
            (name, _clean(row.get("location")), _clean(row.get("note")), now, now),
        )
        conn.commit()
        existing.add(name.lower())
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Product Categories ────────────────────────────────────────────────

def import_product_categories(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    existing = {r["name"].lower()
                for r in conn.execute("SELECT name FROM product_categories").fetchall()}
    errors: list[dict] = []
    imported = 0

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        name = _clean(row.get("name"))
        if not name:
            _err(row, errors, i, "name", "Nama tidak boleh kosong"); continue
        if name.lower() in existing:
            _err(row, errors, i, "name", f"Kategori produk '{name}' sudah ada"); continue
        color = _clean(row.get("color")) or "#6b7280"
        conn.execute(
            "INSERT INTO product_categories(name, color, created_at) VALUES(?,?,?)",
            (name, color, now),
        )
        conn.commit()
        existing.add(name.lower())
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Products ──────────────────────────────────────────────────────────

def import_products(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["name", "sku"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    existing_skus = {r["sku"].lower() for r in
                     conn.execute("SELECT sku FROM products WHERE sku IS NOT NULL AND sku != ''").fetchall()}
    brand_map = {r["name"].lower(): r["id"]
                 for r in conn.execute("SELECT id, name FROM brands").fetchall()}
    subcat_map = {r["name"].lower(): r["id"]
                  for r in conn.execute("SELECT id, name FROM subcategories").fetchall()}

    errors: list[dict] = []
    imported = 0
    batch_skus: set[str] = set()

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        name = _clean(row.get("name"))
        sku  = _clean(row.get("sku"))

        if not name:
            _err(row, errors, i, "name", "Nama produk tidak boleh kosong"); continue
        if not sku:
            _err(row, errors, i, "sku", "SKU tidak boleh kosong"); continue
        if sku.lower() in existing_skus:
            _err(row, errors, i, "sku", f"SKU '{sku}' sudah digunakan produk lain"); continue
        if sku.lower() in batch_skus:
            _err(row, errors, i, "sku", f"SKU '{sku}' duplikat dalam file CSV ini"); continue

        brand_name = _clean(row.get("brand_name"))
        brand_id   = brand_map.get(brand_name.lower()) if brand_name else None
        if brand_name and brand_id is None:
            _err(row, errors, i, "brand_name", f"Brand '{brand_name}' tidak ditemukan"); continue

        subcat_name = _clean(row.get("subcategory_name"))
        subcat_id   = subcat_map.get(subcat_name.lower()) if subcat_name else None
        if subcat_name and subcat_id is None:
            _err(row, errors, i, "subcategory_name",
                 f"Subkategori '{subcat_name}' tidak ditemukan"); continue

        try:
            min_stock = float(_clean(row.get("min_stock")) or "0")
        except ValueError:
            _err(row, errors, i, "min_stock", "min_stock harus angka"); continue

        active     = _clean(row.get("active", "1")) not in ("0", "false", "no", "tidak")
        is_for_sale = _clean(row.get("is_for_sale", "1")) not in ("0", "false", "no", "tidak")
        unit       = _clean(row.get("unit")) or "pcs"

        conn.execute(
            """INSERT INTO products(name, sku, unit, min_stock, active, is_for_sale,
               brand_id, subcategory_id, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (name, sku, unit, min_stock,
             1 if active else 0, 1 if is_for_sale else 0,
             brand_id, subcat_id, now, now),
        )
        conn.commit()
        existing_skus.add(sku.lower())
        batch_skus.add(sku.lower())
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Variants ──────────────────────────────────────────────────────────

def import_variants(content: str) -> dict:
    rows, parse_errors = _parse_csv(content, ["product_sku", "variant_name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows}

    conn = _conn()
    prod_map = {r["sku"].lower(): r["id"]
                for r in conn.execute("SELECT id, sku FROM products WHERE sku IS NOT NULL").fetchall()}
    existing_variants: set[tuple[int, str]] = {
        (r["product_id"], r["sku_suffix"].lower())
        for r in conn.execute(
            "SELECT product_id, sku_suffix FROM product_variants "
            "WHERE sku_suffix IS NOT NULL AND sku_suffix != ''"
        ).fetchall()
    }
    existing_names: set[tuple[int, str]] = {
        (r["product_id"], r["name"].lower())
        for r in conn.execute("SELECT product_id, name FROM product_variants").fetchall()
    }
    errors: list[dict] = []
    imported = 0
    batch_keys: set[tuple[int, str]] = set()

    import time
    now = int(time.time() * 1000)

    for i, row in enumerate(rows, start=2):
        product_sku  = _clean(row.get("product_sku"))
        variant_name = _clean(row.get("variant_name"))
        sku_suffix   = _clean(row.get("sku_suffix"))

        if not product_sku:
            _err(row, errors, i, "product_sku", "product_sku tidak boleh kosong"); continue
        if not variant_name:
            _err(row, errors, i, "variant_name", "Nama varian tidak boleh kosong"); continue

        product_id = prod_map.get(product_sku.lower())
        if product_id is None:
            _err(row, errors, i, "product_sku",
                 f"Produk dengan SKU '{product_sku}' tidak ditemukan"); continue

        if (product_id, variant_name.lower()) in existing_names:
            _err(row, errors, i, "variant_name",
                 f"Varian '{variant_name}' sudah ada di produk ini"); continue

        if sku_suffix:
            key = (product_id, sku_suffix.lower())
            if key in existing_variants:
                _err(row, errors, i, "sku_suffix",
                     f"SKU suffix '{sku_suffix}' sudah digunakan varian lain di produk ini"); continue
            if key in batch_keys:
                _err(row, errors, i, "sku_suffix",
                     f"SKU suffix '{sku_suffix}' duplikat dalam file CSV ini"); continue

        def _money(field: str) -> float | None:
            v = _clean(row.get(field))
            if not v: return None
            try: return float(v)
            except ValueError: return None

        conn.execute(
            """INSERT INTO product_variants(product_id, name, sku_suffix, fixed_cost,
               selling_price, default_unit_cost, color, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (product_id, variant_name, sku_suffix or None,
             _money("fixed_cost"), _money("selling_price"), _money("default_unit_cost"),
             "#6b7280", now, now),
        )
        conn.commit()
        existing_names.add((product_id, variant_name.lower()))
        if sku_suffix:
            existing_variants.add((product_id, sku_suffix.lower()))
            batch_keys.add((product_id, sku_suffix.lower()))
        _ok(row); imported += 1

    conn.close()
    return {"imported": imported, "errors": errors, "rows": rows}


# ── Import: Products + Variants (combined, one CSV) ───────────────────────────

def import_products_with_variants(content: str) -> dict:
    """
    One CSV, one row per variant. Columns:
      name, sku, unit, min_stock, brand_name, subcategory_name, active, is_for_sale,
      variant_name, sku_suffix, selling_price, default_unit_cost, fixed_cost

    Rules:
    - Rows with the same SKU share one product record — product is inserted once
      (first occurrence) and subsequent rows with the same SKU only add variants.
    - Rows for an existing product (SKU already in DB) will only add variants,
      never overwrite product fields.
    """
    rows, parse_errors = _parse_csv(content, ["sku", "variant_name"])
    if parse_errors:
        return {"imported": 0, "errors": parse_errors, "rows": rows,
                "products_imported": 0, "variants_imported": 0}

    import time
    now = int(time.time() * 1000)
    conn = _conn()

    existing_prod_skus: dict[str, int] = {
        r["sku"].lower(): r["id"]
        for r in conn.execute("SELECT id, sku FROM products WHERE sku IS NOT NULL AND sku != ''").fetchall()
    }
    brand_map: dict[str, int] = {
        r["name"].lower(): r["id"]
        for r in conn.execute("SELECT id, name FROM brands").fetchall()
    }
    subcat_map: dict[str, int] = {
        r["name"].lower(): r["id"]
        for r in conn.execute("SELECT id, name FROM subcategories").fetchall()
    }
    existing_variant_names: set[tuple[int, str]] = {
        (r["product_id"], r["name"].lower())
        for r in conn.execute("SELECT product_id, name FROM product_variants").fetchall()
    }
    existing_variant_skus: set[tuple[int, str]] = {
        (r["product_id"], r["sku_suffix"].lower())
        for r in conn.execute(
            "SELECT product_id, sku_suffix FROM product_variants "
            "WHERE sku_suffix IS NOT NULL AND sku_suffix != ''"
        ).fetchall()
    }

    batch_prod_skus: set[str] = set()
    batch_variant_keys: set[tuple[int, str]] = set()
    errors: list[dict] = []
    products_imported = 0
    variants_imported = 0

    def _money(v: str) -> float | None:
        v = v.strip()
        if not v: return None
        try: return float(v)
        except ValueError: return None

    for i, row in enumerate(rows, start=2):
        sku          = _clean(row.get("sku"))
        name         = _clean(row.get("name"))
        variant_name = _clean(row.get("variant_name"))

        if not sku:
            _err(row, errors, i, "sku", "SKU tidak boleh kosong"); continue
        if not variant_name:
            _err(row, errors, i, "variant_name", "Nama varian tidak boleh kosong"); continue

        sku_lower  = sku.lower()
        product_id = existing_prod_skus.get(sku_lower)

        if product_id is None:
            if not name:
                _err(row, errors, i, "name",
                     f"Kolom 'name' wajib diisi untuk produk baru (SKU: {sku})"); continue

            brand_name = _clean(row.get("brand_name"))
            brand_id   = brand_map.get(brand_name.lower()) if brand_name else None
            if brand_name and brand_id is None:
                _err(row, errors, i, "brand_name", f"Brand '{brand_name}' tidak ditemukan"); continue

            subcat_name = _clean(row.get("subcategory_name"))
            subcat_id   = subcat_map.get(subcat_name.lower()) if subcat_name else None
            if subcat_name and subcat_id is None:
                _err(row, errors, i, "subcategory_name",
                     f"Subkategori '{subcat_name}' tidak ditemukan"); continue

            try:
                min_stock = float(_clean(row.get("min_stock")) or "0")
            except ValueError:
                _err(row, errors, i, "min_stock", "min_stock harus angka"); continue

            active      = _clean(row.get("active", "1")) not in ("0", "false", "no", "tidak")
            is_for_sale = _clean(row.get("is_for_sale", "1")) not in ("0", "false", "no", "tidak")
            unit        = _clean(row.get("unit")) or "pcs"

            cur = conn.execute(
                """INSERT INTO products(name, sku, unit, min_stock, active, is_for_sale,
                       brand_id, subcategory_id, created_at, updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (name, sku, unit, min_stock,
                 1 if active else 0, 1 if is_for_sale else 0,
                 brand_id, subcat_id, now, now),
            )
            conn.commit()
            product_id = conn.last_insert_id(cur)
            existing_prod_skus[sku_lower] = product_id
            batch_prod_skus.add(sku_lower)
            products_imported += 1

        # Insert variant
        vname_lower = variant_name.lower()
        if (product_id, vname_lower) in existing_variant_names:
            _err(row, errors, i, "variant_name",
                 f"Varian '{variant_name}' sudah ada di produk SKU '{sku}'"); continue

        sku_suffix = _clean(row.get("sku_suffix")) or None
        if sku_suffix:
            suf_lower = sku_suffix.lower()
            key = (product_id, suf_lower)
            if key in existing_variant_skus:
                _err(row, errors, i, "sku_suffix",
                     f"SKU suffix '{sku_suffix}' sudah digunakan di produk ini"); continue
            if key in batch_variant_keys:
                _err(row, errors, i, "sku_suffix",
                     f"SKU suffix '{sku_suffix}' duplikat dalam file CSV ini"); continue

        conn.execute(
            """INSERT INTO product_variants(product_id, name, sku_suffix, fixed_cost,
                   selling_price, default_unit_cost, color, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
            (product_id, variant_name, sku_suffix,
             _money(_clean(row.get("fixed_cost"))),
             _money(_clean(row.get("selling_price"))),
             _money(_clean(row.get("default_unit_cost"))),
             "#6b7280", now, now),
        )
        conn.commit()
        existing_variant_names.add((product_id, vname_lower))
        if sku_suffix:
            batch_variant_keys.add((product_id, sku_suffix.lower()))
            existing_variant_skus.add((product_id, sku_suffix.lower()))
        _ok(row); variants_imported += 1

    conn.close()
    return {
        "imported": products_imported + variants_imported,
        "products_imported": products_imported,
        "variants_imported": variants_imported,
        "errors": errors,
        "rows": rows,
    }


# ── Dispatch ──────────────────────────────────────────────────────────────────

IMPORT_HANDLERS = {
    "brands":                   import_brands,
    "categories":               import_categories,
    "subcategories":            import_subcategories,
    "warehouses":               import_warehouses,
    "product_categories":       import_product_categories,
    "products":                 import_products,
    "variants":                 import_variants,
    "products_with_variants":   import_products_with_variants,
}


def run_import(import_type: str, content: str) -> dict:
    handler = IMPORT_HANDLERS.get(import_type)
    if not handler:
        raise ValueError(f"Unknown import type: {import_type}. Valid: {list(IMPORT_HANDLERS)}")
    return handler(content)
