import json
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.document_service import ingest_file
from app.services.document_store import (
    register_file, file_hash, model_slug, get_consistency_report, read_manifest,
)
from app.services.knowledge_service import (
    list_knowledge_bases, delete_knowledge_base, get_or_create_collection,
)
from app.services.reindex_service import get_reindex_plan, run_reindex
from app.services.settings_service import load_settings
from app.services.metrics_service import record_kb_stat
from app.services import lock_service as ls
from app.services import kb_lock_service as kl

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class LockKbRequest(BaseModel):
    locked: bool


@router.get("")
def get_knowledge_bases():
    kbs = list_knowledge_bases()
    result = []
    for kb_id in kbs:
        report = get_consistency_report(kb_id)
        locked = kl.is_kb_locked(kb_id)
        result.append({
            "kb_id": kb_id,
            "consistent": report["consistent"],
            "file_count": len(report["files"]),
            "locked": locked,
        })
    return {"knowledge_bases": result}


@router.patch("/{kb_id}/lock")
def lock_kb(kb_id: str, body: LockKbRequest):
    key = ls.get_key()
    if key is None:
        raise HTTPException(403, "Masukkan PIN terlebih dahulu untuk mengunci/membuka knowledge base")
    ls.touch()
    try:
        kl.set_kb_locked(kb_id, body.locked, key=key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.get("/{kb_id}/consistency")
def kb_consistency(kb_id: str):
    return get_consistency_report(kb_id)


@router.post("/{kb_id}/upload")
async def upload_document(kb_id: str, file: UploadFile = File(...)):
    allowed = {".pdf", ".docx", ".doc", ".txt", ".md"}
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix}")

    # Block upload to locked KB if session key not available
    if kl.is_kb_locked(kb_id) and ls.get_key() is None:
        raise HTTPException(403, "Knowledge base terkunci — masukkan PIN terlebih dahulu")

    content = await file.read()
    content_hash = file_hash(content)
    size_bytes = len(content)

    app_settings = load_settings()
    slug = model_slug(app_settings.embed.model_name)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        chunks = ingest_file(
            tmp_path, kb_id, file.filename,
            content_hash, app_settings.embed.model_name,
            encrypt_key=ls.get_key() if kl.is_kb_locked(kb_id) else None,
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    register_file(kb_id, file.filename, content_hash, size_bytes)
    if ls.get_key():
        ls.touch()

    col = get_or_create_collection(kb_id, slug)
    record_kb_stat(kb_id=kb_id, chunks=col.count(), docs=1)

    return {
        "filename": file.filename,
        "chunks_indexed": chunks,
        "kb_id": kb_id,
        "content_hash": content_hash,
        "embed_model": app_settings.embed.model_name,
    }


@router.delete("/{kb_id}")
def remove_knowledge_base(kb_id: str):
    delete_knowledge_base(kb_id)
    return {"deleted": kb_id}


# ── Reindex endpoints ──────────────────────────────────────────────────────────

@router.get("/reindex/plan")
def reindex_plan(model_name: str):
    return get_reindex_plan(model_name)


@router.post("/reindex/run")
async def reindex_run(model_name: str):
    async def event_stream():
        async for event in run_reindex(model_name):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
