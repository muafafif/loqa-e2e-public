from fastapi import APIRouter, HTTPException
import os
from pydantic import BaseModel

from app.services import license_service
from app.services.license_service import LicenseStatus

router = APIRouter(prefix="/license", tags=["license"])


class ActivateRequest(BaseModel):
    key: str


class LicenseStatusResponse(BaseModel):
    status: LicenseStatus
    tier: str | None = None
    expires_at: str | None = None
    license_key: str | None = None


@router.get("/status", response_model=LicenseStatusResponse)
def get_status():
    if os.environ.get("LOQA_E2E_LICENSE_BYPASS") == "1":
        return LicenseStatusResponse(status=LicenseStatus.VALID, tier="e2e")

    state = license_service.get_state()
    if state.claims:
        return LicenseStatusResponse(
            status=state.status,
            tier=state.claims.get("tier"),
            expires_at=state.claims.get("expires_at"),
            license_key=state.claims.get("license_key"),
        )
    return LicenseStatusResponse(status=state.status)


@router.post("/activate", response_model=LicenseStatusResponse)
def activate(req: ActivateRequest):
    try:
        claims = license_service.activate(req.key)
    except license_service.LicenseError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return LicenseStatusResponse(
        status=LicenseStatus.VALID,
        tier=claims.get("tier"),
        expires_at=claims.get("expires_at"),
        license_key=claims.get("license_key"),
    )
