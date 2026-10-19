"""Launch JSON subprocess workers, including from the frozen sidecar.

The packaged ``adelpha-python-runtime`` binary is not a Python interpreter.
Gateway flags (``--host``, ``--port``, ``--dev``) reject a script path. Workers
must invoke ``run-script`` so the child executes the bundled ``.py`` file.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

RUNTIME_STEM = "adelpha-python-runtime"


def _executable_stem(python: str) -> str:
    name = python.replace("\\", "/").rstrip("/").split("/")[-1]
    lower = name.lower()
    if lower.endswith(".exe"):
        name = name[:-4]
    return name.lower()


def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def venv_python(venv: Path) -> str:
    """Return the venv interpreter, including Windows ``Scripts``."""
    if os.name == "nt":
        candidates = (venv / "Scripts" / "python.exe", venv / "Scripts" / "python")
    else:
        candidates = (venv / "bin" / "python", venv / "bin" / "python3")
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return ""


def is_runtime_executable(python: str) -> bool:
    if _executable_stem(python) == RUNTIME_STEM:
        return True
    if not python or not frozen():
        return False
    return os.path.normcase(os.path.abspath(python)) == os.path.normcase(os.path.abspath(sys.executable))


def resolve_worker_python(env_var: str, *venv_roots: Path) -> str:
    """Env override, then isolated venvs, then the frozen sidecar."""
    override = os.environ.get(env_var, "").strip()
    if override:
        return override
    for root in venv_roots:
        found = venv_python(root)
        if found:
            return found
    if frozen():
        return sys.executable
    return ""


def worker_argv(python: str, script: Path | str, *args: str) -> list[str]:
    """Build ``python script.py …`` or ``adelpha-python-runtime run-script …``."""
    script_s = str(script)
    payload = [str(item) for item in args]
    if is_runtime_executable(python):
        return [python, "run-script", script_s, *payload]
    return [python, script_s, *payload]
