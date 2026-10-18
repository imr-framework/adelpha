"""Locate checkout trees so editable installs can import studio modules."""

from __future__ import annotations

import sys
from pathlib import Path


def repo_root() -> Path | None:
    """Return the Adelpha checkout root when this file lives in ``python/adelpha``."""
    root = Path(__file__).resolve().parents[2]
    if (root / "halbach" / "sim.py").is_file() and (root / "dtam" / "src" / "dtam").is_dir():
        return root
    return None


def ensure_impl_path() -> None:
    """Put ``dtam``, ``coil``, ``simulation.fem``, and related trees on ``sys.path``."""
    root = repo_root()
    if root is None:
        return
    for candidate in (root / "dtam" / "src", root):
        path = str(candidate)
        if path not in sys.path:
            sys.path.insert(0, path)
