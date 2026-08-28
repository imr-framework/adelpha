from __future__ import annotations

import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path


RUNTIME_VERSION = "0.1.0"
HANDSHAKE_PREFIX = "ADELPHA_RUNTIME_READY "
LOCK_NAME = "adelpha-python-runtime.lock"


def _env_path(name: str) -> Path | None:
    raw = os.environ.get(name, "").strip()
    return Path(raw).expanduser() if raw else None


def default_repo_root() -> Path:
    """Adelpha checkout (runtime/python/adelpha_runtime/ → repo)."""
    return Path(__file__).resolve().parents[3]


def platform_data_dir() -> Path:
    override = _env_path("ADELPHA_DATA_DIR")
    if override:
        return override
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Adelpha"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(appdata) / "Adelpha"
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / "adelpha"
    return Path.home() / ".local" / "share" / "adelpha"


@dataclass(frozen=True)
class RuntimePaths:
    data_dir: Path
    config_dir: Path
    cache_dir: Path
    log_dir: Path
    temp_dir: Path
    resource_dir: Path
    dtam_src: Path | None
    dtam_configs: Path | None
    console_root: Path | None

    def ensure(self) -> None:
        for folder in (self.data_dir, self.config_dir, self.cache_dir, self.log_dir, self.temp_dir):
            folder.mkdir(parents=True, exist_ok=True)


def _frozen_base() -> Path | None:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return None


def resolve_paths() -> RuntimePaths:
    repo = default_repo_root()
    frozen = _frozen_base()
    data = platform_data_dir()
    config = _env_path("ADELPHA_CONFIG_DIR") or data / "config"
    cache = _env_path("ADELPHA_CACHE_DIR") or data / "cache"
    logs = _env_path("ADELPHA_LOG_DIR") or data / "logs"
    temp = _env_path("ADELPHA_TEMP_DIR") or data / "tmp"
    resource = _env_path("ADELPHA_RESOURCE_DIR") or frozen or repo

    dtam_src = _env_path("ADELPHA_DTAM_SRC")
    if dtam_src is None:
        search = []
        if frozen is not None:
            search.append(frozen)
        search.extend([resource / "dtam" / "src", repo / "dtam" / "src"])
        for candidate in search:
            # Frozen builds import dtam from the bundled package; src layout is optional.
            if candidate.is_dir() and (candidate / "dtam").is_dir():
                dtam_src = candidate
                break

    dtam_configs = _env_path("ADELPHA_DTAM_CONFIGS")
    if dtam_configs is None:
        candidates = []
        if frozen is not None:
            candidates.append(frozen / "dtam-configs")
        if dtam_src is not None:
            candidates.append(dtam_src.parent / "configs")
        candidates.append(resource / "dtam" / "configs")
        for cfg in candidates:
            if cfg.is_dir():
                dtam_configs = cfg
                break

    console = _env_path("ADELPHA_CONSOLE_ROOT")
    if console is None:
        candidates = []
        # PyInstaller copies console `services/` and `common/` into _MEIPASS,
        # not a nested `console/` folder.
        if frozen is not None:
            candidates.append(frozen)
            candidates.append(frozen / "console")
        candidates.extend((resource / "console", repo / "console"))
        for candidate in candidates:
            if candidate.is_dir() and (candidate / "services").is_dir():
                console = candidate
                break

    paths = RuntimePaths(
        data_dir=data,
        config_dir=config,
        cache_dir=cache,
        log_dir=logs,
        temp_dir=temp,
        resource_dir=resource,
        dtam_src=dtam_src,
        dtam_configs=dtam_configs,
        console_root=console,
    )
    paths.ensure()
    return paths


def session_token() -> str:
    existing = os.environ.get("ADELPHA_SESSION_TOKEN", "").strip()
    if existing:
        return existing
    return secrets.token_urlsafe(32)


def cors_origins() -> list[str]:
    raw = os.environ.get("ADELPHA_CORS_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "https://tauri.localhost",
        "http://tauri.localhost",
        "https://asset.localhost",
        "http://asset.localhost",
    ]
