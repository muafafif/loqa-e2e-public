import sys
import os
from pathlib import Path

# Redirect stdout/stderr BEFORE any other import.
# PyInstaller console=False sets sys.stdout/stderr to None — uvicorn's logging
# setup crashes immediately with "Unable to configure formatter 'default'"
# if it tries to write to a None stream.
if getattr(sys, "frozen", False):
    loqa_dir = Path.home() / "LOQA"
    os.environ["DATA_DIR"] = os.environ.get("DATA_DIR", str(loqa_dir / "home" / "data"))
    os.environ["MODELS_DIR"] = os.environ.get("MODELS_DIR", str(loqa_dir / "models"))

    log_path = loqa_dir / "home" / "backend.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    _log = open(log_path, "a", buffering=1)
    sys.stdout = _log
    sys.stderr = _log

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="error",
    )
