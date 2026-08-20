from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Body
from fastapi.responses import PlainTextResponse, FileResponse
from typing import Optional, List
import app.services.csv_import_service as csv_svc
from app.models.inventory import (
    WarehouseCreate, WarehouseUpdate,
    BrandCreate, BrandUpdate,
    CategoryCreate, CategoryUpdate,
    SubcategoryCreate, SubcategoryUpdate,
    ProductCategoryCreate, ProductCategoryUpdate,
    ProductCreate, ProductUpdate,
    VariantCreate, VariantUpdate,
    MovementCreate, MovementFinancePatch, OpnameCreate,
)
import app.services.inventory_service as inv
import app.services.finance_service as fs
from app.core.config import settings

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Warehouses ────────────────────────────────────────────────────────────────

@router.get("/warehouses")
def list_warehouses():
    return {"warehouses": inv.list_warehouses()}


@router.post("/warehouses", status_code=201)
def create_warehouse(body: WarehouseCreate):
    return inv.create_warehouse(body.model_dump())


@router.patch("/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, body: WarehouseUpdate):
    wh = inv.update_warehouse(warehouse_id, body.model_dump(exclude_none=True))
    if not wh:
        raise HTTPException(404, "Gudang tidak ditemukan")
    return wh


@router.delete("/warehouses/{warehouse_id}", status_code=204)
def delete_warehouse(warehouse_id: int):
    inv.delete_warehouse(warehouse_id)


# ── Brands ────────────────────────────────────────────────────────────────────

@router.get("/brands")
def list_brands():
    return {"brands": inv.list_brands()}


@router.post("/brands", status_code=201)
def create_brand(body: BrandCreate):
    return inv.create_brand(body.model_dump())


@router.patch("/brands/{brand_id}")
def update_brand(brand_id: int, body: BrandUpdate):
    b = inv.update_brand(brand_id, body.model_dump(exclude_none=True))
    if not b:
        raise HTTPException(404, "Brand tidak ditemukan")
    return b


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: int):
    inv.delete_brand(brand_id)


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories():
    return {"categories": inv.list_categories()}


@router.post("/categories", status_code=201)
def create_category(body: CategoryCreate):
    return inv.create_category(body.model_dump())


@router.patch("/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate):
    c = inv.update_category(category_id, body.model_dump(exclude_none=True))
    if not c:
        raise HTTPException(404, "Kategori tidak ditemukan")
    return c


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int):
    inv.delete_category(category_id)


# ── Subcategories ─────────────────────────────────────────────────────────────

@router.get("/subcategories")
def list_subcategories(category_id: Optional[int] = Query(None)):
    return {"subcategories": inv.list_subcategories(category_id=category_id)}


@router.post("/subcategories", status_code=201)
def create_subcategory(body: SubcategoryCreate):
    return inv.create_subcategory(body.model_dump())


@router.patch("/subcategories/{subcategory_id}")
def update_subcategory(subcategory_id: int, body: SubcategoryUpdate):
    s = inv.update_subcategory(subcategory_id, body.model_dump(exclude_none=True))
    if not s:
        raise HTTPException(404, "Subkategori tidak ditemukan")
    return s


@router.delete("/subcategories/{subcategory_id}", status_code=204)
def delete_subcategory(subcategory_id: int):
    inv.delete_subcategory(subcategory_id)


# ── Product Categories (legacy) ───────────────────────────────────────────────

@router.get("/product-categories")
def list_product_categories():
    return {"categories": inv.list_product_categories()}


@router.post("/product-categories", status_code=201)
def create_product_category(body: ProductCategoryCreate):
    return inv.create_product_category(body.model_dump())


@router.patch("/product-categories/{category_id}")
def update_product_category(category_id: int, body: ProductCategoryUpdate):
    cat = inv.update_product_category(category_id, body.model_dump(exclude_none=True))
    if not cat:
        raise HTTPException(404, "Kategori tidak ditemukan")
    return cat


@router.delete("/product-categories/{category_id}", status_code=204)
def delete_product_category(category_id: int):
    inv.delete_product_category(category_id)


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products")
def list_products(
    active_only:    bool          = Query(False),
    brand_id:       Optional[int] = Query(None),
    subcategory_id: Optional[int] = Query(None),
    category_id:    Optional[int] = Query(None),
    q:              Optional[str] = Query(None),
    limit:          int           = Query(30, ge=1, le=200),
    offset:         int           = Query(0, ge=0),
):
    return inv.list_products(
        active_only=active_only,
        brand_id=brand_id,
        subcategory_id=subcategory_id,
        category_id=category_id,
        name_search=q,
        limit=limit,
        offset=offset,
    )


@router.get("/products/{product_id}")
def get_product(product_id: int):
    p = inv.get_product(product_id)
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    return p


@router.post("/products", status_code=201)
def create_product(body: ProductCreate):
    return inv.create_product(body.model_dump())


@router.patch("/products/{product_id}")
def update_product(product_id: int, body: ProductUpdate):
    p = inv.update_product(product_id, body.model_dump())
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    return p


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int):
    inv.delete_product(product_id)


# ── Product Images ────────────────────────────────────────────────────────────

@router.get("/products/{product_id}/images")
def list_product_images(product_id: int):
    return {"images": inv.list_product_images(product_id)}


@router.post("/products/{product_id}/images", status_code=201)
async def upload_product_image(product_id: int, file: UploadFile = File(...)):
    p = inv.get_product(product_id)
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    content_type = file.content_type or ""
    data = await file.read()
    try:
        return inv.add_product_image(product_id, data, content_type)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/images/{image_id}", status_code=204)
def delete_product_image(image_id: int):
    ok = inv.delete_product_image(image_id)
    if not ok:
        raise HTTPException(404, "Gambar tidak ditemukan")


@router.post("/products/{product_id}/images/reorder", status_code=204)
def reorder_product_images(product_id: int, image_ids: List[int] = Body(...)):
    inv.reorder_product_images(product_id, image_ids)


@router.get("/images/{filename}")
def serve_product_image(filename: str):
    path = settings.product_images_dir / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Gambar tidak ditemukan")
    # Basic path traversal guard
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Nama file tidak valid")
    return FileResponse(str(path))


# ── Variants ──────────────────────────────────────────────────────────────────

@router.post("/products/{product_id}/variants", status_code=201)
def create_variant(product_id: int, body: VariantCreate):
    p = inv.get_product(product_id)
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    return inv.create_variant(product_id, body.model_dump())


@router.patch("/variants/{variant_id}")
def update_variant(variant_id: int, body: VariantUpdate):
    v = inv.update_variant(variant_id, body.model_dump(exclude_none=True))
    if not v:
        raise HTTPException(404, "Varian tidak ditemukan")
    return v


@router.delete("/variants/{variant_id}", status_code=204)
def delete_variant(variant_id: int):
    inv.delete_variant(variant_id)


# ── Stock Levels ──────────────────────────────────────────────────────────────

@router.get("/stock")
def list_stock(warehouse_id: Optional[int] = Query(None)):
    return {"stock": inv.list_stock_levels(warehouse_id=warehouse_id)}


# ── Movements ─────────────────────────────────────────────────────────────────

@router.get("/movements")
def list_movements(
    variant_id:   Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    type:         Optional[str] = Query(None),
    date_from:    Optional[str] = Query(None),
    date_to:      Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
):
    return inv.list_movements(
        variant_id=variant_id,
        warehouse_id=warehouse_id,
        mv_type=type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.post("/movements", status_code=201)
def create_movement(body: MovementCreate):
    try:
        return inv.create_movement(
            body.model_dump(),
            finance_service=fs if body.link_finance else None,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/movements/{movement_id}", status_code=204)
def delete_movement(movement_id: int):
    try:
        inv.delete_movement(movement_id, finance_service=fs)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.patch("/movements/{movement_id}/finance")
def patch_movement_finance(movement_id: int, body: MovementFinancePatch):
    try:
        return inv.patch_movement_finance(
            movement_id,
            body.model_dump(),
            finance_service=fs,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Stock Opname ──────────────────────────────────────────────────────────────

@router.post("/opname", status_code=201)
def create_opname(body: OpnameCreate):
    try:
        results = inv.create_opname(
            body.model_dump(),
            finance_service=fs if body.link_finance else None,
        )
        return {"movements": results, "count": len(results)}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(warehouse_id: Optional[int] = Query(None)):
    return inv.get_dashboard(warehouse_id=warehouse_id)


@router.get("/report/turnover")
def get_turnover_report(
    months:       int           = Query(12, ge=1, le=36),
    warehouse_id: Optional[int] = Query(None),
):
    return inv.get_turnover_report(months=months, warehouse_id=warehouse_id)


@router.get("/report/brands")
def get_brand_report():
    return {"brands": inv.get_brand_report()}


@router.get("/report/categories")
def get_category_report():
    return {"categories": inv.get_category_report()}


@router.get("/report/profit")
def get_profit_per_product(
    date_from:    Optional[str] = Query(None),
    date_to:      Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
):
    return {"rows": inv.get_profit_per_product(
        date_from=date_from,
        date_to=date_to,
        warehouse_id=warehouse_id,
    )}


# ── CSV Import ────────────────────────────────────────────────────────────────

VALID_IMPORT_TYPES = list(csv_svc.IMPORT_HANDLERS.keys())


@router.get("/import/template/{import_type}", response_class=PlainTextResponse)
def download_template(import_type: str):
    """Download CSV template for a given import type."""
    if import_type not in csv_svc.TEMPLATES:
        raise HTTPException(400, f"Unknown type. Valid: {list(csv_svc.TEMPLATES)}")
    csv_content = csv_svc.generate_template(import_type)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=template_{import_type}.csv"},
    )


@router.post("/import/{import_type}")
async def import_csv(import_type: str, file: UploadFile = File(...)):
    """Import master data from a CSV file. Always saves an import log."""
    if import_type not in VALID_IMPORT_TYPES:
        raise HTTPException(400, f"Unknown type. Valid: {VALID_IMPORT_TYPES}")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File harus berformat .csv")
    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            content = content_bytes.decode("latin-1")
        except Exception:
            raise HTTPException(400, "Encoding file tidak didukung. Simpan sebagai UTF-8.")
    try:
        result = csv_svc.run_import(import_type, content)
    except ValueError as e:
        raise HTTPException(400, str(e))

    rows = result.get("rows", [])
    errors = result.get("errors", [])
    imported = result.get("imported", 0)
    skipped = len([e for e in errors if e.get("row", 0) > 0])
    log = inv.save_import_log(
        import_type=import_type,
        filename=file.filename or "unknown.csv",
        total_rows=len(rows),
        imported=imported,
        skipped=skipped,
        errors=errors,
        all_rows=rows,
        products_imported=result.get("products_imported", 0),
        variants_imported=result.get("variants_imported", 0),
    )

    # Return log_id so frontend can offer direct download; strip raw rows
    result.pop("rows", None)
    result["log_id"] = log["id"]
    return result


# ── Import Logs ───────────────────────────────────────────────────────────────

@router.get("/import/logs")
def list_import_logs(
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return inv.list_import_logs(limit=limit, offset=offset)


@router.get("/import/logs/{log_id}")
def get_import_log(log_id: int):
    log = inv.get_import_log(log_id)
    if not log:
        raise HTTPException(404, "Log tidak ditemukan")
    # Don't send rows in detail endpoint either — only errors
    log.pop("rows", None)
    return log


@router.get("/import/logs/{log_id}/result.csv", response_class=PlainTextResponse)
def download_import_result_csv(log_id: int):
    log = inv.get_import_log(log_id)
    if not log:
        raise HTTPException(404, "Log tidak ditemukan")
    csv_content = inv.build_result_csv(log)
    if not csv_content:
        raise HTTPException(404, "Tidak ada data pada log ini")
    filename = f"result_{log_id}_{log['import_type']}.csv"
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.delete("/import/logs/{log_id}", status_code=204)
def delete_import_log(log_id: int):
    inv.delete_import_log(log_id)
