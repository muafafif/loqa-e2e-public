from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class OrderItem(BaseModel):
    variant_id: int
    qty: float
    selling_price: float
    cost_method: Optional[str] = None  # per-item HPP method; falls back to order-level then "fifo"


class OrderCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    items: List[OrderItem]
    status: str = "draft"
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    note: Optional[str] = None
    shipping_address_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    cost_method: str = "fifo"  # order-level fallback
    date: str


class OrderUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    shipping_address_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    date: Optional[str] = None


class AddressCreate(BaseModel):
    label: str
    recipient_name: Optional[str] = None
    phone: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    village_id: Optional[int] = None
    detail: Optional[str] = None


class AddressUpdate(BaseModel):
    label: Optional[str] = None
    recipient_name: Optional[str] = None
    phone: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    village_id: Optional[int] = None
    detail: Optional[str] = None


class CityCreate(BaseModel):
    name: str


class DistrictCreate(BaseModel):
    city_id: int
    name: str


class VillageCreate(BaseModel):
    district_id: int
    name: str


class OrderSettingsUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    default_account_id: Optional[int] = None
    default_category_id: Optional[int] = None
    default_cost_method: Optional[str] = None
    default_warehouse_id: Optional[int] = None
