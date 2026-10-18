"""Configuration path resolution."""

from __future__ import annotations

import os
from pathlib import Path

from dtam.core.exceptions import ConfigurationError

_ENV_CONFIG_DIR = "DTAM_CONFIG_DIR"


def repo_root() -> Path:
    """Return the repository root (parent of ``src``)."""
    return Path(__file__).resolve().parents[3]


def default_config_root() -> Path:
    return repo_root() / "configs"


def resolve_config_root(explicit: Path | str | None = None) -> Path:
    """Resolve the configuration root from an argument, env, or repo default."""
    if explicit is not None:
        candidate = Path(explicit).expanduser().resolve()
    elif os.environ.get(_ENV_CONFIG_DIR):
        candidate = Path(os.environ[_ENV_CONFIG_DIR]).expanduser().resolve()
    else:
        candidate = default_config_root()

    if not candidate.is_dir():
        raise ConfigurationError(
            f"Configuration directory not found: {candidate}",
            context={"config_root": str(candidate)},
            recommended_response="Set DTAM_CONFIG_DIR or pass config_root explicitly.",
        )
    return candidate


def models_root() -> Path:
    override = os.environ.get("DTAM_MODELS_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return repo_root() / "data" / "models"


def pinn_model_dir() -> Path:
    """Directory for thermal PINN artifacts (``model.pt`` / ``model.onnx``)."""
    override = os.environ.get("DTAM_PINN_MODEL_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return models_root() / "pinn"
