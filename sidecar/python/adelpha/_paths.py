"""Locate checkout trees so editable installs can import studio modules."""

from __future__ import annotations

import sys
from pathlib import Path


def repo_root() -> Path | None:
    """Return the Python-projects root (``sidecar/`` in an Adelpha checkout)."""
    here = Path(__file__).resolve()
    for candidate in (here.parents[2], here.parents[3] / "sidecar" if len(here.parents) > 3 else None):
        if candidate is None:
            continue
        if (candidate / "halbach" / "sim.py").is_file() and (candidate / "dtam" / "src" / "dtam").is_dir():
            return candidate
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
