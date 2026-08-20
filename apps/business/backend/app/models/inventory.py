from pydantic import BaseModel
from typing import Optional
from enum import Enum


class MovementType(str, Enum):
    IN = "in"
    OUT = "out"
    OPNAME = "opname"
    ADJUSTMENT = "adjustment"


class CostMethod(str, Enum):
    FIFO = "fifo"
    AVERAGE = "average"
    FIXED = "fixed"


class ProductType(str, Enum):
    PHYSICAL = "physical"
    SERVICE = "service"
    DIGITAL = "digital"


# ── Warehouses ────────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = None
    note: Optional[str] = None


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    note: Optional[str] = None


# ── Brands ────────────────────────────────────────────────────────────────────

class BrandCreate(BaseModel):
    name: str
    description: Optional[str] = None


class BrandUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ── Subcategories ─────────────────────────────────────────────────────────────

class SubcategoryCreate(BaseModel):
    category_id: int
    name: str
    description: Optional[str] = None


class SubcategoryUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None


# ── Product Categories (legacy — kept for existing quick-add in ProductsPanel) ─

class ProductCategoryCreate(BaseModel):
    name: str
    color: str = "#6b7280"


class ProductCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


# ── Products ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    unit: str = "pcs"
    min_stock: float = 0.0
    active: bool = True
    is_for_sale: bool = True
    type: ProductType = ProductType.PHYSICAL
    cost_method: CostMethod = CostMethod.AVERAGE
    brand_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    description: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[float] = None
    active: Optional[bool] = None
    is_for_sale: Optional[bool] = None
    type: Optional[ProductType] = None
    cost_method: Optional[CostMethod] = None
    brand_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    description: Optional[str] = None


# ── Product Variants ──────────────────────────────────────────────────────────

class VariantCreate(BaseModel):
    name: str
    sku_suffix: Optional[str] = None
    fixed_cost: Optional[float] = None
    selling_price: Optional[float] = None
    default_unit_cost: Optional[float] = None
    color: str = "#6b7280"


class VariantUpdate(BaseModel):
    name: Optional[str] = None
    sku_suffix: Optional[str] = None
    fixed_cost: Optional[float] = None
    selling_price: Optional[float] = None
    default_unit_cost: Optional[float] = None
    color: Optional[str] = None


# ── Stock Movements ───────────────────────────────────────────────────────────

class MovementCreate(BaseModel):
    variant_id: int
    warehouse_id: int
    type: MovementType
    qty: float
    unit_cost: Optional[float] = None
    selling_price: Optional[float] = None
    note: Optional[str] = None
    date: Optional[str] = None
    link_finance: bool = False
    finance_account_id: Optional[int] = None
    finance_category_id: Optional[int] = None


class MovementFinancePatch(BaseModel):
    link_finance: bool
    finance_account_id: Optional[int] = None
    finance_category_id: Optional[int] = None


# ── Stock Opname ──────────────────────────────────────────────────────────────

class OpnameItem(BaseModel):
    variant_id: int
    warehouse_id: int
    physical_qty: float


class OpnameCreate(BaseModel):
    note: Optional[str] = None
    date: Optional[str] = None
    items: list[OpnameItem]
    link_finance: bool = False
    finance_account_id: Optional[int] = None
    shrinkage_category_id: Optional[int] = None
