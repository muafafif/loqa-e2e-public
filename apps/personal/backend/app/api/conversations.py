from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.services import conversation_service as cs
from app.services import lock_service as ls

router = APIRouter(prefix="/conversations", tags=["conversations"])


class PinRequest(BaseModel):
    pinned: bool


class LockRequest(BaseModel):
    locked: bool


class PersonaRequest(BaseModel):
    persona_prompt: Optional[str] = None


@router.get("")
def list_convs(
    q: Optional[str] = Query(None),
    limit: int = 100,
    offset: int = 0,
    chat_mode: Optional[str] = Query(None),
    exclude_mode: Optional[str] = Query(None),
    pocket_id: Optional[int] = Query(None),
    kb_id: Optional[str] = Query(None),
):
    if q and q.strip():
        return cs.search_conversations(q.strip(), chat_mode=chat_mode, pocket_id=pocket_id, kb_id=kb_id, exclude_mode=exclude_mode)
    return cs.list_conversations(limit=limit, offset=offset, chat_mode=chat_mode, pocket_id=pocket_id, kb_id=kb_id, exclude_mode=exclude_mode)


@router.get("/{conv_id}")
def get_conv(conv_id: str):
    conv = cs.get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    key = ls.get_key() if conv.get("locked") else None
    if conv.get("locked") and key is None:
        # Return metadata only — messages are locked
        return {**conv, "messages": [], "access_denied": True}

    ls.touch()
    messages = cs.get_messages(conv_id, key=key)
    return {**conv, "messages": messages, "access_denied": False}


@router.patch("/{conv_id}/pin")
def pin_conv(conv_id: str, body: PinRequest):
    cs.pin_conversation(conv_id, body.pinned)
    return {"ok": True}


@router.patch("/{conv_id}/lock")
def lock_conv(conv_id: str, body: LockRequest):
    key = ls.get_key()
    if key is None:
        raise HTTPException(403, "Masukkan PIN terlebih dahulu untuk mengunci/membuka percakapan")
    ls.touch()
    try:
        cs.set_locked(conv_id, body.locked, key=key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.patch("/{conv_id}/persona")
def set_persona(conv_id: str, body: PersonaRequest):
    cs.update_persona_prompt(conv_id, body.persona_prompt)
    return {"ok": True}


@router.delete("/{conv_id}")
def delete_conv(conv_id: str):
    cs.delete_conversation(conv_id)
    return {"ok": True}


@router.delete("")
def delete_all(
    chat_mode: Optional[str] = Query(None),
    exclude_mode: Optional[str] = Query(None),
    kb_id: Optional[str] = Query(None),
):
    cs.delete_all_conversations(chat_mode=chat_mode, kb_id=kb_id, exclude_mode=exclude_mode)
    return {"ok": True}
