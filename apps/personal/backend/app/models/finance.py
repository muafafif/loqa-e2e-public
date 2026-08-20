from pydantic import BaseModel
from typing import Optional
from enum import Enum


class AccountType(str, Enum):
    CASH = "cash"
    BANK = "bank"
    EWALLET = "ewallet"
    CREDIT = "credit"
    INVESTMENT = "investment"
    OTHER = "other"


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class AccountCreate(BaseModel):
    name: str
    type: AccountType = AccountType.CASH
    balance: float = 0.0
    currency: str = "IDR"
    color: str = "#0284c7"
    note: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[AccountType] = None
    balance: Optional[float] = None
    currency: Optional[str] = None
    color: Optional[str] = None
    note: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str
    type: TransactionType
    color: str = "#6b7280"
    icon: str = "tag"


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[TransactionType] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class PocketCreate(BaseModel):
    name: str
    color: str = "#0284c7"
    icon: str = "folder"


class PocketUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class TransactionCreate(BaseModel):
    account_id: int
    category_id: Optional[int] = None
    pocket_id: Optional[int] = None
    to_account_id: Optional[int] = None   # required when type == transfer
    type: TransactionType
    amount: float
    date: str                     # ISO date string: "2026-05-01"
    description: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None    # comma-separated


class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    pocket_id: Optional[int] = None
    to_account_id: Optional[int] = None
    type: Optional[TransactionType] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None


class TransactionFilter(BaseModel):
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    pocket_id: Optional[int] = None
    type: Optional[TransactionType] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    q: Optional[str] = None
    limit: int = 50
    offset: int = 0


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    saved_amount: float = 0.0
    deadline: Optional[str] = None
    color: str = "#0284c7"
    icon: str = "target"
    note: Optional[str] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    saved_amount: Optional[float] = None
    deadline: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    note: Optional[str] = None
