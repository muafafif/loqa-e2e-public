import json
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from app.models.note import FolderCreate, FolderUpdate, NoteCreate, NoteUpdate, NoteIndexRequest, NoteAiRequest
from app.services import note_service as ns
from app.services.knowledge_service import add_documents, get_or_create_collection, query_knowledge_base
from app.services.document_store import model_slug
from app.services.settings_service import load_settings
from app.services.llm_service import llm_service

router = APIRouter(prefix="/notes", tags=["notes"])

# Catatan di bawah threshold dikirim langsung; di atas → auto-index + RAG
NOTE_AI_THRESHOLD = 6000        # karakter
NOTES_KB_ID = "__notes_index__" # collection khusus catatan, terpisah dari KB dokumen
NOTE_RAG_RESULTS = 4            # chunk yang di-retrieve untuk catatan panjang


# ─── Folders ─────────────────────────────────────────────────────────────────

@router.get("/folders")
def list_folders():
    return ns.list_folders()


@router.post("/folders", status_code=201)
def create_folder(body: FolderCreate):
    return ns.create_folder(body.model_dump())


@router.patch("/folders/{folder_id}")
def update_folder(folder_id: int, body: FolderUpdate):
    result = ns.update_folder(folder_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404, "Folder not found")
    return result


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: int):
    ns.delete_folder(folder_id)


# ─── Notes ───────────────────────────────────────────────────────────────────

@router.get("")
def list_notes(folder_id: Optional[int] = Query(None)):
    return ns.list_notes(folder_id)


@router.get("/search")
def search_notes(q: str = Query(..., min_length=1), limit: int = Query(30)):
    return ns.search_notes(q, limit)


@router.get("/graph")
def get_graph():
    return ns.get_graph()


@router.post("", status_code=201)
def create_note(body: NoteCreate):
    return ns.create_note(body.model_dump())


@router.get("/{note_id}")
def get_note(note_id: int):
    note = ns.get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    return note


@router.patch("/{note_id}")
def update_note(note_id: int, body: NoteUpdate):
    result = ns.update_note(note_id, body.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404, "Note not found")
    # Jika catatan sudah terindex dan konten berubah, update chunk di Chroma
    if result.get("indexed") and "content" in body.model_dump(exclude_none=True):
        _upsert_note_to_chroma(result)
    return result


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int):
    note = ns.get_note(note_id)
    if note and note.get("indexed"):
        _remove_note_from_chroma(note_id)
    ns.delete_note(note_id)


@router.get("/{note_id}/backlinks")
def get_backlinks(note_id: int):
    return ns.get_backlinks(note_id)


# ─── KB Index ────────────────────────────────────────────────────────────────

@router.post("/{note_id}/index", status_code=200)
def index_note(note_id: int, body: NoteIndexRequest):
    note = ns.get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    app_settings = load_settings()
    slug = model_slug(app_settings.embed.model_name)
    text = f"{note['title']}\n\n{note['content']}".strip()
    if not text:
        raise HTTPException(400, "Note is empty")

    chunk_id = f"note_{note_id}"
    add_documents(
        kb_id=body.kb_id,
        slug=slug,
        chunks=[text],
        metadatas=[{"source": "note", "note_id": str(note_id), "title": note["title"]}],
        ids=[chunk_id],
    )
    ns.set_note_kb(note_id, body.kb_id)
    return {"status": "indexed", "kb_id": body.kb_id}


@router.delete("/{note_id}/index", status_code=200)
def deindex_note(note_id: int):
    note = ns.get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    if not note.get("kb_id"):
        return {"status": "not_indexed"}

    app_settings = load_settings()
    slug = model_slug(app_settings.embed.model_name)
    try:
        col = get_or_create_collection(note["kb_id"], slug)
        col.delete(ids=[f"note_{note_id}"])
    except Exception:
        pass
    ns.set_note_kb(note_id, None)
    return {"status": "deindexed"}


# ─── Chroma helpers untuk AI notes ───────────────────────────────────────────

def _upsert_note_to_chroma(note: dict):
    """Simpan/update catatan panjang ke collection khusus notes."""
    try:
        app_settings = load_settings()
        slug = model_slug(app_settings.embed.model_name)
        text = f"{note['title']}\n\n{note['content']}".strip()
        if not text:
            return
        from app.services.embed_service import embed_service
        col = get_or_create_collection(NOTES_KB_ID, slug)
        chunk_id = f"note_{note['id']}"
        embeddings = embed_service.embed([text], app_settings.embed)
        # upsert: hapus lama lalu tambah baru agar dokumen selalu fresh
        try:
            col.delete(ids=[chunk_id])
        except Exception:
            pass
        col.add(
            documents=[text],
            embeddings=embeddings,
            metadatas=[{"note_id": str(note["id"]), "title": note["title"]}],
            ids=[chunk_id],
        )
        ns.set_note_indexed(note["id"], True)
    except Exception:
        pass  # embed model belum dikonfigurasi — tidak fatal


def _remove_note_from_chroma(note_id: int):
    try:
        app_settings = load_settings()
        slug = model_slug(app_settings.embed.model_name)
        col = get_or_create_collection(NOTES_KB_ID, slug)
        col.delete(ids=[f"note_{note_id}"])
    except Exception:
        pass


def _retrieve_for_note(note: dict, query: str) -> str:
    """Retrieve chunk paling relevan dari catatan panjang yang sudah terindex."""
    try:
        results = query_knowledge_base(
            kb_id=NOTES_KB_ID,
            query=query,
            n_results=NOTE_RAG_RESULTS,
        )
        # Filter hanya chunk milik catatan ini
        own = [r for r in results if r.get("metadata", {}).get("note_id") == str(note["id"])]
        if own:
            return "\n\n---\n\n".join(r["content"] for r in own)
        # Fallback: jika chunk belum ada, kirim 6000 karakter pertama
        return (note["content"] or "")[:NOTE_AI_THRESHOLD]
    except Exception:
        return (note["content"] or "")[:NOTE_AI_THRESHOLD]


# ─── AI ──────────────────────────────────────────────────────────────────────

@router.post("/{note_id}/ai")
async def note_ai(note_id: int, body: NoteAiRequest):
    note = ns.get_note(note_id)
    if not note:
        raise HTTPException(404, "Note not found")

    app_settings = load_settings()
    content = note["content"] or ""
    title = note["title"] or "Untitled"

    # Jika ada seleksi teks → selalu kirim langsung (user sudah pilih bagian relevan)
    if body.selection:
        working_text = body.selection
        used_rag = False
    elif len(content) <= NOTE_AI_THRESHOLD:
        # Catatan pendek → kirim seluruhnya
        working_text = content
        used_rag = False
    else:
        # Catatan panjang
        if body.action == "continue":
            # Untuk continue, cukup ambil 1500 karakter terakhir
            working_text = content[-1500:]
            used_rag = False
        else:
            # summarize / ask → auto-index jika belum, lalu retrieve
            if not note.get("indexed"):
                _upsert_note_to_chroma(note)
            query = body.prompt if body.action == "ask" and body.prompt else title
            working_text = _retrieve_for_note(note, query)
            used_rag = True

    if body.action == "summarize":
        system_prompt = "You are a concise writing assistant. Summarize the given text clearly and completely."
        user_msg = (
            f"Summarize this note titled '{title}':\n\n{working_text}"
            if not used_rag else
            f"Summarize the following excerpts from a note titled '{title}' "
            f"(retrieved from a long note):\n\n{working_text}"
        )
    elif body.action == "continue":
        system_prompt = "You are a writing assistant. Continue the text naturally, matching the author's tone and style."
        user_msg = f"Continue writing this note titled '{title}':\n\n{working_text}"
    else:  # ask
        if not body.prompt:
            raise HTTPException(400, "prompt required for action=ask")
        system_prompt = (
            f"You are a helpful assistant. The user is asking about their note titled '{title}'. "
            "Answer based on the note content provided."
        )
        user_msg = (
            f"Note content:\n{working_text}\n\nQuestion: {body.prompt}"
            if not used_rag else
            f"Relevant excerpts from the note:\n{working_text}\n\nQuestion: {body.prompt}"
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ]

    async def generate():
        # Kirim event status dulu jika pakai RAG (ada latency embed)
        if used_rag:
            yield f"data: {json.dumps({'type': 'status', 'text': 'indexing'})}\n\n"
        try:
            async for token in llm_service.stream_chat(messages, app_settings.chat):
                if isinstance(token, str):
                    yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
