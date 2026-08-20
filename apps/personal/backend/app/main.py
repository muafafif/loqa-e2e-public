import os
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, knowledge, models, settings, metrics, conversations, lock, finance, inventory, notes, habits, license
from app.api.deps.license import require_license, require_active_license
from app.services.note_service import init_db as init_notes_db
from app.services.habit_service import init_db as init_habit_db
from app.services import license_service
from app.services.license_service import LicenseStatus
from app.core.config import settings as app_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_notes_db()
    init_habit_db()

    # Local JWT check — no network, fast.
    try:
        claims = license_service.load_local()
        license_service._set_state(LicenseStatus.VALID, claims)
    except license_service.LicenseNotActivated:
        license_service._set_state(LicenseStatus.NOT_ACTIVATED)
    except license_service.LicenseOfflineExpired:
        license_service._set_state(LicenseStatus.EXPIRED)

    license_service.start_worker()
    yield


app = FastAPI(
    title="LOQA Home Backend",
    version=app_config.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# license.router is intentionally NOT gated — it's what lets the app check
# status/activate in the first place. AI routers (chat/knowledge/models) require
# an active (non-expired) license; the rest stay reachable in "limited mode"
# (expired license, data intact) — only not_activated/revoked lock those out.
_licensed = [Depends(require_license)]
_ai_licensed = [Depends(require_active_license)]
app.include_router(chat.router, prefix="/api", dependencies=_ai_licensed)
app.include_router(knowledge.router, prefix="/api", dependencies=_ai_licensed)
app.include_router(models.router, prefix="/api", dependencies=_ai_licensed)
app.include_router(settings.router, prefix="/api", dependencies=_licensed)
app.include_router(metrics.router, prefix="/api", dependencies=_licensed)
app.include_router(conversations.router, prefix="/api", dependencies=_licensed)
app.include_router(lock.router, prefix="/api", dependencies=_licensed)
app.include_router(finance.router, prefix="/api", dependencies=_licensed)
app.include_router(inventory.router, prefix="/api", dependencies=_licensed)
app.include_router(notes.router, prefix="/api", dependencies=_licensed)
app.include_router(habits.router, prefix="/api", dependencies=_licensed)
app.include_router(license.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": app_config.app_version, "license": license_service.get_state().status}
