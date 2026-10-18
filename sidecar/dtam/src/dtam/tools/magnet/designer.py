"""HalbachMRIDesigner subprocess wrapper (GPL-3 upstream tool)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dtam.tools.base import error_result, ok_result
from dtam.tools.paths import artifacts_root, halbach_designer_root


def _designer_entry() -> Path | None:
    root = halbach_designer_root()
    entry = root / "HalbachMRIDesigner.py"
    return entry if entry.is_file() else None


def magnet_designer_status() -> dict[str, Any]:
    """Check whether HalbachMRIDesigner is available locally."""
    entry = _designer_entry()
    root = halbach_designer_root()
    return ok_result(
        "magnet_designer_status",
        available=entry is not None,
        root=str(root),
        entry=str(entry) if entry else None,
        source="https://github.com/menkueclab/HalbachMRIDesigner",
        note=(
            "Clone with: make vendor-halbach "
            "(or set DTAM_HALBACH_DESIGNER_PATH). "
            "Upstream license is GPL-3.0."
        ),
    )


def run_halbach_designer(
    geometry_json: str,
    *,
    scad: bool = True,
    fem: bool = False,
    contour: bool = False,
    quiver: bool = False,
    output_stem: str | None = None,
) -> dict[str, Any]:
    """Run HalbachMRIDesigner CLI on a geometry JSON string or file path.

    Wraps https://github.com/menkueclab/HalbachMRIDesigner via subprocess so the
    GPL-3 designer remains an isolated third-party tool.
    """
    entry = _designer_entry()
    if entry is None:
        status = magnet_designer_status()
        return error_result(
            "run_halbach_designer",
            "HalbachMRIDesigner is not installed locally.",
            error_code="HALBACH_DESIGNER_MISSING",
            **status["data"],
        )

    out_dir = artifacts_root() / "halbach" / datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = output_stem or f"design_{uuid4().hex[:8]}"

    geometry_path = Path(geometry_json)
    if geometry_path.is_file():
        json_path = out_dir / geometry_path.name
        shutil.copy2(geometry_path, json_path)
    else:
        json_path = out_dir / f"{stem}.json"
        json_path.write_text(geometry_json, encoding="utf-8")
        json.loads(json_path.read_text(encoding="utf-8"))

    cmd = [sys.executable, str(entry), str(json_path), "-o", str(out_dir / stem)]
    if scad:
        cmd.append("--scad")
    if fem:
        cmd.append("--fem")
    if contour:
        cmd.append("--contour")
    if quiver:
        cmd.append("--quiver")

    env = os.environ.copy()
    env.setdefault("MPLBACKEND", "Agg")

    completed = subprocess.run(
        cmd,
        cwd=str(entry.parent),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    artifacts = sorted(str(p.relative_to(artifacts_root())) for p in out_dir.iterdir())
    if completed.returncode != 0:
        return error_result(
            "run_halbach_designer",
            "HalbachMRIDesigner exited with a non-zero status.",
            error_code="HALBACH_DESIGNER_FAILED",
            returncode=completed.returncode,
            stdout=completed.stdout[-4000:],
            stderr=completed.stderr[-4000:],
            artifacts=artifacts,
            command=cmd,
        )
    return ok_result(
        "run_halbach_designer",
        returncode=completed.returncode,
        stdout=completed.stdout[-4000:],
        stderr=completed.stderr[-4000:],
        output_dir=str(out_dir),
        artifacts=artifacts,
        command=cmd,
        fem_requested=fem,
    )
