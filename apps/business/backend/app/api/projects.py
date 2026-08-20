from fastapi import APIRouter, HTTPException
from app.models.project import (
    ProjectCreate, ProjectUpdate,
    BudgetItemCreate, BudgetItemUpdate,
    WorkerCreate, WorkerUpdate,
    WorkerPaymentCreate, WorkerPaymentLinkUpdate,
    InvoiceCreate, InvoiceUpdate, InvoiceLinkUpdate,
)
from app.services import project_service as svc

router = APIRouter(prefix="/projects", tags=["projects"])


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("")
def list_projects(status: str = None):
    return {"projects": svc.list_projects(status)}


@router.post("")
def create_project(body: ProjectCreate):
    return svc.create_project(body.model_dump())


@router.get("/dashboard")
def get_dashboard():
    return svc.get_dashboard()


@router.get("/{project_id}")
def get_project(project_id: int):
    p = svc.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.patch("/{project_id}")
def update_project(project_id: int, body: ProjectUpdate):
    p = svc.update_project(project_id, body.model_dump(exclude_none=True))
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.delete("/{project_id}")
def delete_project(project_id: int):
    svc.delete_project(project_id)
    return {"ok": True}


# ── Budget Items (RAB) ────────────────────────────────────────────────────────

@router.get("/{project_id}/budget")
def list_budget(project_id: int):
    return {"items": svc.list_budget_items(project_id)}


@router.post("/{project_id}/budget")
def create_budget_item(project_id: int, body: BudgetItemCreate):
    return svc.create_budget_item(project_id, body.model_dump())


@router.patch("/budget/{item_id}")
def update_budget_item(item_id: int, body: BudgetItemUpdate):
    item = svc.update_budget_item(item_id, body.model_dump(exclude_none=True))
    if not item:
        raise HTTPException(404, "Budget item not found")
    return item


@router.delete("/budget/{item_id}")
def delete_budget_item(item_id: int):
    svc.delete_budget_item(item_id)
    return {"ok": True}


# ── Workers ───────────────────────────────────────────────────────────────────

@router.get("/{project_id}/workers")
def list_workers(project_id: int):
    return {"workers": svc.list_workers(project_id)}


@router.post("/{project_id}/workers")
def create_worker(project_id: int, body: WorkerCreate):
    return svc.create_worker(project_id, body.model_dump())


@router.patch("/workers/{worker_id}")
def update_worker(worker_id: int, body: WorkerUpdate):
    w = svc.update_worker(worker_id, body.model_dump(exclude_none=True))
    if not w:
        raise HTTPException(404, "Worker not found")
    return w


@router.delete("/workers/{worker_id}")
def delete_worker(worker_id: int):
    svc.delete_worker(worker_id)
    return {"ok": True}


# ── Worker Payments ───────────────────────────────────────────────────────────

@router.get("/{project_id}/payments")
def list_payments(project_id: int):
    return {"payments": svc.list_worker_payments(project_id)}


@router.post("/{project_id}/payments")
def create_payment(project_id: int, body: WorkerPaymentCreate):
    return svc.create_worker_payment(project_id, body.model_dump())


@router.patch("/payments/{payment_id}/link")
def update_payment_link(payment_id: int, body: WorkerPaymentLinkUpdate):
    p = svc.update_worker_payment_link(payment_id, body.model_dump())
    if not p:
        raise HTTPException(404, "Payment not found")
    return p


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: int):
    svc.delete_worker_payment(payment_id)
    return {"ok": True}


# ── Invoices ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/invoices")
def list_invoices(project_id: int):
    return {"invoices": svc.list_invoices(project_id)}


@router.post("/{project_id}/invoices")
def create_invoice(project_id: int, body: InvoiceCreate):
    return svc.create_invoice(project_id, body.model_dump())


@router.patch("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, body: InvoiceUpdate):
    inv = svc.update_invoice(invoice_id, body.model_dump(exclude_none=True))
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.patch("/invoices/{invoice_id}/link")
def update_invoice_link(invoice_id: int, body: InvoiceLinkUpdate):
    inv = svc.update_invoice_link(invoice_id, body.model_dump())
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int):
    svc.delete_invoice(invoice_id)
    return {"ok": True}
