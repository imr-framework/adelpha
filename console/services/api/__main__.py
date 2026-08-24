"""Run: python -m services.api  (from the console/ directory)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

def _writable_base(path: Path) -> bool:
    try:
        (path / "logs").mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False


def resolve_base() -> Path:
    env = os.getenv("MRI4ALL_BASE")
    if env:
        candidate = Path(env)
        if _writable_base(candidate):
            return candidate
    scanner = Path("/opt/mri4all")
    if scanner.is_dir() and _writable_base(scanner):
        return scanner
    local = ADELPHA_ROOT / ".mri4all"
    _writable_base(local)
    return local


CONSOLE_ROOT = Path(__file__).resolve().parents[2]
ADELPHA_ROOT = CONSOLE_ROOT.parent

if str(CONSOLE_ROOT) not in sys.path:
    sys.path.insert(0, str(CONSOLE_ROOT))
if str(CONSOLE_ROOT / "external") not in sys.path:
    sys.path.insert(0, str(CONSOLE_ROOT / "external"))

os.environ["MRI4ALL_BASE"] = str(resolve_base())

os.environ.setdefault("MRI4ALL_DEBUG", "true")
Path(os.environ["MRI4ALL_BASE"], "logs").mkdir(parents=True, exist_ok=True)
Path(os.environ["MRI4ALL_BASE"], "config").mkdir(parents=True, exist_ok=True)
Path(os.environ["MRI4ALL_BASE"], "data").mkdir(parents=True, exist_ok=True)

import common.runtime as rt  # noqa: E402

rt.set_service_name("api")

import uvicorn  # noqa: E402


def main() -> None:
    uvicorn.run(
        "services.api.app:app",
        host="127.0.0.1",
        port=int(os.getenv("MRI4ALL_API_PORT", "8002")),
        reload=os.getenv("MRI4ALL_API_RELOAD", "").lower() == "true",
    )


if __name__ == "__main__":
    main()
