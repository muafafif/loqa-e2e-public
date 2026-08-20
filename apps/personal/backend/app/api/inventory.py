from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services import inventory_service as inv
from app.models.inventory import (
    LocationCreate, LocationUpdate,
    CategoryCreate, CategoryUpdate,
    ItemCreate, ItemUpdate,
    MovementCreate,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

inv.init_db()


# ── Locations ─────────────────────────────────────────────────────────────────

@router.get("/locations")
def list_locations():
    return inv.list_locations()


@router.post("/locations", status_code=201)
def create_location(body: LocationCreate):
    return inv.create_location(body.model_dump())


@router.patch("/locations/{location_id}")
def update_location(location_id: int, body: LocationUpdate):
    result = inv.update_location(location_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/locations/{location_id}", status_code=204)
def delete_location(location_id: int):
    inv.delete_location(location_id)


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories():
    return inv.list_categories()


@router.post("/categories", status_code=201)
def create_category(body: CategoryCreate):
    return inv.create_category(body.model_dump())


@router.patch("/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate):
    result = inv.update_category(category_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int):
    inv.delete_category(category_id)


# ── Items ─────────────────────────────────────────────────────────────────────

@router.get("/items")
def list_items(
    category_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    low_stock_only: bool = Query(False),
    active_only: bool = Query(True),
    q: Optional[str] = Query(None),
):
    return inv.list_items(
        category_id=category_id,
        location_id=location_id,
        low_stock_only=low_stock_only,
        active_only=active_only,
        q=q,
    )


@router.get("/items/{item_id}")
def get_item(item_id: int):
    result = inv.get_item(item_id)
    if not result:
        raise HTTPException(404)
    return result


@router.post("/items", status_code=201)
def create_item(body: ItemCreate):
    return inv.create_item(body.model_dump())


@router.patch("/items/{item_id}")
def update_item(item_id: int, body: ItemUpdate):
    result = inv.update_item(item_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404)
    return result


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    inv.delete_item(item_id)


# ── Movements ─────────────────────────────────────────────────────────────────

@router.get("/movements")
def list_movements(
    item_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return inv.list_movements(
        item_id=item_id,
        location_id=location_id,
        limit=limit,
        offset=offset,
    )


@router.post("/movements", status_code=201)
def create_movement(body: MovementCreate):
    try:
        return inv.create_movement(body.model_dump())
    except ValueError as e:
        raise HTTPException(400, detail=str(e))


@router.delete("/movements/{movement_id}", status_code=204)
def delete_movement(movement_id: int):
    inv.delete_movement(movement_id)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard():
    return inv.get_dashboard()
