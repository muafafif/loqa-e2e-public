import chromadb
from typing import List
from app.core.config import settings
from app.services.embed_service import embed_service
from app.services.settings_service import load_settings
from app.services.document_store import model_slug


def _collection_name(kb_id: str, slug: str) -> str:
    # ChromaDB collection names must be 3-63 chars, alphanumeric + hyphens
    raw = f"{kb_id}__{slug}"
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in raw)
    return safe[:63]


def get_chroma_client():
    return chromadb.PersistentClient(path=str(settings.chromadb_dir))


def get_or_create_collection(kb_id: str, slug: str | None = None):
    if slug is None:
        app_settings = load_settings()
        slug = model_slug(app_settings.embed.model_name)
    client = get_chroma_client()
    return client.get_or_create_collection(name=_collection_name(kb_id, slug))


def add_documents(kb_id: str, slug: str, chunks: List[str], metadatas: List[dict], ids: List[str]):
    app_settings = load_settings()
    embeddings = embed_service.embed(chunks, app_settings.embed)
    col = get_or_create_collection(kb_id, slug)
    col.add(documents=chunks, embeddings=embeddings, metadatas=metadatas, ids=ids)


def query_knowledge_base(kb_id: str, query: str, slug: str | None = None, n_results: int = 20) -> List[dict]:
    from app.services import lock_service as ls
    from app.services import kb_lock_service as kl
    from app.services.crypto_service import decrypt

    app_settings = load_settings()
    if slug is None:
        slug = model_slug(app_settings.embed.model_name)
    embeddings = embed_service.embed([query], app_settings.embed)
    col = get_or_create_collection(kb_id, slug)
    count = col.count()
    if count == 0:
        return []
    results = col.query(
        query_embeddings=embeddings,
        n_results=min(n_results, count),
        include=["documents", "metadatas", "distances"],
    )

    is_locked = kl.is_kb_locked(kb_id)
    key = ls.get_key() if is_locked else None

    output = []
    for i, doc in enumerate(results["documents"][0]):
        content = doc
        if is_locked and key:
            try:
                content = decrypt(doc, key)
            except Exception:
                content = "[🔒 Terkunci]"
        output.append({
            "content": content,
            "metadata": results["metadatas"][0][i],
            "score": 1 - results["distances"][0][i],
        })
    return output


def delete_knowledge_base(kb_id: str):
    client = get_chroma_client()
    # Delete all collections for this KB (all model variants)
    for col in client.list_collections():
        if col.name.startswith(f"{kb_id}__"):
            client.delete_collection(col.name)


def list_knowledge_bases() -> List[str]:
    client = get_chroma_client()
    names = {col.name.split("__")[0] for col in client.list_collections()}
    return sorted(names)


def list_kb_models(kb_id: str) -> List[str]:
    """Return all model slugs that have collections for this KB."""
    client = get_chroma_client()
    prefix = f"{kb_id}__"
    return [col.name[len(prefix):] for col in client.list_collections() if col.name.startswith(prefix)]
