from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services import lock_service as ls

router = APIRouter(prefix="/lock", tags=["lock"])


class SetPinRequest(BaseModel):
    pin: str
    timeout_minutes: int = 30


class ChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str


class UnlockRequest(BaseModel):
    pin: str
    timeout_minutes: Optional[int] = None


class TimeoutRequest(BaseModel):
    timeout_minutes: int


@router.get("/status")
def get_status():
    return ls.get_status()


@router.post("/setup")
def setup_pin(body: SetPinRequest):
    if len(body.pin) < 4:
        raise HTTPException(400, "PIN harus minimal 4 karakter")
    ls.set_pin(body.pin, body.timeout_minutes)
    return {"ok": True}


@router.post("/unlock")
def unlock(body: UnlockRequest):
    ok = ls.unlock(body.pin, body.timeout_minutes)
    if not ok:
        raise HTTPException(401, "PIN salah")
    return {"ok": True}


@router.post("/lock")
def lock():
    ls.lock()
    return {"ok": True}


@router.post("/change-pin")
def change_pin(body: ChangePinRequest):
    if len(body.new_pin) < 4:
        raise HTTPException(400, "PIN baru harus minimal 4 karakter")
    ok = ls.change_pin(body.old_pin, body.new_pin)
    if not ok:
        raise HTTPException(401, "PIN lama salah")
    return {"ok": True}


@router.post("/timeout")
def set_timeout(body: TimeoutRequest):
    if body.timeout_minutes < 1:
        raise HTTPException(400, "Timeout minimal 1 menit")
    ls.set_timeout(body.timeout_minutes)
    return {"ok": True}


@router.post("/touch")
def touch():
    """Reset idle timer — called by frontend on user activity."""
    ls.touch()
    return {"ok": True}
