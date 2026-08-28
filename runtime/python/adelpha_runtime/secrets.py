"""Load local secrets into the process environment. Never log secret values."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from adelpha_runtime.paths import RuntimePaths, default_repo_root

log = logging.getLogger("adelpha.runtime.secrets")


def parse_dotenv_value(text: str, name: str) -> str | None:
    prefix = f"{name}="
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[7:].strip()
        if not stripped.startswith(prefix):
            continue
        raw = stripped[len(prefix) :].strip()
        if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {'"', "'"}:
            raw = raw[1:-1]
        return raw.strip() or None
    return None


def _read_plain_file(path: Path) -> str | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    key = raw.strip()
    return key or None


def _read_dotenv_key(path: Path, name: str) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    return parse_dotenv_value(text, name)


def apply_google_api_key(paths: RuntimePaths) -> bool:
    """Ensure ``GOOGLE_API_KEY`` is set from env, app config, or a developer ``.env``.

    Packaged (frozen) builds never read ``dtam/.env``. The app-config file
    (Settings) wins over a process environment variable so a saved key is used.
    """
    file_key = _read_plain_file(paths.config_dir / "google_api_key")
    if file_key:
        os.environ["GOOGLE_API_KEY"] = file_key
        log.info("GOOGLE_API_KEY loaded from app config")
        return True

    if os.environ.get("GOOGLE_API_KEY", "").strip():
        return True

    if getattr(sys, "frozen", False):
        return False

    candidates: list[Path] = []
    if paths.dtam_src is not None:
        candidates.append(paths.dtam_src.parent / ".env")
    candidates.append(default_repo_root() / "dtam" / ".env")
    seen: set[Path] = set()
    for env_file in candidates:
        resolved = env_file.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        key = _read_dotenv_key(env_file, "GOOGLE_API_KEY")
        if key:
            os.environ["GOOGLE_API_KEY"] = key
            log.info("GOOGLE_API_KEY loaded from developer .env")
            return True
    return False
