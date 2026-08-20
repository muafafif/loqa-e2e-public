from pydantic import BaseModel
from typing import Optional


class LocationCreate(BaseModel):
    name: str
    note: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    note: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class ItemCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    location_id: Optional[int] = None
    unit: str = "pcs"
    qty: float = 0
    min_qty: float = 0
    note: Optional[str] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    location_id: Optional[int] = None
    unit: Optional[str] = None
    min_qty: Optional[float] = None
    note: Optional[str] = None
    active: Optional[int] = None


class MovementCreate(BaseModel):
    item_id: int
    location_id: Optional[int] = None
    type: str          # "in" | "out" | "adjustment"
    qty: float
    note: Optional[str] = None
    date: str
