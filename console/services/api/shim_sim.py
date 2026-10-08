"""Passive shim trays from imr-framework/passive_shimming.

The Engineering Studio calls this for two circular trays. The package is
installed from the dev_ws_2026 branch into shim/.venv so its NumPy 2 pin
stays out of the API process.
Source: https://github.com/imr-framework/passive_shimming/tree/dev_ws_2026
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

GAMMABAR_HZ_PER_T = 42.577478518e6

DEFAULTS = {
    "diameter_mm": 152.0,
    "offset_mm": 48.5,
    "dsv_mm": 70.0,
    "candidates": 20,
    "steps": 40,
}

LIMITS = {
    "diameter_mm": (100.0, 250.0),
    "offset_mm": (30.0, 80.0),
    "dsv_mm": (40.0, 90.0),
    "candidates": (8, 40),
    "steps": (10, 80),
}


def _number(body: dict, key: str) -> float:
    lo, hi = LIMITS[key]
    raw = body.get(key, DEFAULTS[key])
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a number.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number.")
    return min(hi, max(lo, value))


def shim_request(body: dict | None) -> dict:
    payload = body or {}
    return {
        "diameter_mm": _number(payload, "diameter_mm"),
        "offset_mm": _number(payload, "offset_mm"),
        "dsv_mm": _number(payload, "dsv_mm"),
        "candidates": int(round(_number(payload, "candidates"))),
        "steps": int(round(_number(payload, "steps"))),
    }


def shim_python() -> str:
    override = os.environ.get("SHIM_PYTHON", "").strip()
    if override:
        return override
    candidate = Path(__file__).resolve().parents[3] / "shim" / ".venv" / "bin" / "python"
    if candidate.is_file():
        return str(candidate)
    return ""


def run_shim(body: dict | None = None) -> dict:
    request = shim_request(body)
    python = shim_python()
    if not python:
        raise RuntimeError("Passive shimming is not installed. The shim environment is missing.")
    with tempfile.TemporaryDirectory(prefix="adelpha-shim-") as tmp:
        params = Path(tmp) / "params.json"
        result = Path(tmp) / "result.json"
        params.write_text(json.dumps(request), encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = ""
        env["MPLBACKEND"] = "Agg"
        env["MPLCONFIGDIR"] = str(Path(tmp) / "mpl")
        proc = subprocess.run(
            [python, str(Path(__file__).resolve()), str(params), str(result)],
            capture_output=True,
            text=True,
            env=env,
            timeout=180,
            cwd=tmp,
        )
        if not result.exists():
            detail = (proc.stderr or proc.stdout or "Passive shimming failed.").strip()
            raise RuntimeError(detail[-800:])
        payload = json.loads(result.read_text(encoding="utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(str(payload.get("error") or "Passive shimming failed."))
    return payload


def _synthetic_field(dsv_mm: float):
    import numpy as np

    from shimming_io import FieldMap

    radius = float(dsv_mm) / 2000.0
    samples = np.linspace(-radius, radius, 7)
    points = [
        [x, y, z]
        for x in samples
        for y in samples
        for z in samples
        if x * x + y * y + z * z <= radius * radius
    ]
    positions = np.asarray(points, dtype=float)
    scaled = positions / radius
    field = 0.05 + 0.003 * scaled[:, 0] + 0.0015 * (scaled[:, 2] ** 2 - 0.2)
    return FieldMap(positions, field, GAMMABAR_HZ_PER_T)


def _ppm(report: dict) -> float:
    return round(float(report["field"]["std_ppm"]), 1)


def _p2p_mt(report: dict) -> float:
    return round(float(report["field"]["peak_to_peak_mT"]), 3)


def simulate(request: dict) -> dict:
    import time

    import numpy as np

    from shimming_basis import ShimBasis
    from shimming_geometry import CandidateTray, ShimMagnet, TrayGeometry
    from shimming_optimization import ShimOptimizationProblem, ShimOptimizer
    from shimming_reporting import ShimmingReporter

    started = time.perf_counter()
    field_map = _synthetic_field(float(request["dsv_mm"]))
    field_map.validate()
    offset_m = float(request["offset_mm"]) / 1000.0
    tray = TrayGeometry.circular(
        float(request["diameter_mm"]) / 1000.0,
        np.array([-offset_m, offset_m]),
    )
    tray.validate()
    magnet = ShimMagnet(
        material="N45",
        dimensions_m=np.array([6.35e-3, 6.35e-3, 3.18e-3]),
        polarization_T=1.2,
    )
    magnet.validate()
    candidates = CandidateTray(
        tray_geometry=tray,
        shim_magnet=magnet,
        max_candidates_per_plane=int(request["candidates"]),
        require_full_magnet_inside=True,
    )
    candidates.build()
    basis = ShimBasis(field_map, candidates)
    basis.compute()
    problem = ShimOptimizationProblem(field_map, candidates)
    problem.attach_basis(basis)
    optimizer = ShimOptimizer(
        problem,
        random_seed=2,
        n_restarts=3,
        max_greedy_steps=int(request["steps"]),
        perturbation_sizes=(2, 3, 5),
        verbose=False,
    )
    optimizer.run()
    states = np.asarray(optimizer.best_states, dtype=int)
    reporter = ShimmingReporter(field_map, problem)
    before = reporter.evaluate(field_map.B_T, "pre_shim")
    after = reporter.evaluate(
        field_map.B_T + basis.field_from_states(states),
        "post_shim",
        states,
    )
    placed = []
    for state, item in zip(states, candidates.candidate_metadata):
        if int(state) == 0:
            continue
        position = np.asarray(item["position_m"], dtype=float)
        placed.append(
            {
                "position": [round(float(value), 5) for value in position],
                "polarity": int(state),
            }
        )
    counts = after["shim_state"]
    return {
        "ok": True,
        "title": "Passive shim trays",
        "summary": "Iterated-greedy passive shim on two circular trays. The bore field is synthetic.",
        "diameter_mm": request["diameter_mm"],
        "offset_mm": request["offset_mm"],
        "dsv_mm": request["dsv_mm"],
        "candidates": int(request["candidates"]),
        "steps": int(request["steps"]),
        "pre_std_ppm": _ppm(before),
        "post_std_ppm": _ppm(after),
        "pre_p2p_mt": _p2p_mt(before),
        "post_p2p_mt": _p2p_mt(after),
        "n_positive": int(counts["n_positive"]),
        "n_negative": int(counts["n_negative"]),
        "magnet_mm": [6.35, 6.35, 3.18],
        "magnets": placed,
        "elapsed_s": round(time.perf_counter() - started, 3),
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: shim_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        payload = simulate(shim_request(request))
    except Exception as exc:
        payload = {"ok": False, "error": str(exc)}
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
