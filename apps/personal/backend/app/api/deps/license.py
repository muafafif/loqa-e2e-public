from fastapi import HTTPException

from app.services import license_service
from app.services.license_service import LicenseState, LicenseStatus

# expired keeps data-router access ("limited mode" per CLAUDE.md — data intact,
# AI restricted); only not_activated/revoked lock the app out entirely.
_LOCKED_OUT = {LicenseStatus.NOT_ACTIVATED, LicenseStatus.REVOKED}


# Returns LicenseState (not just a bool) so future deps like require_module can read claims off it.
def require_license() -> LicenseState:
    state = license_service.get_state()
    if state.status in _LOCKED_OUT:
        raise HTTPException(status_code=403, detail=f"license {state.status.value}")
    return state


# Stricter than require_license — also blocks `expired`. Apply to AI routers
# (chat, knowledge, models) so "limited mode" restricts AI specifically.
def require_active_license() -> LicenseState:
    state = license_service.get_state()
    if state.status != LicenseStatus.VALID:
        raise HTTPException(status_code=403, detail=f"license {state.status.value}")
    return state
