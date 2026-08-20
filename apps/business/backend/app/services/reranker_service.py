from typing import List, Optional


class RerankerService:
    def __init__(self):
        self._model = None
        self._loaded_model_name: Optional[str] = None

    def _load_local(self, model_name: str):
        from sentence_transformers import CrossEncoder
        from app.core.config import settings

        if self._loaded_model_name == model_name and self._model is not None:
            return

        local_path = settings.reranker_models_dir / model_name.replace("/", "--")
        load_path = str(local_path) if local_path.exists() else model_name
        self._model = CrossEncoder(load_path, max_length=512, trust_remote_code=True)
        self._loaded_model_name = model_name

    def rerank(
        self,
        query: str,
        docs: List[dict],
        model_name: str,
        top_k: int = 5,
        provider: str = "local",
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> List[dict]:
        if not docs:
            return docs
        if provider == "cohere":
            return self._rerank_cohere(query, docs, model_name, top_k, api_key)
        if provider == "ollama":
            return self._rerank_ollama(query, docs, model_name, top_k, endpoint)
        return self._rerank_local(query, docs, model_name, top_k)

    def _rerank_local(self, query: str, docs: List[dict], model_name: str, top_k: int) -> List[dict]:
        self._load_local(model_name)
        pairs = [(query, d["content"]) for d in docs]
        scores = self._model.predict(pairs)
        ranked = sorted(zip(docs, scores), key=lambda x: float(x[1]), reverse=True)
        return [{**doc, "rerank_score": round(float(score), 4)} for doc, score in ranked[:top_k]]

    def _rerank_ollama(
        self,
        query: str,
        docs: List[dict],
        model_name: str,
        top_k: int,
        endpoint: Optional[str],
    ) -> List[dict]:
        import httpx

        base_url = (endpoint or "http://localhost:11434").rstrip("/").removesuffix("/v1")
        texts = [d["content"] for d in docs]
        response = httpx.post(
            f"{base_url}/api/embed",
            json={"model": model_name, "input": [query] + texts},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        embeddings = data.get("embeddings", [])
        if len(embeddings) < 2:
            return docs[:top_k]
        import numpy as np
        q_vec = np.array(embeddings[0])
        doc_vecs = np.array(embeddings[1:])
        norms = np.linalg.norm(doc_vecs, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        scores = (doc_vecs / norms) @ (q_vec / (np.linalg.norm(q_vec) or 1))
        ranked = sorted(zip(docs, scores.tolist()), key=lambda x: x[1], reverse=True)
        return [{**doc, "rerank_score": round(float(score), 4)} for doc, score in ranked[:top_k]]

    def _rerank_cohere(
        self,
        query: str,
        docs: List[dict],
        model_name: str,
        top_k: int,
        api_key: Optional[str],
    ) -> List[dict]:
        import cohere
        co = cohere.Client(api_key=api_key)
        texts = [d["content"] for d in docs]
        response = co.rerank(
            query=query,
            documents=texts,
            model=model_name,
            top_n=top_k,
        )
        results = []
        for item in response.results:
            doc = docs[item.index]
            results.append({**doc, "rerank_score": round(item.relevance_score, 4)})
        return results

    def unload(self):
        self._model = None
        self._loaded_model_name = None


reranker_service = RerankerService()
