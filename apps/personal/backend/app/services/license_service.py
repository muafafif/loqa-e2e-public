import hashlib
import platform
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import httpx
from jose import JWTError, jwt

from app.core.config import settings

_LICENSE_FILE = settings.data_dir / "license.jwt"
_WORKER_INTERVAL = 600  # 10 minutes


class LicenseError(Exception):
    pass


class LicenseNotActivated(LicenseError):
    pass


class LicenseExpired(LicenseError):
    pass


class LicenseRevoked(LicenseError):
    pass


class LicenseOfflineExpired(LicenseError):
    pass


class LicenseStatus(str, Enum):
    VALID = "valid"
    REVOKED = "revoked"
    EXPIRED = "expired"
    NOT_ACTIVATED = "not_activated"


@dataclass
class LicenseState:
    status: LicenseStatus
    claims: Optional[dict] = field(default=None)


_state = LicenseState(status=LicenseStatus.NOT_ACTIVATED)
_lock = threading.Lock()


def get_state() -> LicenseState:
    with _lock:
        return _state


def _set_state(status: LicenseStatus, claims: Optional[dict] = None) -> None:
    global _state
    with _lock:
        _state = LicenseState(status=status, claims=claims)


def _fingerprint() -> str:
    mac = str(uuid.getnode())
    cpu = platform.processor()
    try:
        import psutil
        parts = psutil.disk_partitions()
        disk = parts[0].device if parts else ""
    except Exception:
        disk = ""
    return hashlib.sha256(f"{mac}:{cpu}:{disk}".encode()).hexdigest()


def _load_token() -> Optional[str]:
    if not _LICENSE_FILE.exists():
        return None
    token = _LICENSE_FILE.read_text().strip()
    return token or None


def _save_token(token: str) -> None:
    _LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _LICENSE_FILE.write_text(token)


def _clear_token() -> None:
    if _LICENSE_FILE.exists():
        _LICENSE_FILE.write_text("")


def _verify_offline(token: str) -> dict:
    public_key = settings.license_public_key.replace("\\n", "\n")
    if not public_key:
        raise LicenseError("LICENSE_PUBLIC_KEY not configured")
    try:
        return jwt.decode(token, public_key, algorithms=["RS256"])
    except JWTError as e:
        raise LicenseOfflineExpired(str(e))


def load_local() -> dict:
    """Verify the stored JWT locally — no network. Called on startup."""
    token = _load_token()
    if not token:
        raise LicenseNotActivated("no license found")
    return _verify_offline(token)


def activate(key: str) -> dict:
    """Activate a license key against the LOQA API. Stores the JWT locally."""
    fp = _fingerprint()
    try:
        resp = httpx.post(
            f"{settings.license_api_url}/activate",
            json={"key": key, "fingerprint": fp},
            timeout=15,
        )
    except (httpx.RequestError, httpx.TimeoutException) as e:
        raise LicenseError(f"cannot reach license server: {e}")

    if resp.status_code == 403:
        raise LicenseError("seat limit reached")
    if resp.status_code != 200:
        raise LicenseError(f"activation failed: {resp.text}")

    token = resp.json()["token"]
    claims = _verify_offline(token)
    _save_token(token)
    _set_state(LicenseStatus.VALID, claims)
    return claims


def validate() -> dict:
    """
    Call POST /validate online. Saves fresh JWT on success.

    Raises:
        LicenseNotActivated  — no token stored
        LicenseRevoked       — server returned 403
        LicenseExpired       — server returned 401
        LicenseOfflineExpired — offline and JWT exp has passed
        LicenseError         — network error (caller decides whether to retry)
    """
    token = _load_token()
    if not token:
        raise LicenseNotActivated("no license found")

    try:
        resp = httpx.post(
            f"{settings.license_api_url}/validate",
            headers={"Authorization": f"Bearer {token}"},
            timeout=3,
        )
    except (httpx.RequestError, httpx.TimeoutException) as e:
        raise LicenseError(f"network error: {e}")

    if resp.status_code == 403:
        _clear_token()
        raise LicenseRevoked("device has been revoked")
    if resp.status_code == 401:
        raise LicenseExpired("license inactive or expired")
    if resp.status_code == 200:
        fresh = resp.json()["token"]
        _save_token(fresh)
        return _verify_offline(fresh)

    raise LicenseError(f"unexpected response: {resp.status_code}")


def _worker() -> None:
    while True:
        time.sleep(_WORKER_INTERVAL)
        try:
            claims = validate()
            _set_state(LicenseStatus.VALID, claims)
        except LicenseRevoked:
            _set_state(LicenseStatus.REVOKED)
        except LicenseExpired:
            _set_state(LicenseStatus.EXPIRED)
        except Exception:
            pass  # network error or offline — keep current state, retry next cycle


def start_worker() -> None:
    t = threading.Thread(target=_worker, daemon=True)
    t.start()
