"""
In-process lock session manager.

State is kept in memory only — never persisted to disk.
The derived AES key lives here during an unlocked session and is cleared on lock/timeout.
"""
import time
import json
from typing import Optional
from pathlib import Path
from app.core.config import settings
from app.services.crypto_service import derive_key, hash_pin

_PIN_HASH_FILE = settings.data_dir / "lock_pin.json"

# ── In-memory session state ───────────────────────────────────────────────────

_session: dict = {
    "unlocked": False,
    "key": None,          # bytes — derived AES key, None when locked
    "last_activity": 0.0,
    "timeout_minutes": 30,
}


# ── PIN management ────────────────────────────────────────────────────────────

def is_pin_set() -> bool:
    return _PIN_HASH_FILE.exists()


def set_pin(pin: str, timeout_minutes: int = 30) -> None:
    """Hash and persist the PIN. Immediately starts an unlocked session."""
    pin_hash = hash_pin(pin, settings.data_dir)
    _PIN_HASH_FILE.write_text(json.dumps({"hash": pin_hash}))
    # Derive key and open session
    key = derive_key(pin, settings.data_dir)
    _session["unlocked"] = True
    _session["key"] = key
    _session["last_activity"] = time.time()
    _session["timeout_minutes"] = timeout_minutes


def change_pin(old_pin: str, new_pin: str) -> bool:
    """Verify old PIN then replace with new PIN. Returns False if old PIN wrong."""
    if not verify_pin(old_pin):
        return False
    set_pin(new_pin, _session["timeout_minutes"])
    return True


def remove_pin() -> None:
    """Remove PIN entirely — all locked items become inaccessible."""
    if _PIN_HASH_FILE.exists():
        _PIN_HASH_FILE.unlink()
    _clear_session()


def verify_pin(pin: str) -> bool:
    if not _PIN_HASH_FILE.exists():
        return False
    stored = json.loads(_PIN_HASH_FILE.read_text())
    return hash_pin(pin, settings.data_dir) == stored["hash"]


# ── Session management ────────────────────────────────────────────────────────

def unlock(pin: str, timeout_minutes: Optional[int] = None) -> bool:
    """Verify PIN and open session. Returns True on success."""
    if not verify_pin(pin):
        return False
    key = derive_key(pin, settings.data_dir)
    _session["unlocked"] = True
    _session["key"] = key
    _session["last_activity"] = time.time()
    if timeout_minutes is not None:
        _session["timeout_minutes"] = timeout_minutes
    return True


def lock() -> None:
    _clear_session()


def touch() -> None:
    """Reset idle timer — call on any user activity while unlocked."""
    if _session["unlocked"]:
        _session["last_activity"] = time.time()


def get_key() -> Optional[bytes]:
    """Return the session key if unlocked and not timed out, else None."""
    if not _session["unlocked"] or _session["key"] is None:
        return None
    elapsed = time.time() - _session["last_activity"]
    if elapsed > _session["timeout_minutes"] * 60:
        _clear_session()
        return None
    return _session["key"]


def is_unlocked() -> bool:
    return get_key() is not None


def get_status() -> dict:
    key = get_key()
    unlocked = key is not None
    remaining = 0
    if unlocked:
        elapsed = time.time() - _session["last_activity"]
        remaining = max(0, int(_session["timeout_minutes"] * 60 - elapsed))
    return {
        "pin_set": is_pin_set(),
        "unlocked": unlocked,
        "timeout_minutes": _session["timeout_minutes"],
        "remaining_seconds": remaining,
    }


def set_timeout(minutes: int) -> None:
    _session["timeout_minutes"] = minutes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clear_session():
    _session["unlocked"] = False
    _session["key"] = None
    _session["last_activity"] = 0.0
