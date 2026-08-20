import re
import uuid
from pathlib import Path
from typing import List
from app.services.knowledge_service import add_documents
from app.services.document_store import save_chunks, model_slug


def chunk_by_words(text: str, chunk_size: int = 500, overlap: int = 50, min_size: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        if len(chunk.split()) >= min_size:
            chunks.append(chunk)
        i += max(1, chunk_size - overlap)
    return chunks


def chunk_by_sentences(text: str, chunk_size: int = 1500, overlap: int = 200, min_size: int = 100) -> List[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks, current, current_len = [], [], 0
    for sent in sentences:
        slen = len(sent)
        if current_len + slen > chunk_size and current:
            joined = " ".join(current)
            if len(joined) >= min_size:
                chunks.append(joined)
            # keep overlap: drop sentences from front until under overlap
            while current and current_len > overlap:
                current_len -= len(current[0])
                current.pop(0)
        current.append(sent)
        current_len += slen
    if current:
        joined = " ".join(current)
        if len(joined) >= min_size:
            chunks.append(joined)
    return chunks


def chunk_by_paragraphs(text: str, chunk_size: int = 2000, overlap: int = 0, min_size: int = 100) -> List[str]:
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    chunks, current, current_len = [], [], 0
    for para in paragraphs:
        plen = len(para)
        if current_len + plen > chunk_size and current:
            joined = "\n\n".join(current)
            if len(joined) >= min_size:
                chunks.append(joined)
            current, current_len = [], 0
        current.append(para)
        current_len += plen
    if current:
        joined = "\n\n".join(current)
        if len(joined) >= min_size:
            chunks.append(joined)
    return chunks


def chunk_text(text: str, strategy: str = "word", chunk_size: int = 500,
               overlap: int = 50, min_chunk_size: int = 50) -> List[str]:
    if strategy == "sentence":
        return chunk_by_sentences(text, chunk_size, overlap, min_chunk_size)
    if strategy == "paragraph":
        return chunk_by_paragraphs(text, chunk_size, overlap, min_chunk_size)
    return chunk_by_words(text, chunk_size, overlap, min_chunk_size)


def parse_pdf(file_path: Path) -> List[dict]:
    from pypdf import PdfReader
    reader = PdfReader(str(file_path))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"text": text, "page": i + 1})
    return pages


def parse_docx(file_path: Path) -> List[dict]:
    from docx import Document
    doc = Document(str(file_path))
    text = "\n".join(p.text for p in doc.paragraphs)
    return [{"text": text, "page": None}]


def parse_txt(file_path: Path) -> List[dict]:
    return [{"text": file_path.read_text(encoding="utf-8", errors="ignore"), "page": None}]


def ingest_file(
    file_path: Path,
    kb_id: str,
    filename: str,
    content_hash: str,
    embed_model_name: str,
    encrypt_key: bytes | None = None,
) -> int:
    from app.services.settings_service import load_settings
    app_settings = load_settings()
    cfg = app_settings.chunking

    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        pages = parse_pdf(file_path)
    elif suffix in (".docx", ".doc"):
        pages = parse_docx(file_path)
    else:
        pages = parse_txt(file_path)

    slug = model_slug(embed_model_name)

    all_chunks: List[dict] = []
    for page_data in pages:
        for text_chunk in chunk_text(
            page_data["text"],
            strategy=cfg.strategy,
            chunk_size=cfg.chunk_size,
            overlap=cfg.overlap,
            min_chunk_size=cfg.min_chunk_size,
        ):
            all_chunks.append({
                "text": text_chunk,
                "page": page_data["page"],
                "index": len(all_chunks),
            })

    if not all_chunks:
        return 0

    # Save plaintext chunks to disk (for re-index) — encrypt if key given
    chunks_to_save = all_chunks
    if encrypt_key:
        from app.services.crypto_service import encrypt as aes_encrypt
        chunks_to_save = [{**c, "text": aes_encrypt(c["text"], encrypt_key)} for c in all_chunks]
    save_chunks(kb_id, slug, filename, chunks_to_save, content_hash)

    # Always embed plaintext
    texts = [c["text"] for c in all_chunks]
    ids = [str(uuid.uuid4()) for _ in all_chunks]
    metadatas = [
        {
            "source": filename,
            "chunk_index": c["index"],
            "page": c["page"] if c["page"] is not None else -1,
            "content_hash": content_hash,
        }
        for c in all_chunks
    ]
    # Store encrypted text in ChromaDB when KB is locked
    stored_texts = texts
    if encrypt_key:
        from app.services.crypto_service import encrypt as aes_encrypt
        stored_texts = [aes_encrypt(t, encrypt_key) for t in texts]
    add_documents(kb_id, slug, stored_texts, metadatas, ids)
    return len(all_chunks)


def reindex_file_for_model(
    kb_id: str,
    filename: str,
    content_hash: str,
    source_slug: str,
    target_embed_model: str,
) -> int:
    from app.services.document_store import load_chunks
    target_slug = model_slug(target_embed_model)

    stored = load_chunks(kb_id, source_slug, filename)
    if not stored:
        return 0

    all_chunks = stored["chunks"]
    texts = [c["text"] for c in all_chunks]
    ids = [str(uuid.uuid4()) for _ in all_chunks]
    metadatas = [
        {
            "source": filename,
            "chunk_index": c["index"],
            "page": c.get("page") if c.get("page") is not None else -1,
            "content_hash": content_hash,
        }
        for c in all_chunks
    ]

    save_chunks(kb_id, target_slug, filename, all_chunks, content_hash)
    add_documents(kb_id, target_slug, texts, metadatas, ids)
    return len(all_chunks)
