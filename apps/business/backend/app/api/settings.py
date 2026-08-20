from fastapi import APIRouter
import os
from app.models.settings import AppSettings, ChatModelConfig, EmbedModelConfig, RerankerConfig, DatabaseConfig
from app.services.settings_service import load_settings, save_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
def get_settings():
    return load_settings()


@router.post("", response_model=AppSettings)
def update_settings(new_settings: AppSettings):
    save_settings(new_settings)
    return new_settings


@router.post("/test/chat")
async def test_chat(config: ChatModelConfig):
    from app.services.llm_service import llm_service
    try:
        tokens = []
        async for token in llm_service.stream_chat(
            [{"role": "user", "content": "Reply with exactly: OK"}],
            config,
        ):
            if isinstance(token, str):
                tokens.append(token)
                if len(tokens) > 50:
                    break
        return {"ok": True, "response": "".join(tokens).strip()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/test/embed")
def test_embed(config: EmbedModelConfig):
    from app.services.embed_service import embed_service
    try:
        result = embed_service.embed(["test connection"], config)
        dims = len(result[0]) if result else 0
        return {"ok": True, "dimensions": dims}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/test/reranker")
def test_reranker(config: RerankerConfig):
    from app.services.reranker_service import reranker_service
    if not config.model_name:
        return {"ok": False, "error": "No reranker model configured"}
    if config.provider == "cohere" and not config.api_key:
        return {"ok": False, "error": "Cohere API key is required"}
    try:
        reranker_service.rerank(
            "test query",
            [{"content": "test document", "metadata": {}, "score": 1.0}],
            config.model_name,
            top_k=1,
            provider=config.provider,
            api_key=config.api_key,
            endpoint=getattr(config, "endpoint", None),
        )
        return {"ok": True, "message": f"Reranker ready · {config.provider} · {config.model_name}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/test/database")
def test_database(config: DatabaseConfig):
    from app.services.db_adapter import test_postgres_connection
    ok, message = test_postgres_connection(config.model_dump())
    return {"ok": ok, "message": message}


@router.post("/database")
def save_database_config(config: DatabaseConfig):
    from app.services.db_adapter import test_postgres_connection

    if config.enabled:
        ok, message = test_postgres_connection(config.model_dump())
        if not ok:
            return {"ok": False, "message": f"Koneksi gagal: {message}"}

    current = load_settings()
    current.database = config
    save_settings(current)

    if config.enabled:
        from app.services.db_adapter import run_migrations
        errors = []
        for db_name in ["finance", "notes", "conversations"]:
            try:
                run_migrations(db_name, None)
            except Exception as e:
                errors.append(f"{db_name}: {e}")
        if errors:
            return {"ok": True, "message": "Tersimpan dengan peringatan migrasi: " + "; ".join(errors)}

    return {"ok": True, "message": "Konfigurasi database disimpan." + (" Migrasi selesai." if config.enabled else " Menggunakan SQLite.")}


@router.get("/status")
async def connection_status():
    """Check connectivity of currently saved chat and embed models."""
    if os.environ.get("LOQA_E2E_CONNECTION_READY") == "1":
        return {
            "chat": {"ok": True, "error": ""},
            "embed": {"ok": True, "error": ""},
        }

    from app.services.llm_service import llm_service
    from app.services.embed_service import embed_service

    app_settings = load_settings()

    # Check chat
    chat_ok = False
    chat_error = ""
    if app_settings.chat.model_name:
        try:
            tokens = []
            async for token in llm_service.stream_chat(
                [{"role": "user", "content": "Reply with exactly: OK"}],
                app_settings.chat,
            ):
                if isinstance(token, str):
                    tokens.append(token)
                    if len(tokens) > 50:
                        break
            chat_ok = True
        except Exception as e:
            chat_error = str(e)
    else:
        chat_error = "No chat model configured"

    # Check embed
    embed_ok = False
    embed_error = ""
    if app_settings.embed.model_name:
        try:
            result = embed_service.embed(["test"], app_settings.embed)
            embed_ok = bool(result)
        except Exception as e:
            embed_error = str(e)
    else:
        embed_error = "No embed model configured"

    return {
        "chat": {"ok": chat_ok, "error": chat_error},
        "embed": {"ok": embed_ok, "error": embed_error},
    }
