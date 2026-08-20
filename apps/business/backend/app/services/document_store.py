"""
Manages per-KB, per-model document storage.

Layout:
  data/documents/<kb_id>/
    manifest.json                        — all files ever uploaded to this KB
    <model_slug>/
      <filename>.chunks.json             — chunks + metadata for that model
"""

import hashlib
import json
import time
from pathlib import Path
from typing import Optional
from app.core.config import settings


def _kb_dir(kb_id: str) -> Path:
    p = settings.data_dir / "documents" / kb_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _model_dir(kb_id: str, model_slug: str) -> Path:
    p = _kb_dir(kb_id) / model_slug
    p.mkdir(parents=True, exist_ok=True)
    return p


def model_slug(model_name: str) -> str:
    return model_name.replace("/", "--").replace(":", "_")


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


# ── Manifest ──────────────────────────────────────────────────────────────────

def _manifest_path(kb_id: str) -> Path:
    return _kb_dir(kb_id) / "manifest.json"


def read_manifest(kb_id: str) -> dict:
    p = _manifest_path(kb_id)
    if p.exists():
        return json.loads(p.read_text())
    return {"files": {}}


def _write_manifest(kb_id: str, manifest: dict):
    _manifest_path(kb_id).write_text(json.dumps(manifest, indent=2))


def register_file(kb_id: str, filename: str, content_hash: str, size_bytes: int):
    manifest = read_manifest(kb_id)
    manifest["files"][filename] = {
        "hash": content_hash,
        "size_bytes": size_bytes,
        "uploaded_at": time.time(),
    }
    _write_manifest(kb_id, manifest)


# ── Chunks ────────────────────────────────────────────────────────────────────

def _chunks_path(kb_id: str, slug: str, filename: str) -> Path:
    safe = filename.replace("/", "_").replace("\\", "_")
    return _model_dir(kb_id, slug) / f"{safe}.chunks.json"


def save_chunks(kb_id: str, slug: str, filename: str, chunks: list[dict], content_hash: str):
    """
    chunks: list of {"text": str, "index": int, "page": int|None}
    """
    data = {
        "filename": filename,
        "content_hash": content_hash,
        "indexed_at": time.time(),
        "chunks": chunks,
    }
    _chunks_path(kb_id, slug, filename).write_text(json.dumps(data, indent=2, ensure_ascii=False))


def load_chunks(kb_id: str, slug: str, filename: str) -> Optional[dict]:
    p = _chunks_path(kb_id, slug, filename)
    if p.exists():
        return json.loads(p.read_text())
    return None


def list_indexed_files(kb_id: str, slug: str) -> dict[str, str]:
    """Returns {filename: content_hash} for all files indexed under this model."""
    d = _model_dir(kb_id, slug)
    result = {}
    for f in d.glob("*.chunks.json"):
        try:
            data = json.loads(f.read_text())
            result[data["filename"]] = data["content_hash"]
        except Exception:
            pass
    return result


def delete_chunks(kb_id: str, slug: str, filename: str):
    p = _chunks_path(kb_id, slug, filename)
    if p.exists():
        p.unlink()


# ── Consistency check ─────────────────────────────────────────────────────────

def get_consistency_report(kb_id: str) -> dict:
    """
    Returns per-file consistency across all indexed models.
    {
      "consistent": bool,
      "files": {
        "report.pdf": {
          "manifest_hash": "abc123",
          "models": {
            "nomic--embed": {"hash": "abc123", "status": "ok"|"outdated"|"missing"},
            ...
          }
        }
      }
    }
    """
    manifest = read_manifest(kb_id)
    kb_dir = _kb_dir(kb_id)

    # Find all model slugs that have chunks
    slugs = [d.name for d in kb_dir.iterdir() if d.is_dir()]

    report: dict = {"consistent": True, "files": {}}

    all_filenames = set(manifest["files"].keys())
    for slug in slugs:
        for fname in list_indexed_files(kb_id, slug):
            all_filenames.add(fname)

    for fname in sorted(all_filenames):
        manifest_hash = manifest["files"].get(fname, {}).get("hash")
        file_report: dict = {"manifest_hash": manifest_hash, "models": {}}

        for slug in slugs:
            indexed = list_indexed_files(kb_id, slug)
            if fname not in indexed:
                file_report["models"][slug] = {"hash": None, "status": "missing"}
                report["consistent"] = False
            elif indexed[fname] != manifest_hash:
                file_report["models"][slug] = {"hash": indexed[fname], "status": "outdated"}
                report["consistent"] = False
            else:
                file_report["models"][slug] = {"hash": indexed[fname], "status": "ok"}

        report["files"][fname] = file_report

    return report
