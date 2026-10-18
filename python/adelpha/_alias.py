"""Expose a dtam package under an Adelpha module name."""

from __future__ import annotations

import sys
from importlib import import_module
from types import ModuleType


def alias(name: str, target: str) -> ModuleType:
    """Replace ``adelpha.<name>`` with ``dtam.<target>`` so submodules stay reachable."""
    module = import_module(target)
    sys.modules[name] = module
    return module
