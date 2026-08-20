import json
from pathlib import Path
from app.models.settings import AppSettings
from app.core.config import settings

SETTINGS_FILE = settings.data_dir / "app_settings.json"


def load_settings() -> AppSettings:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r") as f:
                data = json.load(f)
            return AppSettings(**data)
        except (json.JSONDecodeError, Exception):
            # Corrupted file — fall back to defaults and overwrite
            defaults = AppSettings()
            save_settings(defaults)
            return defaults
    return AppSettings()


def save_settings(app_settings: AppSettings) -> None:
    with open(SETTINGS_FILE, "w") as f:
        json.dump(app_settings.model_dump(), f, indent=2)
