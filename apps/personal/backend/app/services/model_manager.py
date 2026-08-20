import asyncio
import httpx
from pathlib import Path
from typing import AsyncGenerator, List
from huggingface_hub import list_repo_files, hf_hub_url
from app.core.config import settings


def _model_dir(model_type: str) -> Path:
    if model_type == "chat":
        return settings.chat_models_dir
    if model_type == "reranker":
        return settings.reranker_models_dir
    return settings.embed_models_dir


def list_local_models(model_type: str = "chat") -> List[dict]:
    base = _model_dir(model_type)

    if model_type == "chat":
        models = []
        for f in base.iterdir():
            if f.suffix == ".gguf":
                perm_meta = base / (f.name + ".meta")
                repo_id_stored = perm_meta.read_text().strip() if perm_meta.exists() else ""
                models.append({
                    "name": f.name,
                    "size_mb": round(f.stat().st_size / 1024 / 1024, 1),
                    "type": "chat",
                    "path": str(f),
                    "repo_id": repo_id_stored,
                })
            elif f.name.endswith(".gguf.part"):
                meta = base / (f.name + ".meta")
                repo_id_stored = meta.read_text().strip() if meta.exists() else ""
                models.append({
                    "name": f.name[:-5],  # strip .part → .gguf name
                    "size_mb": round(f.stat().st_size / 1024 / 1024, 1),
                    "type": "chat",
                    "path": str(f),
                    "partial": True,
                    "repo_id": repo_id_stored,
                })
        return models

    # embed and reranker: sentence-transformers directories (contain config.json)
    # Supports two layouts:
    #   flat:  <slug>/config.json          (local_dir_use_symlinks=False)
    #   cache: <slug>/snapshots/<hash>/config.json  (old HF cache layout)
    models = []
    for entry in base.iterdir():
        if not entry.is_dir():
            continue
        if (entry / "config.json").exists():
            config_root = entry
        else:
            snapshots = entry / "snapshots"
            config_root = None
            if snapshots.is_dir():
                for snap in snapshots.iterdir():
                    if snap.is_dir() and (snap / "config.json").exists():
                        config_root = snap
                        break
        if config_root is None:
            continue
        size_mb = round(
            sum(f.stat().st_size for f in entry.rglob("*") if f.is_file()) / 1024 / 1024,
            1,
        )
        # slug may be "org--model" or "models--org--model" (HF cache prefix)
        slug = entry.name
        if slug.startswith("models--"):
            slug = slug[len("models--"):]
        model_id = slug.replace("--", "/", 1)
        models.append({
            "name": model_id,
            "size_mb": size_mb,
            "type": model_type,
            "path": str(entry),
        })
    return models


def list_gguf_files_from_repo(repo_id: str) -> List[dict]:
    files = list(list_repo_files(repo_id))
    return [
        {"filename": f, "url": hf_hub_url(repo_id, f)}
        for f in files
        if f.endswith(".gguf")
    ]


def list_all_files_from_repo(repo_id: str) -> List[dict]:
    """List all meaningful files from a HF repo (for embed/reranker — no .gguf filter)."""
    _skip_exts = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".md", ".txt", ".gitignore", ".gitattributes"}
    _skip_prefixes = ("onnx/", "openvino/")
    files = list(list_repo_files(repo_id))
    return [
        {"filename": f, "url": hf_hub_url(repo_id, f)}
        for f in files
        if not any(f.endswith(ext) for ext in _skip_exts)
        and not any(f.startswith(p) for p in _skip_prefixes)
    ]


async def download_model(
    repo_id: str,
    filename: str,       # for chat: .gguf filename; for embed/reranker: ignored (snapshot)
    model_type: str = "chat",
) -> AsyncGenerator[dict, None]:
    """
    Chat models: download a single .gguf file with progress.
    Embed/reranker models: use snapshot_download to fetch the entire repo directory.
    """
    if model_type in ("embed", "reranker"):
        async for event in _snapshot_download(repo_id, model_type):
            yield event
        return

    # ── Chat: single file download ──
    # Uses a .part temp file; only renamed to .gguf on completion.
    # A .part.meta sidecar stores the repo_id so downloads can be resumed later.
    # If a .part file already exists, resume from that byte offset.
    dest_dir = _model_dir(model_type)
    dest_path = dest_dir / filename
    part_path = dest_dir / (filename + ".part")
    meta_path = dest_dir / (filename + ".part.meta")
    url = hf_hub_url(repo_id, filename)

    resumed = part_path.exists()
    resume_from = part_path.stat().st_size if resumed else 0

    # Always write/overwrite meta so repo_id is always current
    meta_path.write_text(repo_id)

    try:
        headers = {}
        if resumed and resume_from > 0:
            headers["Range"] = f"bytes={resume_from}-"

        async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
            async with client.stream("GET", url, headers=headers) as response:
                if response.status_code not in (200, 206):
                    response.raise_for_status()

                total_remaining = int(response.headers.get("content-length", 0))
                total = resume_from + total_remaining
                downloaded = resume_from

                mode = "ab" if resumed else "wb"
                with open(part_path, mode) as f:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)
                        progress = round(downloaded / total * 100, 1) if total else 0
                        yield {
                            "progress": progress,
                            "status": "downloading",
                            "message": f"{'Resuming' if resumed else 'Downloading'} {filename}: {progress}%",
                            "downloaded_mb": round(downloaded / 1024 / 1024, 1),
                            "total_mb": round(total / 1024 / 1024, 1),
                            "resumed": resumed,
                        }

        part_path.rename(dest_path)
        # Keep repo_id in a permanent .meta sidecar (not .part.meta)
        perm_meta = dest_dir / (filename + ".meta")
        if meta_path.exists():
            meta_path.rename(perm_meta)
        else:
            perm_meta.write_text(repo_id)
        yield {
            "progress": 100,
            "status": "done",
            "message": f"Model {filename} downloaded successfully",
            "filename": filename,
        }

    except Exception as e:
        # Leave .part file intact so download can be resumed later
        yield {"progress": 0, "status": "error", "message": str(e)}


_SNAPSHOT_IGNORE = {
    ".gitattributes", "README.md",
}
_SNAPSHOT_IGNORE_EXTS = {".msgpack", ".ot", ".h5"}
_SNAPSHOT_IGNORE_PREFIXES = ("flax_model", "tf_model", "rust_model", "onnx/", "openvino/")


def _should_skip(filename: str) -> bool:
    if filename in _SNAPSHOT_IGNORE:
        return True
    if any(filename.endswith(ext) for ext in _SNAPSHOT_IGNORE_EXTS):
        return True
    if any(filename.startswith(p) for p in _SNAPSHOT_IGNORE_PREFIXES):
        return True
    return False


async def _snapshot_download(repo_id: str, model_type: str) -> AsyncGenerator[dict, None]:
    """
    Download an entire HuggingFace repo file-by-file with per-file progress.
    Yields: resolving → file_start → file_progress → file_done (per file) → done
    """
    from huggingface_hub import list_repo_files, hf_hub_url

    dest_dir = _model_dir(model_type)
    slug = repo_id.replace("/", "--", 1)
    local_dir = dest_dir / slug
    local_dir.mkdir(parents=True, exist_ok=True)

    yield {"progress": 0, "status": "resolving", "message": f"Resolving {repo_id}..."}

    try:
        loop = asyncio.get_event_loop()
        all_files: list[str] = await loop.run_in_executor(
            None, lambda: list(list_repo_files(repo_id))
        )
    except Exception as e:
        msg = str(e)
        if "404" in msg or "not found" in msg.lower():
            msg = f"Repo '{repo_id}' tidak ditemukan di HuggingFace. Periksa kembali repo ID."
        elif "401" in msg or "403" in msg or "unauthorized" in msg.lower():
            msg = f"Akses ke repo '{repo_id}' ditolak. Repo mungkin bersifat private."
        yield {"progress": 0, "status": "error", "message": msg}
        return

    files = [f for f in all_files if not _should_skip(f)]
    total_files = len(files)

    if total_files == 0:
        yield {"progress": 100, "status": "done", "message": "Nothing to download", "filename": slug}
        return

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
            for i, filename in enumerate(files):
                dest_path = local_dir / filename
                dest_path.parent.mkdir(parents=True, exist_ok=True)

                # Skip already-downloaded files
                url = hf_hub_url(repo_id, filename)
                yield {
                    "progress": round(i / total_files * 100),
                    "status": "downloading",
                    "message": f"Downloading {filename} ({i + 1}/{total_files})",
                    "current_file": filename,
                    "file_index": i + 1,
                    "file_total": total_files,
                    "file_progress": 0,
                }

                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    total_bytes = int(response.headers.get("content-length", 0))
                    downloaded = 0
                    with open(dest_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=512 * 1024):
                            f.write(chunk)
                            downloaded += len(chunk)
                            file_pct = round(downloaded / total_bytes * 100) if total_bytes else 0
                            overall_pct = round((i + file_pct / 100) / total_files * 100)
                            yield {
                                "progress": overall_pct,
                                "status": "downloading",
                                "message": f"Downloading {filename} ({i + 1}/{total_files})",
                                "current_file": filename,
                                "file_index": i + 1,
                                "file_total": total_files,
                                "file_progress": file_pct,
                                "downloaded_mb": round(downloaded / 1024 / 1024, 1),
                                "total_mb": round(total_bytes / 1024 / 1024, 1),
                            }

        yield {
            "progress": 100,
            "status": "done",
            "message": f"{repo_id} installed successfully",
            "filename": slug,
        }

    except Exception as e:
        yield {"progress": 0, "status": "error", "message": str(e)}


def delete_model(filename: str, model_type: str = "chat") -> bool:
    import shutil
    base = _model_dir(model_type)

    if model_type in ("embed", "reranker"):
        slug = filename.replace("/", "--", 1)
        hf_cache_slug = "models--" + slug
        candidates = [base / filename, base / slug, base / hf_cache_slug]
    else:
        # Also check for .part and .part.meta files (incomplete download)
        candidates = [base / filename, base / (filename + ".part")]

    deleted = False
    for path in candidates:
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            deleted = True
    # Always clean up sidecar meta files if present (chat only)
    if model_type == "chat":
        for suffix in (".part.meta", ".meta"):
            meta = base / (filename + suffix)
            if meta.exists():
                meta.unlink()
    return deleted
