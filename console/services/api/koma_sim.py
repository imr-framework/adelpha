"""Run Adelpha's low-field KomaMRI acquisition.

One brain slice is simulated with a Cartesian spin echo, spoiled gradient echo,
fast spin echo, or balanced SSFP sequence on a low-field scanner.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

SEQUENCES = ("gre", "se", "fse", "bssfp")

DEFAULTS = {
    "sequence": "se",
    "b0_t": 0.5,
    "inhomogeneity_ppm": 20.0,
    "gmax_mt_m": 15.0,
    "tr_ms": 80.0,
    "te_ms": 16.0,
    "flip_deg": 90.0,
    "averages": 1.0,
    "voxel_mm": 8.0,
    "bandwidth_hz": 160.0,
}

LIMITS = {
    "b0_t": (0.05, 1.0),
    "inhomogeneity_ppm": (0.0, 80.0),
    "gmax_mt_m": (5.0, 40.0),
    "tr_ms": (4.0, 400.0),
    "te_ms": (1.0, 200.0),
    "flip_deg": (5.0, 180.0),
    "averages": (1.0, 8.0),
    "voxel_mm": (6.0, 12.0),
    "bandwidth_hz": (40.0, 400.0),
}


def list_suites() -> list[dict]:
    return [
        {
            "id": "low-field",
            "title": "Low-field acquisition",
            "summary": "Cartesian brain slice on a 0.5 T scanner.",
        }
    ]


def _clamp(body: dict, key: str) -> float:
    lo, hi = LIMITS[key]
    raw = body.get(key, DEFAULTS[key])
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a number.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number.")
    return min(hi, max(lo, value))


def low_field_request(body: dict | None) -> dict:
    payload = body or {}
    sequence = str(payload.get("sequence") or DEFAULTS["sequence"])
    if sequence not in SEQUENCES:
        raise ValueError("Choose a gradient echo, spin echo, fast spin echo, or balanced SSFP sequence.")
    request = {"sequence": sequence}
    for key in LIMITS:
        request[key] = _clamp(payload, key)
    if sequence == "bssfp":
        request["te_ms"] = request["tr_ms"] / 2
    else:
        request["te_ms"] = min(request["te_ms"], request["tr_ms"])
    request["averages"] = int(round(request["averages"]))
    return request


def koma_root() -> Path:
    override = os.environ.get("ADELPHA_KOMA_ROOT", "").strip()
    if override:
        root = Path(override)
        if (root / "run_suite.jl").is_file():
            return root
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "koma"
        if (candidate / "run_suite.jl").is_file():
            return candidate
    raise FileNotFoundError("KomaMRI project was not found next to the Adelpha source tree.")


def find_julia() -> str:
    override = os.environ.get("JULIA_BIN", "").strip()
    if override:
        return override
    found = shutil.which("julia")
    if found:
        return found
    home = Path.home() / ".juliaup" / "bin" / "julia"
    if home.is_file():
        return str(home)
    return ""


def julia_status() -> dict:
    binary = find_julia()
    project = None
    try:
        project = str(koma_root())
    except FileNotFoundError:
        project = None
    return {
        "julia": bool(binary),
        "julia_bin": binary or None,
        "project": project,
        "ready": bool(binary and project),
    }


def _command(julia: str, root: Path, params: Path, output: Path) -> list[str]:
    return [
        julia,
        f"--project={root}",
        "--startup-file=no",
        "--threads=auto",
        str(root / "run_suite.jl"),
        "low-field",
        str(params),
        str(output),
    ]


def run_suite(suite_id: str, request: dict | None = None, *, timeout: float = 600) -> dict:
    if suite_id != "low-field":
        raise ValueError(f"Unknown simulation suite: {suite_id}")
    settings = low_field_request(request)
    julia = find_julia()
    if not julia:
        raise RuntimeError("Julia is not installed. KomaMRI needs the julia executable.")
    root = koma_root()
    with tempfile.TemporaryDirectory(prefix="adelpha-koma-") as tmp:
        folder = Path(tmp)
        params = folder / "request.json"
        output = folder / "result.json"
        params.write_text(json.dumps(settings), encoding="utf-8")
        try:
            completed = subprocess.run(
                _command(julia, root, params, output),
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("KomaMRI simulation timed out.") from exc
        if not output.is_file():
            detail = (completed.stderr or completed.stdout or "KomaMRI produced no result.").strip()
            raise RuntimeError(detail[-2000:])
        try:
            data = json.loads(output.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError("KomaMRI returned a result that is not JSON.") from exc
    if not isinstance(data, dict) or not data.get("ok"):
        message = data.get("error") if isinstance(data, dict) else None
        raise RuntimeError(str(message or "KomaMRI simulation failed."))
    return data
