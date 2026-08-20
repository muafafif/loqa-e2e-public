import os

os.environ.setdefault("LOQA_E2E_LICENSE_BYPASS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import finance, inventory, license, orders, projects, settings
from app.api.deps.license import require_license
from app.core.config import settings as app_config
from app.services import (
    finance_service,
    inventory_service,
    order_service,
    project_service,
)


app = FastAPI(title="LOQA Work E2E Backend", version=app_config.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://127.0.0.1:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_licensed = [Depends(require_license)]

finance_service.init_db()
inventory_service.init_db()
order_service.init_db()
project_service.init_db()

app.include_router(settings.router, prefix="/api", dependencies=_licensed)
app.include_router(finance.router, prefix="/api", dependencies=_licensed)
app.include_router(inventory.router, prefix="/api", dependencies=_licensed)
app.include_router(orders.router, prefix="/api", dependencies=_licensed)
app.include_router(projects.router, prefix="/api", dependencies=_licensed)
app.include_router(license.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": app_config.app_version, "license": "e2e"}
