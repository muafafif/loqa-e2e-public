from pydantic import BaseModel, ConfigDict
from typing import Optional
from enum import Enum


class ChatProvider(str, Enum):
    LOCAL = "local"
    OLLAMA = "ollama"
    OPENAI = "openai"
    GEMINI = "gemini"
    DEEPSEEK = "deepseek"
    OPENAI_COMPATIBLE = "openai_compatible"


class EmbedProvider(str, Enum):
    LOCAL = "local"
    OLLAMA = "ollama"
    OPENAI = "openai"
    GEMINI = "gemini"


class ChatModelConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    provider: ChatProvider = ChatProvider.LOCAL
    model_name: str = ""
    endpoint: Optional[str] = "http://localhost:11434/v1"
    api_key: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    supports_tools: bool = True
    system_prompt: str = (
        "You are a helpful assistant that answers questions based on the provided documents. "
        "Always cite your sources."
    )


class EmbedModelConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    provider: EmbedProvider = EmbedProvider.LOCAL
    model_name: str = "nomic-ai/nomic-embed-text-v1"
    api_key: Optional[str] = None
    endpoint: Optional[str] = None


class RerankerProvider(str, Enum):
    LOCAL = "local"
    OLLAMA = "ollama"
    COHERE = "cohere"


class RerankerConfig(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    enabled: bool = False
    provider: RerankerProvider = RerankerProvider.LOCAL
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    top_k: int = 5
    initial_fetch: int = 20


class ReindexThresholds(BaseModel):
    tier1_mb: float = 50.0
    tier2_mb: float = 200.0


class ThemeConfig(BaseModel):
    mode: str = "dark"          # "dark" | "light"
    accent: str = "#0284c7"     # hex color
    locale: str = "en"          # "en" | "id"


class ChunkingConfig(BaseModel):
    strategy: str = "word"           # "word" | "sentence" | "paragraph"
    chunk_size: int = 500            # words (word strategy) or chars (sentence/paragraph)
    overlap: int = 50                # words/chars of overlap between chunks
    min_chunk_size: int = 50         # discard chunks shorter than this


class DatabaseConfig(BaseModel):
    enabled: bool = False
    host: str = "localhost"
    port: int = 5432
    dbname: str = ""
    user: str = ""
    password: str = ""


class AppSettings(BaseModel):
    chat: ChatModelConfig = ChatModelConfig()
    embed: EmbedModelConfig = EmbedModelConfig()
    reranker: RerankerConfig = RerankerConfig()
    reindex_thresholds: ReindexThresholds = ReindexThresholds()
    chunking: ChunkingConfig = ChunkingConfig()
    theme: ThemeConfig = ThemeConfig()
    database: DatabaseConfig = DatabaseConfig()
