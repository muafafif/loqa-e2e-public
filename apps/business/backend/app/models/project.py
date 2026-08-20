from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    client_contact: Optional[str] = None
    status: str = "active"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    contract_value: Optional[float] = None
    description: Optional[str] = None
    color: str = "#6b7280"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_contact: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    contract_value: Optional[float] = None
    description: Optional[str] = None
    color: Optional[str] = None


class BudgetItemCreate(BaseModel):
    category: str = "Umum"
    description: str
    qty: float = 1
    unit: str = "ls"
    unit_price: float = 0


class BudgetItemUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    qty: Optional[float] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None


class WorkerCreate(BaseModel):
    name: str
    role: Optional[str] = None
    rate_type: str = "fixed"
    rate_amount: float = 0
    status: str = "active"
    note: Optional[str] = None


class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    rate_type: Optional[str] = None
    rate_amount: Optional[float] = None
    status: Optional[str] = None
    note: Optional[str] = None


class WorkerPaymentCreate(BaseModel):
    worker_id: int
    worker_name: Optional[str] = None
    amount: float
    date: str
    note: Optional[str] = None
    link_finance: bool = False
    account_id: Optional[int] = None
    category_id: Optional[int] = None


class WorkerPaymentLinkUpdate(BaseModel):
    link_finance: bool
    account_id: Optional[int] = None
    category_id: Optional[int] = None


class InvoiceCreate(BaseModel):
    invoice_number: str
    amount: float
    status: str = "draft"
    issued_date: str
    due_date: Optional[str] = None
    paid_date: Optional[str] = None
    note: Optional[str] = None
    link_finance: bool = False
    account_id: Optional[int] = None
    category_id: Optional[int] = None


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    issued_date: Optional[str] = None
    due_date: Optional[str] = None
    paid_date: Optional[str] = None
    note: Optional[str] = None


class InvoiceLinkUpdate(BaseModel):
    link_finance: bool
    account_id: Optional[int] = None
    category_id: Optional[int] = None
