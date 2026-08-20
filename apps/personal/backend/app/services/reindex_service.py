"""
Auto-reindex pipeline when embed model changes.

Tiers (configurable in settings):
  tier1: < 50 MB  → silent background reindex, small toast notification
  tier2: 50–200 MB → reindex with progress bar shown
  tier3: > 200 MB  → hard warning, user must confirm before reindex starts
"""

import asyncio
from typing import AsyncGenerator
from app.services.document_store import (
    read_manifest, list_indexed_files, model_slug, get_consistency_report,
)
from app.services.document_service import reindex_file_for_model
from app.services.knowledge_service import list_knowledge_bases, list_kb_models
from app.services.settings_service import load_settings

TIER1_MB = 50
TIER2_MB = 200


def _total_kb_size_bytes(kb_id: str) -> int:
    manifest = read_manifest(kb_id)
    return sum(f.get("size_bytes", 0) for f in manifest["files"].values())


def get_reindex_plan(new_model_name: str) -> dict:
    """
    Returns what needs to be reindexed when switching to new_model_name.
    Skips KBs that already have collections for this model with matching hashes.
    """
    new_slug = model_slug(new_model_name)
    plan = []
    total_bytes = 0

    for kb_id in list_knowledge_bases():
        manifest = read_manifest(kb_id)
        if not manifest["files"]:
            continue

        # Find a source slug to copy chunks from (prefer any existing)
        existing_slugs = list_kb_models(kb_id)
        if not existing_slugs:
            continue
        source_slug = existing_slugs[0]

        # Find files that need reindexing for new model
        already_indexed = list_indexed_files(kb_id, new_slug)
        files_to_reindex = []
        for fname, finfo in manifest["files"].items():
            current_hash = finfo["hash"]
            if already_indexed.get(fname) == current_hash:
                continue  # already up to date for this model
            files_to_reindex.append({
                "filename": fname,
                "size_bytes": finfo.get("size_bytes", 0),
                "content_hash": current_hash,
                "source_slug": source_slug,
            })
            total_bytes += finfo.get("size_bytes", 0)

        if files_to_reindex:
            plan.append({
                "kb_id": kb_id,
                "files": files_to_reindex,
                "kb_size_bytes": _total_kb_size_bytes(kb_id),
            })

    total_mb = total_bytes / 1024 / 1024
    if total_mb < TIER1_MB:
        tier = 1
    elif total_mb < TIER2_MB:
        tier = 2
    else:
        tier = 3

    return {
        "new_model": new_model_name,
        "new_slug": new_slug,
        "plan": plan,
        "total_bytes": total_bytes,
        "total_mb": round(total_mb, 1),
        "tier": tier,
        "requires_confirmation": tier == 3,
        "kb_count": len(plan),
        "file_count": sum(len(p["files"]) for p in plan),
    }


async def run_reindex(new_model_name: str) -> AsyncGenerator[dict, None]:
    """
    Runs the reindex pipeline and yields progress events.
    {type: "progress", kb_id, filename, done, total, percent}
    {type: "done", kb_id, file_count}
    {type: "error", kb_id, filename, error}
    """
    new_slug = model_slug(new_model_name)
    plan_data = get_reindex_plan(new_model_name)
    total_files = plan_data["file_count"]
    done_count = 0

    for kb_plan in plan_data["plan"]:
        kb_id = kb_plan["kb_id"]
        for file_info in kb_plan["files"]:
            filename = file_info["filename"]
            try:
                # Run CPU-bound reindex in thread pool
                count = await asyncio.to_thread(
                    reindex_file_for_model,
                    kb_id,
                    filename,
                    file_info["content_hash"],
                    file_info["source_slug"],
                    new_model_name,
                )
                done_count += 1
                yield {
                    "type": "progress",
                    "kb_id": kb_id,
                    "filename": filename,
                    "chunks": count,
                    "done": done_count,
                    "total": total_files,
                    "percent": round(done_count / total_files * 100) if total_files else 100,
                }
            except Exception as e:
                yield {
                    "type": "error",
                    "kb_id": kb_id,
                    "filename": filename,
                    "error": str(e),
                }

    yield {"type": "done", "total_files": done_count}
