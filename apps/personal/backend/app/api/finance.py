from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from app.models.finance import (
    AccountCreate, AccountUpdate,
    CategoryCreate, CategoryUpdate,
    PocketCreate, PocketUpdate,
    TransactionCreate, TransactionUpdate,
    GoalCreate, GoalUpdate,
)
from app.services import finance_service as fs

router = APIRouter(prefix="/finance", tags=["finance"])


# ── App-level lock ────────────────────────────────────────────────────────────

class LockBody(BaseModel):
    locked: bool


@router.get("/lock")
def get_app_lock():
    return {"locked": fs.get_finance_app_locked()}


@router.post("/lock")
def set_app_lock(body: LockBody):
    fs.set_finance_app_locked(body.locked)
    return {"locked": body.locked}


# ── Pockets ───────────────────────────────────────────────────────────────────

@router.get("/pockets")
def list_pockets():
    return {"pockets": fs.list_pockets()}


@router.post("/pockets", status_code=201)
def create_pocket(body: PocketCreate):
    return fs.create_pocket(body.model_dump())


@router.get("/pockets/{pocket_id}")
def get_pocket(pocket_id: int):
    p = fs.get_pocket(pocket_id)
    if not p:
        raise HTTPException(404, "Pocket not found")
    return p


@router.patch("/pockets/{pocket_id}")
def update_pocket(pocket_id: int, body: PocketUpdate):
    p = fs.update_pocket(pocket_id, body.model_dump(exclude_none=True))
    if not p:
        raise HTTPException(404, "Pocket not found")
    return p


@router.delete("/pockets/{pocket_id}", status_code=204)
def delete_pocket(pocket_id: int):
    fs.delete_pocket(pocket_id)


@router.post("/pockets/{pocket_id}/lock")
def lock_pocket(pocket_id: int, body: LockBody):
    p = fs.set_pocket_locked(pocket_id, body.locked)
    if not p:
        raise HTTPException(404, "Pocket not found")
    return p


# ── Accounts ──────────────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts():
    return {"accounts": fs.list_accounts()}


@router.post("/accounts", status_code=201)
def create_account(body: AccountCreate):
    return fs.create_account(body.model_dump())


@router.get("/accounts/{account_id}")
def get_account(account_id: int):
    acc = fs.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


@router.patch("/accounts/{account_id}")
def update_account(account_id: int, body: AccountUpdate):
    acc = fs.update_account(account_id, body.model_dump(exclude_none=True))
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int):
    fs.delete_account(account_id)


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(type: Optional[str] = Query(None)):
    return {"categories": fs.list_categories(type_filter=type)}


@router.post("/categories", status_code=201)
def create_category(body: CategoryCreate):
    return fs.create_category(body.model_dump())


@router.get("/categories/{category_id}")
def get_category(category_id: int):
    cat = fs.get_category(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    return cat


@router.patch("/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate):
    cat = fs.update_category(category_id, body.model_dump(exclude_none=True))
    if not cat:
        raise HTTPException(404, "Category not found")
    return cat


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int):
    fs.delete_category(category_id)


# ── Transactions ──────────────────────────────────────────────────────────────

@router.get("/transactions")
def list_transactions(
    account_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    pocket_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    transactions = fs.list_transactions(
        account_id=account_id, category_id=category_id, pocket_id=pocket_id,
        tx_type=type, date_from=date_from, date_to=date_to, q=q, limit=limit, offset=offset,
    )
    total = fs.count_transactions(
        account_id=account_id, category_id=category_id, pocket_id=pocket_id,
        tx_type=type, date_from=date_from, date_to=date_to, q=q,
    )
    return {"transactions": transactions, "total": total}


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionCreate):
    acc = fs.get_account(body.account_id)
    if not acc:
        raise HTTPException(400, "Account not found")
    if body.type == "transfer":
        if not body.to_account_id:
            raise HTTPException(400, "to_account_id required for transfer")
        if body.to_account_id == body.account_id:
            raise HTTPException(400, "Source and destination account must be different")
        if not fs.get_account(body.to_account_id):
            raise HTTPException(400, "Destination account not found")
    return fs.create_transaction(body.model_dump())


@router.get("/transactions/{tx_id}")
def get_transaction(tx_id: int):
    tx = fs.get_transaction(tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    return tx


@router.patch("/transactions/{tx_id}")
def update_transaction(tx_id: int, body: TransactionUpdate):
    tx = fs.update_transaction(tx_id, body.model_dump(exclude_none=True))
    if not tx:
        raise HTTPException(404, "Transaction not found")
    return tx


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int):
    fs.delete_transaction(tx_id)


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
def get_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    pocket_id: Optional[int] = Query(None),
    account_id: Optional[int] = Query(None),
):
    return fs.get_summary(date_from=date_from, date_to=date_to, pocket_id=pocket_id, account_id=account_id)


@router.get("/summary/timeline")
def get_timeline(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    pocket_id: Optional[int] = Query(None),
    account_id: Optional[int] = Query(None),
):
    return fs.get_timeline(date_from=date_from, date_to=date_to, pocket_id=pocket_id, account_id=account_id)


@router.get("/summary/monthly")
def get_monthly(
    months: int = Query(12, ge=1, le=36),
    pocket_id: Optional[int] = Query(None),
    account_id: Optional[int] = Query(None),
):
    return fs.get_monthly(months=months, pocket_id=pocket_id, account_id=account_id)


@router.get("/summary/accounts")
def get_accounts_summary(
    account_id: Optional[int] = Query(None),
):
    return fs.get_accounts_summary(account_id=account_id)


# ── Financial Goals ───────────────────────────────────────────────────────────

@router.get("/goals")
def list_goals():
    return {"goals": fs.list_goals()}


@router.post("/goals", status_code=201)
def create_goal(body: GoalCreate):
    return fs.create_goal(body.model_dump())


@router.patch("/goals/{goal_id}")
def update_goal(goal_id: int, body: GoalUpdate):
    goal = fs.update_goal(goal_id, body.model_dump(exclude_unset=True))
    if not goal:
        raise HTTPException(404, "Goal not found")
    return goal


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int):
    found = fs.delete_goal(goal_id)
    if not found:
        raise HTTPException(404, "Goal not found")
