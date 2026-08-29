"""Paths for models, knowledge, and third-party tools."""

from __future__ import annotations

import os
from pathlib import Path

from dtam.config.paths import models_root, pinn_model_dir, repo_root

__all__ = [
    "artifacts_root",
    "halbach_designer_root",
    "knowledge_root",
    "models_root",
    "pinn_model_dir",
    "skills_root",
]


def knowledge_root() -> Path:
    override = os.environ.get("DTAM_KNOWLEDGE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return repo_root() / "data" / "knowledge"


def artifacts_root() -> Path:
    return repo_root() / "artifacts"


def halbach_designer_root() -> Path:
    override = os.environ.get("DTAM_HALBACH_DESIGNER_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return repo_root() / "third_party" / "HalbachMRIDesigner"


def skills_root() -> Path:
    return Path(__file__).resolve().parents[1] / "skills"
