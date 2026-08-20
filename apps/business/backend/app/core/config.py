from pydantic_settings import BaseSettings
from pathlib import Path
import os

BASE_DIR = Path(__file__).parent.parent.parent
LOQA_DIR = Path.home() / "LOQA"

_models_dir = Path(os.environ.get("MODELS_DIR", str(LOQA_DIR / "models")))
_data_dir = Path(os.environ.get("DATA_DIR", str(LOQA_DIR / "work" / "data")))


class Settings(BaseSettings):
    app_name: str = "LOQA Work"
    app_version: str = "0.1.0"
    debug: bool = False

    # Paths
    models_dir: Path = _models_dir
    chat_models_dir: Path = _models_dir / "chat"
    embed_models_dir: Path = _models_dir / "embed"
    reranker_models_dir: Path = _models_dir / "reranker"
    data_dir: Path = _data_dir
    chromadb_dir: Path = _data_dir / "chromadb"
    product_images_dir: Path = _data_dir / "product_images"

    # Default inference settings
    n_ctx: int = 4096
    n_threads: int = 4
    n_gpu_layers: int = -1  # -1 = auto detect, 0 = CPU only

    # Licensing
    license_api_url: str = "https://api.loqa.app"
    license_public_key: str = ""  # RSA public key PEM (\\n-escaped in env)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
for d in [
    settings.models_dir,
    settings.chat_models_dir,
    settings.embed_models_dir,
    settings.reranker_models_dir,
    settings.data_dir,
    settings.chromadb_dir,
    settings.product_images_dir,
]:
    d.mkdir(parents=True, exist_ok=True)
