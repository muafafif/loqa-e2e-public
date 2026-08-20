"""
Seed script — data demo realistis untuk semua modul LOQA Work.

Usage:
    DATA_DIR=/Users/catalyst/LOQA/work/data python seed.py up    # isi semua data
    DATA_DIR=/Users/catalyst/LOQA/work/data python seed.py down  # hapus semua data
    DATA_DIR=/Users/catalyst/LOQA/work/data python seed.py reset # down + up
    DATA_DIR=/Users/catalyst/LOQA/work/data python seed.py       # default: up
"""
import sqlite3
import random
import sys
import time
from datetime import date, timedelta
from pathlib import Path
import os

DATA_DIR = Path(os.environ.get("DATA_DIR", "/Users/catalyst/LOQA/work/data"))

random.seed(42)  # reproducible


def db(name: str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(DATA_DIR / f"{name}.db"))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def ms(d: date) -> int:
    return int(time.mktime(d.timetuple()) * 1000)


def today() -> date:
    return date(2026, 5, 28)


def dago(n: int) -> date:
    return today() - timedelta(days=n)


def fmt(d: date) -> str:
    return d.strftime("%Y-%m-%d")


# ═══════════════════════════════════════════════════════════════════════════════
# DOWN — hapus semua data seed
# ═══════════════════════════════════════════════════════════════════════════════

def seed_down():
    print("Running seed down...")

    # Finance — hapus transaksi & akun, biarkan categories default
    conn = db("finance")
    conn.execute("DELETE FROM transaction_fees")
    conn.execute("DELETE FROM transactions")
    conn.execute("DELETE FROM pockets")
    conn.execute("DELETE FROM accounts")
    conn.execute("UPDATE categories SET pl_type=NULL")
    conn.execute(
        "DELETE FROM sqlite_sequence WHERE name IN "
        "('accounts','pockets','transactions','transaction_fees')"
    )
    conn.commit()
    conn.close()
    print("  finance.db cleared")

    # Inventory + Order (sama DB)
    conn = db("inventory")
    for tbl in [
        "order_items", "orders", "order_settings",
        "shipping_addresses", "villages", "districts", "cities",
        "stock_levels", "stock_batches", "stock_movements",
        "product_variants", "products",
        "subcategories", "categories",
        "product_categories", "brands", "warehouses",
    ]:
        conn.execute(f"DELETE FROM {tbl}")
    conn.execute("DELETE FROM sqlite_sequence")
    conn.commit()
    conn.close()
    print("  inventory.db cleared (orders included)")

    # Project
    conn = db("project")
    for tbl in [
        "project_invoices", "project_worker_payments", "project_workers",
        "project_budget_items", "projects",
    ]:
        conn.execute(f"DELETE FROM {tbl}")
    conn.execute(
        "DELETE FROM sqlite_sequence WHERE name IN "
        "('projects','project_budget_items','project_workers',"
        "'project_worker_payments','project_invoices')"
    )
    conn.commit()
    conn.close()
    print("  project.db cleared")

    print("Seed down selesai.\n")


# ═══════════════════════════════════════════════════════════════════════════════
# UP — isi semua data
# ═══════════════════════════════════════════════════════════════════════════════

def seed_up():
    print("Running seed up...")
    _seed_finance()
    _seed_inventory_and_orders()
    _seed_project()
    print("\nSeed up selesai!")


# ─────────────────────────────────────────────────────────────────────────────
# FINANCE
# ─────────────────────────────────────────────────────────────────────────────

def _seed_finance():
    conn = db("finance")
    now = ms(today())

    # Pastikan default categories sudah ada (diinsert oleh init_db backend)
    # Ambil ID berdasarkan nama agar tidak bergantung pada urutan INSERT
    def cat_id_by_name(name: str) -> int | None:
        row = conn.execute("SELECT id FROM categories WHERE name=?", (name,)).fetchone()
        return row["id"] if row else None

    # Pockets
    pockets = [
        ("Operasional 2026",          "#8b5cf6", "briefcase"),
        ("Proyek Renovasi Kantor",     "#10b981", "hammer"),
        ("Dana Darurat",               "#f59e0b", "shield"),
    ]
    pocket_ids = []
    for name, color, icon in pockets:
        cur = conn.execute(
            "INSERT INTO pockets(name,color,icon,locked,created_at,updated_at) VALUES(?,?,?,0,?,?)",
            (name, color, icon, now, now),
        )
        conn.commit()
        pocket_ids.append(cur.lastrowid)

    # Accounts
    accounts_data = [
        ("Kas Tunai",        "cash",    5_000_000, "IDR", "#10b981"),
        ("BCA Operasional",  "bank",   85_000_000, "IDR", "#3b82f6"),
        ("BRI Giro",         "bank",  120_000_000, "IDR", "#6366f1"),
        ("Mandiri Tabungan", "bank",   45_000_000, "IDR", "#8b5cf6"),
        ("Piutang Usaha",    "other",  30_000_000, "IDR", "#f59e0b"),
    ]
    account_ids = []
    for name, atype, balance, currency, color in accounts_data:
        cur = conn.execute(
            "INSERT INTO accounts(name,type,balance,currency,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (name, atype, balance, currency, color, now, now),
        )
        conn.commit()
        account_ids.append(cur.lastrowid)

    # Set pl_type berdasarkan nama — tidak bergantung pada id urutan
    bahan_baku_id = cat_id_by_name("Beban Bahan Baku")
    penjualan_id  = cat_id_by_name("Pendapatan Penjualan")
    jasa_id       = cat_id_by_name("Pendapatan Jasa")
    if bahan_baku_id:
        conn.execute("UPDATE categories SET pl_type='cogs' WHERE id=?", (bahan_baku_id,))
    if penjualan_id:
        conn.execute("UPDATE categories SET pl_type='gross_income' WHERE id=?", (penjualan_id,))
    if jasa_id:
        conn.execute("UPDATE categories SET pl_type='gross_income' WHERE id=?", (jasa_id,))
    conn.commit()

    # Ambil kategori yang akan dipakai
    c_gaji      = cat_id_by_name("Beban Gaji & Tunjangan")
    c_sewa      = cat_id_by_name("Beban Sewa")
    c_utilitas  = cat_id_by_name("Beban Utilitas")
    c_marketing = cat_id_by_name("Beban Pemasaran & Iklan")
    c_opex      = cat_id_by_name("Beban Operasional")
    c_bahan     = cat_id_by_name("Beban Bahan Baku")
    c_transport = cat_id_by_name("Beban Transportasi")
    c_perjalanan= cat_id_by_name("Beban Perjalanan Dinas")
    c_perlengkap= cat_id_by_name("Beban Perlengkapan Kantor")
    c_saas      = cat_id_by_name("Beban Teknologi & SaaS")
    c_pajak     = cat_id_by_name("Beban Pajak")
    c_admin     = cat_id_by_name("Beban Bunga & Keuangan")
    c_lain_exp  = cat_id_by_name("Beban Lain-lain")
    c_jual      = cat_id_by_name("Pendapatan Penjualan")
    c_jasa      = cat_id_by_name("Pendapatan Jasa")
    c_transfer  = cat_id_by_name("Transfer Antar Akun")

    def add_tx(account_id, category_id, pocket_id, tx_type, amount, d, description, to_account_id=None):
        conn.execute(
            """INSERT INTO transactions
               (account_id,category_id,pocket_id,type,amount,date,
                description,note,tags,created_at,updated_at,to_account_id)
               VALUES(?,?,?,?,?,?,?,NULL,NULL,?,?,?)""",
            (account_id, category_id, pocket_id, tx_type, amount,
             fmt(d), description, now, now, to_account_id),
        )

    # 6 bulan pemasukan rutin
    for month_ago in range(6):
        base = today().replace(day=1) - timedelta(days=month_ago * 30)
        for day_offset, amount in [(3, 45_000_000), (10, 28_000_000), (18, 35_000_000), (25, 22_000_000)]:
            d = base + timedelta(days=day_offset)
            if d <= today():
                add_tx(account_ids[1], c_jasa, pocket_ids[0], "income",
                       amount + random.randint(-2_000_000, 5_000_000),
                       d, f"Pendapatan Jasa Klien #{random.randint(100, 199)}")
        for day_offset in [7, 14, 21, 28]:
            d = base + timedelta(days=day_offset)
            if d <= today():
                add_tx(account_ids[2], c_jual, pocket_ids[0], "income",
                       random.randint(15_000_000, 40_000_000), d, "Penjualan Produk")

    # 6 bulan pengeluaran rutin
    expense_tmpl = [
        (c_gaji,      18_000_000, "Gaji Karyawan"),
        (c_sewa,       8_500_000, "Sewa Kantor"),
        (c_utilitas,   1_200_000, "Listrik & Internet"),
        (c_marketing,  3_500_000, "Google Ads & Meta Ads"),
        (c_saas,       2_800_000, "Langganan SaaS Tools"),
        (c_bahan,     12_000_000, "Pembelian Bahan Baku"),
        (c_transport,    800_000, "Ongkos Kirim Produk"),
    ]
    for month_ago in range(6):
        base = today().replace(day=1) - timedelta(days=month_ago * 30)
        for cat, base_amt, desc in expense_tmpl:
            d = base + timedelta(days=random.randint(1, 5))
            if d <= today():
                add_tx(account_ids[1], cat, pocket_ids[0], "expense",
                       base_amt + random.randint(-500_000, 1_500_000), d, desc)

    # Pengeluaran proyek renovasi
    for d, cat, amount, desc in [
        (dago(90), c_bahan,      35_000_000, "Material Bangunan — Bata & Semen"),
        (dago(85), c_bahan,      18_000_000, "Material — Cat & Finishing"),
        (dago(80), c_opex,       25_000_000, "Upah Tukang Bulan 1"),
        (dago(60), c_bahan,      22_000_000, "Material — Keramik & Granit"),
        (dago(55), c_opex,       25_000_000, "Upah Tukang Bulan 2"),
        (dago(40), c_bahan,       8_000_000, "Material — Kabel Listrik"),
        (dago(35), c_opex,       15_000_000, "Upah Tukang Bulan 3"),
        (dago(20), c_perlengkap,  5_500_000, "Perlengkapan Kantor Baru"),
    ]:
        add_tx(account_ids[1], cat, pocket_ids[1], "expense", amount, d, desc)

    # Pengeluaran lain-lain
    for d, cat, amount, desc in [
        (dago(45), c_pajak,    4_500_000, "PPh 21 Q1"),
        (dago(15), c_admin,      800_000, "Biaya Admin Bank"),
        (dago(10), c_lain_exp, 1_200_000, "Pengeluaran Lain-lain"),
        (dago(5),  c_perjalanan,3_200_000,"Perjalanan Dinas Surabaya"),
    ]:
        add_tx(account_ids[1], cat, pocket_ids[0], "expense", amount, d, desc)

    # Transfer antar akun
    for month_ago in range(4):
        d = today().replace(day=28) - timedelta(days=month_ago * 30)
        if d <= today():
            add_tx(account_ids[1], c_transfer, None, "transfer", 5_000_000, d,
                   "Transfer ke Tabungan Dana Darurat", to_account_id=account_ids[3])

    conn.commit()
    tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    conn.close()
    print(f"  finance: {len(pocket_ids)} pockets, {len(account_ids)} accounts, {tx_count} transactions")


# ─────────────────────────────────────────────────────────────────────────────
# INVENTORY + ORDERS
# ─────────────────────────────────────────────────────────────────────────────

def _seed_inventory_and_orders():
    conn = db("inventory")
    now = ms(today())

    # ── Brands ────────────────────────────────────────────────────────────────
    brands_data = [
        ("Samsung",  "#3b82f6"),
        ("LG",       "#6366f1"),
        ("HP Inc.",  "#8b5cf6"),
        ("Brother",  "#10b981"),
        ("Logitech", "#f59e0b"),
        ("Generic",  "#6b7280"),
    ]
    brand_ids = []
    for name, color in brands_data:
        cur = conn.execute(
            "INSERT INTO brands(name,created_at,updated_at) VALUES(?,?,?)",
            (name, now, now),
        )
        conn.commit()
        brand_ids.append(cur.lastrowid)

    # ── Product Categories (FK dari products) ─────────────────────────────────
    prod_cats = [
        ("Elektronik",   "#3b82f6"),
        ("Furniture",    "#10b981"),
        ("Alat Tulis",   "#f59e0b"),
        ("Peralatan IT", "#8b5cf6"),
    ]
    pcat_ids = []
    for name, color in prod_cats:
        cur = conn.execute(
            "INSERT INTO product_categories(name,color,created_at) VALUES(?,?,?)",
            (name, color, now),
        )
        conn.commit()
        pcat_ids.append(cur.lastrowid)

    # ── Categories + Subcategories (untuk pengelompokan UI) ───────────────────
    cat_data = [
        ("Elektronik",   "#3b82f6"),
        ("Furniture",    "#10b981"),
        ("Alat Tulis",   "#f59e0b"),
        ("Peralatan IT", "#8b5cf6"),
    ]
    cat_ids = []
    for name, color in cat_data:
        cur = conn.execute(
            "INSERT INTO categories(name,created_at,updated_at) VALUES(?,?,?)",
            (name, now, now),
        )
        conn.commit()
        cat_ids.append(cur.lastrowid)

    subcats_data = [
        (cat_ids[0], "Monitor"),
        (cat_ids[0], "Laptop"),
        (cat_ids[0], "Printer"),
        (cat_ids[1], "Meja"),
        (cat_ids[1], "Kursi"),
        (cat_ids[3], "Storage"),
        (cat_ids[3], "Networking"),
    ]
    subcat_ids = []
    for cat_id, name in subcats_data:
        cur = conn.execute(
            "INSERT INTO subcategories(category_id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (cat_id, name, now, now),
        )
        conn.commit()
        subcat_ids.append(cur.lastrowid)

    # ── Warehouses ────────────────────────────────────────────────────────────
    warehouses = [
        ("Gudang Utama Jakarta",  "Jl. Industri No. 12, Cakung, Jakarta Timur"),
        ("Gudang Cabang Bandung", "Jl. Soekarno-Hatta No. 45, Bandung"),
    ]
    wh_ids = []
    for name, loc in warehouses:
        cur = conn.execute(
            "INSERT INTO warehouses(name,location,created_at,updated_at) VALUES(?,?,?,?)",
            (name, loc, now, now),
        )
        conn.commit()
        wh_ids.append(cur.lastrowid)

    # ── Products + Variants ───────────────────────────────────────────────────
    # (pcat_id, subcat_id, brand_id, name, sku, unit, min_stock,
    #   variants: [(name, sku_suffix, fixed_cost)])
    products = [
        (pcat_ids[0], subcat_ids[1], brand_ids[2], "Laptop Bisnis",    "LPT", "unit",  2,
         [("Standard 8GB", "",    8_500_000), ("Pro 16GB", "PRO", 12_500_000)]),
        (pcat_ids[0], subcat_ids[0], brand_ids[0], "Monitor 24\"",     "MON", "unit",  3,
         [("Full HD",      "FHD", 2_800_000), ("4K",       "4K",  5_200_000)]),
        (pcat_ids[0], subcat_ids[2], brand_ids[3], "Printer Laser",    "PRT", "unit",  2,
         [("Mono A4",      "",    3_200_000)]),
        (pcat_ids[1], subcat_ids[3], brand_ids[5], "Meja Kantor",      "MJK", "unit",  5,
         [("120cm",        "S",   1_800_000), ("150cm",    "L",   2_500_000)]),
        (pcat_ids[1], subcat_ids[4], brand_ids[5], "Kursi Ergonomis",  "KRS", "unit", 10,
         [("Standard",     "",    2_200_000)]),
        (pcat_ids[2], None,          brand_ids[5], "Kertas HVS A4",    "HVS", "rim",  20,
         [("70gsm",        "70",     48_000), ("80gsm",    "80",     58_000)]),
        (pcat_ids[2], None,          brand_ids[5], "Alat Tulis Set",   "ATS", "set",  15,
         [("Standar",      "",       35_000)]),
        (pcat_ids[3], subcat_ids[5], brand_ids[4], "SSD External 1TB", "SSD", "unit",  3,
         [("USB-C",        "",      850_000)]),
        (pcat_ids[3], subcat_ids[6], brand_ids[5], "Switch Jaringan",  "SWT", "unit",  2,
         [("8 Port",       "8P",    450_000), ("16 Port",  "16P",   950_000)]),
        (pcat_ids[0], subcat_ids[0], brand_ids[1], "Monitor 27\"",     "M27", "unit",  2,
         [("QHD 165Hz",    "",    3_800_000)]),
        (pcat_ids[3], subcat_ids[6], brand_ids[5], "UPS 1200VA",       "UPS", "unit",  2,
         [("Standar",      "",    1_200_000)]),
    ]

    prod_ids = []
    # all_var_ids: flat list of (var_id, unit_cost) sesuai urutan produk & variant
    all_var_ids: list[tuple[int, float]] = []

    for pcat_id, sub_id, brand_id, name, sku, unit, min_stock, variants in products:
        cur = conn.execute(
            """INSERT INTO products
               (category_id,subcategory_id,brand_id,name,sku,unit,min_stock,
                active,is_for_sale,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,1,1,?,?)""",
            (pcat_id, sub_id, brand_id, name, sku, unit, min_stock, now, now),
        )
        conn.commit()
        prod_id = cur.lastrowid
        prod_ids.append(prod_id)
        for v_name, v_suffix, fixed_cost in variants:
            vcur = conn.execute(
                """INSERT INTO product_variants
                   (product_id,name,sku_suffix,fixed_cost,selling_price,color,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (prod_id, v_name, v_suffix or None, fixed_cost,
                 round(fixed_cost * 1.25), "#6b7280", now, now),
            )
            conn.commit()
            all_var_ids.append((vcur.lastrowid, float(fixed_cost)))

    # ── Stock Movements IN ────────────────────────────────────────────────────
    move_dates_in = [dago(120), dago(90), dago(60)]

    for var_id, unit_cost in all_var_ids:
        for i, move_date in enumerate(move_dates_in):
            qty = random.randint(5, 30)
            cost = round(unit_cost * random.uniform(0.85, 0.95), 2)
            cur = conn.execute(
                """INSERT INTO stock_movements
                   (variant_id,warehouse_id,type,qty,unit_cost,cost_method,total_cost,
                    note,date,finance_linked,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,0,?)""",
                (var_id, wh_ids[0], "in", qty, cost, "fifo",
                 round(qty * cost, 2), f"Pembelian batch {i+1}", fmt(move_date), now),
            )
            conn.commit()
            conn.execute(
                """INSERT INTO stock_batches
                   (variant_id,warehouse_id,movement_id,purchase_price,
                    qty_initial,qty_remaining,date,created_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (var_id, wh_ids[0], cur.lastrowid, cost, qty, qty, fmt(move_date), now),
            )
            conn.commit()

    # ── Stock Movements OUT (penjualan manual sebelum orders) ─────────────────
    for var_id, unit_cost in all_var_ids:
        for move_date in [dago(55), dago(35)]:
            qty_out = random.randint(1, 3)
            conn.execute(
                """INSERT INTO stock_movements
                   (variant_id,warehouse_id,type,qty,unit_cost,cost_method,total_cost,
                    selling_price,note,date,finance_linked,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,0,?)""",
                (var_id, wh_ids[0], "out", qty_out, unit_cost, "fifo",
                 round(qty_out * unit_cost, 2), round(unit_cost * 1.25),
                 "Penjualan langsung", fmt(move_date), now),
            )
            conn.commit()

    # ── Stock Levels (materialisasi dari movements) ────────────────────────────
    for var_id, unit_cost in all_var_ids:
        rows = conn.execute(
            "SELECT type,qty,unit_cost FROM stock_movements WHERE variant_id=? AND warehouse_id=?",
            (var_id, wh_ids[0]),
        ).fetchall()
        total_in  = sum(r["qty"] for r in rows if r["type"] == "in")
        cost_in   = sum(r["qty"] * r["unit_cost"] for r in rows if r["type"] == "in")
        total_out = sum(r["qty"] for r in rows if r["type"] == "out")
        qty_hand  = max(0.0, total_in - total_out)
        avg_cost  = (cost_in / total_in) if total_in > 0 else unit_cost
        conn.execute(
            "INSERT OR REPLACE INTO stock_levels(variant_id,warehouse_id,qty,avg_cost) VALUES(?,?,?,?)",
            (var_id, wh_ids[0], qty_hand, round(avg_cost, 2)),
        )
    conn.commit()

    # ── Wilayah ───────────────────────────────────────────────────────────────
    cities_data = ["Jakarta Timur", "Jakarta Selatan", "Bandung", "Surabaya", "Yogyakarta"]
    city_ids = []
    for name in cities_data:
        cur = conn.execute("INSERT INTO cities(name,created_at) VALUES(?,?)", (name, now))
        conn.commit()
        city_ids.append(cur.lastrowid)

    district_ids = []
    districts_per_city = [
        (0, ["Cakung", "Jatinegara", "Duren Sawit"]),
        (1, ["Kebayoran Baru", "Tebet"]),
        (2, ["Coblong", "Bandung Wetan", "Sumur Bandung"]),
        (3, ["Gubeng", "Sukolilo"]),
        (4, ["Gondokusuman", "Umbulharjo"]),
    ]
    for city_idx, districts in districts_per_city:
        for name in districts:
            cur = conn.execute(
                "INSERT INTO districts(city_id,name,created_at) VALUES(?,?,?)",
                (city_ids[city_idx], name, now),
            )
            conn.commit()
            district_ids.append(cur.lastrowid)

    for dist_id in district_ids[:4]:
        for village in ["Kelurahan A", "Kelurahan B"]:
            conn.execute(
                "INSERT INTO villages(district_id,name,created_at) VALUES(?,?,?)",
                (dist_id, village, now),
            )
    conn.commit()

    # ── Shipping Addresses ────────────────────────────────────────────────────
    addresses_data = [
        ("Kantor Utama",        "Budi Santoso",  "0812-0001-0001", city_ids[0], district_ids[0],  "Jl. Industri No. 5, Cakung"),
        ("Cabang Selatan",      "Siti Rahayu",   "0821-0002-0002", city_ids[1], district_ids[3],  "Jl. Kemang Raya No. 12"),
        ("Distributor Bandung", "Hendra Wijaya", "0857-0003-0003", city_ids[2], district_ids[5],  "Jl. Dago No. 88"),
        ("Reseller Surabaya",   "Dewi Kusuma",   "0813-0004-0004", city_ids[3], district_ids[8],  "Jl. Ahmad Yani No. 34"),
        ("Toko Jogja",          "Kevin Santoso", "0856-0005-0005", city_ids[4], district_ids[10], "Jl. Malioboro No. 7"),
    ]
    addr_ids = []
    for label, recipient, phone, city_id, dist_id, detail in addresses_data:
        cur = conn.execute(
            """INSERT INTO shipping_addresses
               (label,recipient_name,phone,city_id,district_id,detail,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (label, recipient, phone, city_id, dist_id, detail, now, now),
        )
        conn.commit()
        addr_ids.append(cur.lastrowid)

    # ── Order Settings ────────────────────────────────────────────────────────
    fin_conn = db("finance")
    fin_acc = fin_conn.execute("SELECT id FROM accounts WHERE type='bank' LIMIT 1").fetchone()
    fin_cat = fin_conn.execute(
        "SELECT id FROM categories WHERE name='Pendapatan Penjualan' LIMIT 1"
    ).fetchone()
    fin_conn.close()
    default_account_id  = fin_acc["id"] if fin_acc else None
    default_category_id = fin_cat["id"] if fin_cat else None

    for key, val in [
        ("default_account_id",   str(default_account_id)  if default_account_id  else ""),
        ("default_category_id",  str(default_category_id) if default_category_id else ""),
        ("default_cost_method",  "fifo"),
        ("default_warehouse_id", str(wh_ids[0])),
    ]:
        conn.execute(
            "INSERT INTO order_settings(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, val),
        )
    conn.commit()

    # ── Orders ────────────────────────────────────────────────────────────────
    # all_var_ids index (flat, sesuai urutan products × variants di atas):
    #  0=Laptop 8GB, 1=Laptop Pro 16GB
    #  2=Monitor 24 FHD, 3=Monitor 24 4K
    #  4=Printer Mono
    #  5=Meja 120cm, 6=Meja 150cm
    #  7=Kursi
    #  8=Kertas 70gsm, 9=Kertas 80gsm
    # 10=Alat Tulis
    # 11=SSD
    # 12=Switch 8P, 13=Switch 16P
    # 14=Monitor 27 QHD
    # 15=UPS
    #
    # Status yang digunakan: draft | waiting_for_payment | on_process | completed | cancelled
    # (tidak ada lagi "open")
    orders_data = [
        # (days_ago, customer, phone, addr_idx, status, [(var_idx, qty, sell_price)])
        (85, "PT Maju Bersama",       "0812-1111-0001", 0, "completed",
         [(0,2,9_500_000),(2,4,3_200_000),(7,10,2_400_000)]),
        (80, "CV Teknologi Nusantara","0821-2222-0002", 1, "completed",
         [(1,1,14_000_000),(11,3,950_000)]),
        (75, "Perumahan Grand",        "0857-3333-0003", 2, "cancelled",
         [(5,5,2_000_000),(6,3,2_800_000),(7,8,2_400_000)]),
        (70, "Startup Fintech",        "0813-4444-0004", 3, "cancelled",
         [(0,3,9_500_000),(3,2,5_800_000)]),
        (65, "PT Abadi Jaya",          "0856-5555-0005", 4, "completed",
         [(2,6,3_100_000),(12,2,500_000),(15,2,1_300_000)]),
        (60, "CV Sukses Mandiri",      "0812-6666-0006", 0, "completed",
         [(8,50,52_000),(9,30,62_000),(10,20,38_000)]),
        (55, "PT Nusantara Digital",   "0821-7777-0007", 1, "completed",
         [(1,2,14_000_000),(14,2,4_200_000)]),
        (50, "Toko Elektronik Maju",   "0857-8888-0008", 2, "completed",
         [(2,4,3_100_000),(3,1,5_800_000),(11,5,950_000)]),
        (45, "Budi Santoso",           "0813-9999-0009", 3, "completed",
         [(7,2,2_400_000),(5,1,2_000_000)]),
        (40, "PT Cahaya Abadi",        "0856-0000-0010", 4, "completed",
         [(0,4,9_500_000),(12,4,500_000),(13,1,1_050_000)]),
        (35, "CV Prima Karya",         "0812-1234-0011", 0, "completed",
         [(4,2,3_500_000),(15,3,1_300_000)]),
        (30, "PT Global Teknindo",     "0821-2345-0012", 1, "completed",
         [(1,3,14_000_000),(3,2,5_800_000)]),
        (25, "Distribusi Sejahtera",   "0857-3456-0013", 2, "completed",
         [(8,100,52_000),(9,80,62_000),(10,50,38_000)]),
        (20, "PT Maju Bersama",        "0813-4567-0014", 3, "completed",
         [(2,3,3_100_000),(14,1,4_200_000),(11,2,950_000)]),
        (18, "Siti Rahayu",            "0856-5678-0015", 4, "completed",
         [(7,5,2_400_000),(6,2,2_800_000)]),
        (15, "PT Teknologi Hijau",     "0812-6789-0016", 0, "completed",
         [(0,2,9_500_000),(1,1,14_000_000)]),
        (12, "CV Mitra Solusi",        "0821-7890-0017", 1, "on_process",
         [(5,4,2_000_000),(7,4,2_400_000),(12,2,500_000)]),
        (10, "PT Nusantara Digital",   "0857-8901-0018", 2, "on_process",
         [(3,1,5_800_000),(13,2,1_050_000),(15,1,1_300_000)]),
        (7,  "Individu — Andi",        "0813-9012-0019", 3, "waiting_for_payment",
         [(11,1,950_000),(8,5,52_000)]),
        (5,  "PT Maju Bersama",        "0856-0123-0020", 0, "waiting_for_payment",
         [(1,2,14_000_000),(14,3,4_200_000)]),
        (3,  "CV Teknologi Nusantara", "0812-2468-0021", 1, "on_process",
         [(0,1,9_500_000),(2,2,3_100_000)]),
        (2,  "Distribusi Sejahtera",   "0821-3579-0022", 2, "on_process",
         [(8,200,52_000),(9,150,62_000)]),
        (1,  "PT Global Teknindo",     "0857-4680-0023", 3, "draft",
         [(1,1,14_000_000),(12,4,500_000)]),
        (0,  "PT Cahaya Abadi",        "0813-5791-0024", 4, "draft",
         [(3,2,5_800_000),(11,3,950_000)]),
    ]

    order_seq = 1
    for days_ago_val, customer, phone, addr_idx, status, items_spec in orders_data:
        order_date    = dago(days_ago_val)
        order_number  = f"ORD-{order_date.strftime('%Y%m')}-{order_seq:04d}"
        order_seq    += 1
        total_amount  = sum(qty * price for _, qty, price in items_spec)
        addr_id       = addr_ids[addr_idx % len(addr_ids)]

        cur = conn.execute(
            """INSERT INTO orders
               (order_number,customer_name,customer_phone,note,status,
                shipping_address_id,warehouse_id,account_id,category_id,
                cost_method,total_amount,date,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (order_number, customer, phone, None, status,
             addr_id, wh_ids[0],
             default_account_id, default_category_id,
             "fifo", total_amount, fmt(order_date), now, now),
        )
        conn.commit()
        order_id = cur.lastrowid

        for var_local_idx, qty, selling_price in items_spec:
            if var_local_idx >= len(all_var_ids):
                continue
            var_id, unit_cost = all_var_ids[var_local_idx]

            move_cur = conn.execute(
                """INSERT INTO stock_movements
                   (variant_id,warehouse_id,type,qty,unit_cost,cost_method,total_cost,
                    selling_price,note,date,finance_linked,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,0,?)""",
                (var_id, wh_ids[0], "out", qty, unit_cost, "fifo",
                 round(qty * unit_cost, 2), selling_price,
                 f"Order {order_number}", fmt(order_date), now),
            )
            conn.commit()

            conn.execute(
                """INSERT INTO order_items
                   (order_id,variant_id,qty,selling_price,subtotal,movement_id,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (order_id, var_id, qty, selling_price,
                 qty * selling_price, move_cur.lastrowid, now),
            )
            conn.execute(
                "UPDATE stock_levels SET qty=MAX(0,qty-?) WHERE variant_id=? AND warehouse_id=?",
                (qty, var_id, wh_ids[0]),
            )
        conn.commit()

    order_count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    item_count  = conn.execute("SELECT COUNT(*) FROM order_items").fetchone()[0]
    conn.close()

    print(f"  inventory: {len(wh_ids)} gudang, {len(prod_ids)} produk, {len(all_var_ids)} varian")
    print(f"  brands: {len(brand_ids)}, subcategories: {len(subcat_ids)}, addresses: {len(addr_ids)}")
    print(f"  orders: {order_count} orders ({order_seq-1} inserted), {item_count} order items")


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT
# ─────────────────────────────────────────────────────────────────────────────

def _seed_project():
    conn = db("project")
    now = ms(today())

    projects_data = [
        {
            "name": "Renovasi Kantor Pusat",
            "client": "PT Maju Bersama Tbk",
            "contact": "Budi Santoso — 0812-3456-7890",
            "status": "active",
            "start": dago(120), "end": dago(-30),
            "value": 850_000_000,
            "color": "#8b5cf6",
            "desc": "Renovasi total kantor pusat lt. 3-5, termasuk MEP, interior, dan furnitur.",
        },
        {
            "name": "Sistem ERP Perusahaan",
            "client": "CV Teknologi Nusantara",
            "contact": "Siti Rahayu — 0821-9876-5432",
            "status": "active",
            "start": dago(60), "end": dago(-90),
            "value": 320_000_000,
            "color": "#3b82f6",
            "desc": "Implementasi sistem ERP berbasis cloud, modul Finance & HR.",
        },
        {
            "name": "Proyek Landscaping Taman",
            "client": "Perumahan Grand Residence",
            "contact": "Hendra Wijaya — 0857-1111-2222",
            "status": "completed",
            "start": dago(180), "end": dago(30),
            "value": 175_000_000,
            "color": "#10b981",
            "desc": "Penataan taman dan area hijau cluster A-C.",
        },
        {
            "name": "Pengembangan Aplikasi Mobile",
            "client": "Startup Fintech Lokal",
            "contact": "Dewi Kusuma — 0813-5555-6666",
            "status": "on_hold",
            "start": dago(45), "end": dago(-60),
            "value": 220_000_000,
            "color": "#f59e0b",
            "desc": "Aplikasi mobile Android & iOS untuk layanan pinjaman P2P.",
        },
    ]

    proj_ids = []
    for p in projects_data:
        cur = conn.execute(
            """INSERT INTO projects
               (name,client_name,client_contact,status,start_date,end_date,
                contract_value,description,color,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (p["name"], p["client"], p["contact"], p["status"],
             fmt(p["start"]), fmt(p["end"]), p["value"],
             p["desc"], p["color"], now, now),
        )
        conn.commit()
        proj_ids.append(cur.lastrowid)

    # RAB
    rab = {
        0: [
            ("Pekerjaan Sipil", "Pembongkaran & Persiapan",     1,   "ls",   45_000_000),
            ("Pekerjaan Sipil", "Pemasangan Bata & Plesteran", 850,  "m²",      180_000),
            ("Pekerjaan Sipil", "Pengecatan Dinding",          850,  "m²",       85_000),
            ("MEP",             "Instalasi Listrik",             1,   "ls",  120_000_000),
            ("MEP",             "Instalasi AC Split",           20,  "unit",   8_500_000),
            ("MEP",             "Instalasi Plumbing",            1,   "ls",   35_000_000),
            ("Interior",        "Partisi Kaca & Aluminium",    200,  "m²",      950_000),
            ("Interior",        "Plafon Gypsum",               600,  "m²",      185_000),
            ("Interior",        "Keramik Lantai 60x60",        600,  "m²",      320_000),
            ("Furniture",       "Meja Workstation",             50, "unit",   2_800_000),
            ("Furniture",       "Kursi Kerja Ergonomis",        50, "unit",   2_200_000),
            ("Furniture",       "Lemari Arsip",                 15, "unit",   1_800_000),
        ],
        1: [
            ("Analisis",    "Business Process Analysis",   80, "md",  2_500_000),
            ("Development", "Modul Finance",              120, "md",  2_500_000),
            ("Development", "Modul HR & Payroll",          80, "md",  2_500_000),
            ("Development", "Modul Inventory",             60, "md",  2_500_000),
            ("Testing",     "UAT & Bug Fixing",            40, "md",  2_000_000),
            ("Deployment",  "Setup Server & Go Live",       1, "ls", 25_000_000),
            ("Training",    "Pelatihan End User",           5, "hari", 5_000_000),
        ],
        2: [
            ("Tanaman",   "Pohon Ketapang Kencana",  30,  "pcs",    850_000),
            ("Tanaman",   "Rumput Gajah Mini",       500, "m²",      45_000),
            ("Tanaman",   "Tanaman Hias Perdu",      200, "pcs",    125_000),
            ("Hardscape", "Jalan Setapak Batu Alam", 150, "m²",     380_000),
            ("Hardscape", "Gazebo Kayu Jati",          2, "unit", 18_000_000),
            ("Irigasi",   "Sistem Sprinkler",          1, "ls",   22_000_000),
            ("Jasa",      "Biaya Tenaga Landscaper",   1, "ls",   35_000_000),
        ],
        3: [
            ("Design",         "UI/UX Design Mobile",   60, "md",  2_500_000),
            ("Development",    "Android Development",  100, "md",  3_000_000),
            ("Development",    "iOS Development",      100, "md",  3_000_000),
            ("Development",    "Backend API",           80, "md",  2_800_000),
            ("Testing",        "QA & Testing",          30, "md",  2_000_000),
            ("Infrastructure", "Server & DevOps",        1, "ls", 15_000_000),
        ],
    }
    for pi, items in rab.items():
        for cat, desc, qty, unit, unit_price in items:
            conn.execute(
                """INSERT INTO project_budget_items
                   (project_id,category,description,qty,unit,unit_price,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (proj_ids[pi], cat, desc, qty, unit, unit_price, now, now),
            )
    conn.commit()

    # Workers
    workers = {
        0: [("Ahmad Fauzi",    "Mandor Utama",   "fixed",   8_500_000),
            ("Beni Sutrisno",  "Kepala Tukang",  "fixed",   6_000_000),
            ("CV Mitra Jaya",  "Subkon Listrik", "fixed",  80_000_000),
            ("Dani Prasetyo",  "Tukang Cat",     "daily",     350_000),
            ("Eko Budiman",    "Tukang Keramik", "daily",     380_000)],
        1: [("Fajar Nugraha",  "Project Manager","fixed",  15_000_000),
            ("Gita Permata",   "Backend Dev",    "fixed",  12_000_000),
            ("Hadi Wijaya",    "Frontend Dev",   "fixed",  11_000_000),
            ("Indah Sari",     "QA Engineer",    "fixed",   9_000_000)],
        2: [("PT Hijau Lestari","Landscaper",    "fixed",  35_000_000),
            ("Joko Susilo",    "Supervisor",     "fixed",   5_500_000)],
        3: [("Kevin Lie",      "Lead Developer", "fixed",  18_000_000),
            ("Lisa Tanaka",    "UI/UX Designer", "fixed",  12_000_000),
            ("Michael Tan",    "iOS Developer",  "fixed",  15_000_000)],
    }
    worker_ids: dict[int, list[tuple[int, str, float]]] = {}
    for pi, wlist in workers.items():
        worker_ids[pi] = []
        for name, role, rate_type, rate in wlist:
            status = "done" if pi == 2 else "active"
            cur = conn.execute(
                """INSERT INTO project_workers
                   (project_id,name,role,rate_type,rate_amount,status,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (proj_ids[pi], name, role, rate_type, rate, status, now, now),
            )
            conn.commit()
            worker_ids[pi].append((cur.lastrowid, name, rate))

    # Payments
    pay_dates = {
        0: [dago(90), dago(60), dago(30), dago(5)],
        1: [dago(45), dago(15)],
        2: [dago(150), dago(120), dago(90), dago(60)],
        3: [dago(30)],
    }
    for pi, dates in pay_dates.items():
        for wid, wname, rate in worker_ids[pi]:
            for pay_date in dates:
                if random.random() < 0.75:
                    amount = rate if rate > 1_000_000 else rate * random.randint(20, 26)
                    conn.execute(
                        """INSERT INTO project_worker_payments
                           (worker_id,project_id,amount,date,note,link_finance,finance_tx_id,created_at)
                           VALUES(?,?,?,?,?,0,NULL,?)""",
                        (wid, proj_ids[pi], amount, fmt(pay_date), f"Pembayaran {wname}", now),
                    )
    conn.commit()

    # Invoices
    invoices = {
        0: [("INV-RNV-001", 212_500_000, "sent",  dago(100), dago(70),  None,     "Termin 1 — 25%"),
            ("INV-RNV-002", 212_500_000, "paid",  dago(75),  dago(45),  dago(50), "Termin 2 — 25%"),
            ("INV-RNV-003", 212_500_000, "paid",  dago(45),  dago(15),  dago(20), "Termin 3 — 25%"),
            ("INV-RNV-004", 212_500_000, "draft", dago(5),   dago(25),  None,     "Termin 4 — 25%")],
        1: [("INV-ERP-001",  96_000_000, "paid",  dago(55),  dago(25),  dago(30), "DP 30%"),
            ("INV-ERP-002",  96_000_000, "sent",  dago(20),  dago(10),  None,     "Termin 2 — 30%"),
            ("INV-ERP-003", 128_000_000, "draft", dago(3),   dago(27),  None,     "Pelunasan 40%")],
        2: [("INV-LND-001",  87_500_000, "paid",  dago(170), dago(140), dago(145), "Termin 1"),
            ("INV-LND-002",  87_500_000, "paid",  dago(100), dago(70),  dago(75),  "Pelunasan")],
        3: [("INV-MOB-001",  66_000_000, "sent",  dago(40),  dago(10),  None,      "DP 30%")],
    }
    for pi, invs in invoices.items():
        for inv_no, amount, status, issued, due, paid, note in invs:
            conn.execute(
                """INSERT INTO project_invoices
                   (project_id,invoice_number,amount,status,issued_date,due_date,
                    paid_date,note,link_finance,finance_tx_id,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,0,NULL,?,?)""",
                (proj_ids[pi], inv_no, amount, status, fmt(issued), fmt(due),
                 fmt(paid) if paid else None, note, now, now),
            )
    conn.commit()

    budget_count  = conn.execute("SELECT COUNT(*) FROM project_budget_items").fetchone()[0]
    worker_count  = conn.execute("SELECT COUNT(*) FROM project_workers").fetchone()[0]
    payment_count = conn.execute("SELECT COUNT(*) FROM project_worker_payments").fetchone()[0]
    invoice_count = conn.execute("SELECT COUNT(*) FROM project_invoices").fetchone()[0]
    conn.close()
    print(f"  project: {len(proj_ids)} proyek, {budget_count} RAB items")
    print(f"  workers: {worker_count}, payments: {payment_count}, invoices: {invoice_count}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "up"
    if cmd == "down":
        seed_down()
    elif cmd == "up":
        seed_up()
    elif cmd == "reset":
        seed_down()
        seed_up()
    else:
        print(f"Unknown command: {cmd}. Use: up | down | reset")
        sys.exit(1)
