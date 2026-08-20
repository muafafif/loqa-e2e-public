"""
Manages lock state and encrypted storage for Knowledge Bases.

Locked KB:
- manifest.json gains "locked": true
- chunk text content is AES-256-GCM encrypted at rest
- ChromaDB vectors remain plaintext (numbers carry no meaning without the text)
- Querying a locked KB requires session key from lock_service
"""
import json
from pathlib import Path
from typing import Optional
from app.core.config import settings
from app.services import lock_service as ls
from app.services.crypto_service import encrypt, decrypt
from app.services.document_store import _kb_dir, _manifest_path, read_manifest, _write_manifest


def is_kb_locked(kb_id: str) -> bool:
    manifest = read_manifest(kb_id)
    return bool(manifest.get("locked"))


def set_kb_locked(kb_id: str, locked: bool, key: Optional[bytes] = None):
    """Toggle lock on a KB. Re-encrypts or decrypts all chunk files."""
    if key is None:
        raise ValueError("Key required")

    kb_dir = _kb_dir(kb_id)
    currently_locked = is_kb_locked(kb_id)
    if currently_locked == locked:
        return

    # Re-encrypt or decrypt all .chunks.json files
    for chunks_file in kb_dir.rglob("*.chunks.json"):
        try:
            data = json.loads(chunks_file.read_text())
            for chunk in data.get("chunks", []):
                if locked:
                    chunk["text"] = encrypt(chunk["text"], key)
                else:
                    chunk["text"] = decrypt(chunk["text"], key)
            chunks_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        except Exception:
            pass

    manifest = read_manifest(kb_id)
    manifest["locked"] = locked
    _write_manifest(kb_id, manifest)


def encrypt_chunks(chunks: list[dict], key: bytes) -> list[dict]:
    """Encrypt text field of each chunk. Returns new list."""
    return [{**c, "text": encrypt(c["text"], key)} for c in chunks]


def decrypt_chunks(chunks: list[dict], key: bytes) -> list[dict]:
    """Decrypt text field of each chunk. Returns new list."""
    result = []
    for c in chunks:
        try:
            result.append({**c, "text": decrypt(c["text"], key)})
        except Exception:
            result.append({**c, "text": "[🔒 Terkunci]"})
    return result
