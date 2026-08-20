import json
import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from app.services.model_manager import (
    list_local_models,
    list_gguf_files_from_repo,
    list_all_files_from_repo,
    download_model,
    delete_model,
)

router = APIRouter(prefix="/models", tags=["models"])


class DownloadRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    repo_id: str
    filename: str
    model_type: str = "chat"


class DeleteRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    filename: str
    model_type: str = "chat"


@router.get("/local")
def get_local_models(model_type: str = "chat"):
    return {"models": list_local_models(model_type)}


@router.get("/huggingface/files")
def get_hf_files(repo_id: str, model_type: str = "chat"):
    try:
        if model_type == "chat":
            files = list_gguf_files_from_repo(repo_id)
        else:
            files = list_all_files_from_repo(repo_id)
        return {"repo_id": repo_id, "files": files}
    except Exception as e:
        msg = str(e)
        if "404" in msg or "not found" in msg.lower():
            msg = f"Repo '{repo_id}' tidak ditemukan di HuggingFace. Periksa kembali repo ID."
        elif "401" in msg or "403" in msg or "unauthorized" in msg.lower():
            msg = f"Akses ke repo '{repo_id}' ditolak. Repo mungkin bersifat private."
        return {"error": msg, "files": []}


@router.post("/download/stream")
async def download_model_stream(request: DownloadRequest):
    async def event_stream():
        async for event in download_model(
            request.repo_id,
            request.filename,
            request.model_type,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("")
def remove_model(request: DeleteRequest):
    success = delete_model(request.filename, request.model_type)
    if not success:
        return {"error": "Model not found"}
    return {"deleted": request.filename}


# ── Local dependency check ────────────────────────────────────────────────────

@router.get("/local/deps")
def check_local_deps():
    """Return whether llama-cpp-python and sentence-transformers are importable."""
    llama_ok = False
    st_ok = False
    try:
        import llama_cpp  # noqa: F401
        llama_ok = True
    except ImportError:
        pass
    try:
        import sentence_transformers  # noqa: F401
        st_ok = True
    except ImportError:
        pass
    return {"llama_cpp": llama_ok, "sentence_transformers": st_ok}


# ── Ollama ────────────────────────────────────────────────────────────────────

@router.get("/ollama/tags")
async def get_ollama_models(endpoint: str = Query(default="http://localhost:11434")):
    """Proxy to Ollama /api/tags — returns installed models."""
    base = endpoint.rstrip("/").removesuffix("/v1")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/api/tags")
            r.raise_for_status()
            data = r.json()
            models = [
                {
                    "name": m["name"],
                    "size_mb": round(m.get("size", 0) / 1_048_576),
                    "family": m.get("details", {}).get("family", ""),
                    "parameter_size": m.get("details", {}).get("parameter_size", ""),
                }
                for m in data.get("models", [])
            ]
            return {"models": models, "connected": True}
    except Exception as e:
        return {"models": [], "connected": False, "error": str(e)}


@router.post("/ollama/pull/stream")
async def pull_ollama_model(body: dict):
    """Stream progress of `ollama pull <model>`."""
    model_name = body.get("model", "")
    endpoint = body.get("endpoint", "http://localhost:11434")
    base = endpoint.rstrip("/").removesuffix("/v1")

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                async with client.stream(
                    "POST", f"{base}/api/pull",
                    json={"name": model_name, "stream": True},
                ) as r:
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            status = data.get("status", "")
                            total = data.get("total", 0)
                            completed = data.get("completed", 0)
                            progress = round(completed / total * 100) if total else 0
                            yield f"data: {json.dumps({'status': status, 'progress': progress, 'total_mb': round(total/1_048_576) if total else 0, 'downloaded_mb': round(completed/1_048_576) if completed else 0})}\n\n"
                            if status == "success":
                                yield f"data: {json.dumps({'status': 'done', 'progress': 100})}\n\n"
                                return
                        except Exception:
                            continue
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/ollama/{model_name:path}")
async def delete_ollama_model(model_name: str, endpoint: str = Query(default="http://localhost:11434")):
    """Delete an Ollama model via `DELETE /api/delete`."""
    base = endpoint.rstrip("/").removesuffix("/v1")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.delete(f"{base}/api/delete", json={"name": model_name})
            r.raise_for_status()
            return {"deleted": model_name}
    except Exception as e:
        return {"error": str(e)}
