from typing import List
from app.models.settings import EmbedModelConfig, EmbedProvider
from app.core.config import settings


class EmbedService:
    def __init__(self):
        self._local_model = None
        self._loaded_model_name = None

    def _load_local_model(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        if self._loaded_model_name == model_name and self._local_model is not None:
            return

        local_path = settings.embed_models_dir / model_name.replace("/", "--")
        if not local_path.exists():
            raise FileNotFoundError(
                f"Embed model '{model_name}' is not installed. "
                "Download it first via Settings → Model Manager."
            )

        self._local_model = SentenceTransformer(str(local_path), trust_remote_code=True)
        self._loaded_model_name = model_name

    def embed(self, texts: List[str], config: EmbedModelConfig) -> List[List[float]]:
        if config.provider == EmbedProvider.LOCAL:
            return self._embed_local(texts, config)
        elif config.provider == EmbedProvider.OLLAMA:
            return self._embed_ollama(texts, config)
        elif config.provider == EmbedProvider.OPENAI:
            return self._embed_openai(texts, config)
        elif config.provider == EmbedProvider.GEMINI:
            return self._embed_gemini(texts, config)

    def _embed_local(self, texts: List[str], config: EmbedModelConfig) -> List[List[float]]:
        self._load_local_model(config.model_name)
        embeddings = self._local_model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()

    def _embed_ollama(self, texts: List[str], config: EmbedModelConfig) -> List[List[float]]:
        from openai import OpenAI

        base_url = (config.endpoint or "http://localhost:11434/v1").rstrip("/")
        client = OpenAI(api_key="ollama", base_url=base_url)
        response = client.embeddings.create(
            model=config.model_name or "nomic-embed-text",
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _embed_openai(self, texts: List[str], config: EmbedModelConfig) -> List[List[float]]:
        from openai import OpenAI

        client = OpenAI(api_key=config.api_key)
        response = client.embeddings.create(
            model=config.model_name or "text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _embed_gemini(self, texts: List[str], config: EmbedModelConfig) -> List[List[float]]:
        import google.generativeai as genai

        genai.configure(api_key=config.api_key)
        result = genai.embed_content(
            model=config.model_name or "models/text-embedding-004",
            content=texts,
        )
        return result["embedding"] if isinstance(texts, str) else [r for r in result["embedding"]]


embed_service = EmbedService()
