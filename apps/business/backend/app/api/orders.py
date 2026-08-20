from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from typing import Optional
from app.services import order_service as os_
from app.services import inventory_service as inv
from app.services import finance_service as fs
from app.models.order import (
    OrderCreate, OrderUpdate, AddressCreate, AddressUpdate,
    CityCreate, DistrictCreate, VillageCreate,
    OrderSettingsUpdate,
)

router = APIRouter(prefix="/orders", tags=["orders"])

os_.init_db()


# ── Settings ───────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings():
    return os_.get_order_settings()


@router.post("/settings")
def save_settings(body: OrderSettingsUpdate):
    return os_.save_order_settings(body.model_dump(exclude_none=False))


# ── Wilayah ────────────────────────────────────────────────────────────────────

@router.get("/wilayah/cities")
def list_cities():
    return os_.list_cities()


@router.post("/wilayah/cities", status_code=201)
def create_city(body: CityCreate):
    return os_.create_city(body.name)


@router.patch("/wilayah/cities/{city_id}")
def update_city(city_id: int, body: CityCreate):
    result = os_.update_city(city_id, body.name)
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/wilayah/cities/{city_id}", status_code=204)
def delete_city(city_id: int):
    os_.delete_city(city_id)


@router.get("/wilayah/districts")
def list_districts(city_id: Optional[int] = Query(None)):
    return os_.list_districts(city_id)


@router.post("/wilayah/districts", status_code=201)
def create_district(body: DistrictCreate):
    return os_.create_district(body.city_id, body.name)


@router.patch("/wilayah/districts/{district_id}")
def update_district(district_id: int, body: CityCreate):
    result = os_.update_district(district_id, body.name)
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/wilayah/districts/{district_id}", status_code=204)
def delete_district(district_id: int):
    os_.delete_district(district_id)


@router.get("/wilayah/villages")
def list_villages(district_id: Optional[int] = Query(None)):
    return os_.list_villages(district_id)


@router.post("/wilayah/villages", status_code=201)
def create_village(body: VillageCreate):
    return os_.create_village(body.district_id, body.name)


@router.patch("/wilayah/villages/{village_id}")
def update_village(village_id: int, body: CityCreate):
    result = os_.update_village(village_id, body.name)
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/wilayah/villages/{village_id}", status_code=204)
def delete_village(village_id: int):
    os_.delete_village(village_id)


@router.post("/wilayah/import")
async def import_wilayah(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    result = os_.import_wilayah_csv(text)
    return {"ok": True, **result}


# ── Shipping Addresses ─────────────────────────────────────────────────────────

@router.get("/addresses")
def list_addresses():
    return os_.list_addresses()


@router.post("/addresses", status_code=201)
def create_address(body: AddressCreate):
    return os_.create_address(body.model_dump())


@router.patch("/addresses/{addr_id}")
def update_address(addr_id: int, body: AddressUpdate):
    result = os_.update_address(addr_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/addresses/{addr_id}", status_code=204)
def delete_address(addr_id: int):
    os_.delete_address(addr_id)


# ── Barcode lookup ─────────────────────────────────────────────────────────────

@router.get("/barcode/{barcode}")
def barcode_lookup(barcode: str):
    result = os_.lookup_by_barcode(barcode)
    if not result:
        raise HTTPException(404, detail="Product not found")
    return result


@router.get("/products/search")
def search_products(q: str = Query(""), limit: int = Query(10, ge=1, le=50)):
    return os_.search_products_for_kasir(q, limit)


# ── Orders ────────────────────────────────────────────────────────────────────

@router.get("")
def list_orders(
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return os_.list_orders(status=status, q=q, limit=limit, offset=offset)


# ── Insight summary — must be before /{order_id} to avoid int-cast collision ──

@router.get("/summary")
def get_order_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    months: int = Query(6, ge=1, le=24),
):
    return os_.get_order_summary(date_from=date_from, date_to=date_to, months=months)


@router.get("/{order_id}")
def get_order(order_id: int):
    result = os_.get_order(order_id)
    if not result:
        raise HTTPException(404)
    return result


@router.post("", status_code=201)
def create_order(body: OrderCreate):
    return os_.create_order(body.model_dump(), inv, fs)


@router.patch("/{order_id}")
def update_order(order_id: int, body: OrderUpdate):
    order = os_.get_order(order_id)
    if not order:
        raise HTTPException(404)
    try:
        result = os_.update_order(order_id, body.model_dump(exclude_none=True), inv, fs)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    return result


@router.post("/{order_id}/cancel")
def cancel_order(order_id: int):
    order = os_.get_order(order_id)
    if not order:
        raise HTTPException(404)
    if order["status"] == "cancelled":
        raise HTTPException(400, detail="Order is already cancelled")
    result = os_.cancel_order(order_id, inv, fs)
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int):
    order = os_.get_order(order_id)
    if not order:
        raise HTTPException(404)
    os_.delete_order(order_id, inv, fs)
