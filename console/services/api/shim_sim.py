"""Passive shim trays from imr-framework/passive_shimming.

The Engineering Studio calls this for two circular trays. The package is
installed into shim/.venv so its NumPy 2 pin stays out of the API process.
Recreate that environment from shim/requirements.txt (commit 5669ce4 on
dev_ws_2026). See shim/README.md.

A measured field map is the same ``.npy`` the upstream solver reads: an
N x 4 or N x 8 float array of x, y, z in mm and B in mT, loaded with
``FieldMap.from_npy``. Without a file the worker shims a synthetic field.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

GAMMABAR_HZ_PER_T = 42.577478518e6
POSITION_SCALE_TO_M = 1e-3
FIELD_SCALE_TO_T = 1e-3
MAX_FIELD_MAP_BYTES = 32 * 1024 * 1024
MAX_FIELD_POINTS = 3000

DEFAULTS = {
    "diameter_mm": 203.3,
    "bottom_mm": -48.5,
    "top_mm": 48.5,
    "magnet_mm": 6.35,
    "thickness_mm": 3.18,
    "polarization_t": 1.2,
    "radial_spacing": 1.0,
    "azimuthal_spacing": 1.25,
}

LIMITS = {
    "diameter_mm": (100.0, 300.0),
    "bottom_mm": (-120.0, -10.0),
    "top_mm": (10.0, 120.0),
    "magnet_mm": (3.0, 15.0),
    "thickness_mm": (1.0, 8.0),
    "polarization_t": (0.4, 1.6),
    "radial_spacing": (0.8, 2.0),
    "azimuthal_spacing": (0.8, 2.5),
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
    request = {
        "diameter_mm": _number(payload, "diameter_mm"),
        "bottom_mm": _number(payload, "bottom_mm"),
        "top_mm": _number(payload, "top_mm"),
        "magnet_mm": _number(payload, "magnet_mm"),
        "thickness_mm": _number(payload, "thickness_mm"),
        "polarization_t": _number(payload, "polarization_t"),
        "radial_spacing": _number(payload, "radial_spacing"),
        "azimuthal_spacing": _number(payload, "azimuthal_spacing"),
    }
    if request["bottom_mm"] >= request["top_mm"]:
        raise ValueError("The bottom tray must sit below the top tray.")
    request["center_map"] = bool(payload.get("center_map", True))
    return request


def field_map_upload(body: dict | None) -> tuple[str, bytes] | None:
    """Return (name, bytes) for a field map sent as base64, or None."""
    payload = body or {}
    upload = payload.get("field_map")
    if not upload:
        return None
    if not isinstance(upload, dict):
        raise ValueError("field_map must be an object with name and data_b64.")
    name = str(upload.get("name") or "field_map.npy")
    data_b64 = upload.get("data_b64")
    if not isinstance(data_b64, str) or not data_b64:
        raise ValueError("field_map.data_b64 must be a base64 string.")
    try:
        data = base64.b64decode(data_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("field_map.data_b64 is not valid base64.") from exc
    if len(data) > MAX_FIELD_MAP_BYTES:
        raise ValueError("The field map is larger than 32 MB.")
    if not data.startswith(b"\x93NUMPY"):
        raise ValueError("The field map must be a NumPy .npy file.")
    return Path(name).name or "field_map.npy", data


def shim_python() -> str:
    override = os.environ.get("SHIM_PYTHON", "").strip()
    if override:
        return override
    candidate = Path(__file__).resolve().parents[3] / "shim" / ".venv" / "bin" / "python"
    if candidate.is_file():
        return str(candidate)
    return ""


def _states(body: dict | None) -> list[int]:
    raw = (body or {}).get("states")
    if not isinstance(raw, list) or not raw:
        raise ValueError("Export needs the states from a finished run.")
    states = []
    for item in raw:
        try:
            value = int(item)
        except (TypeError, ValueError) as exc:
            raise ValueError("Each state must be -1, 0, or 1.") from exc
        if value not in (-1, 0, 1):
            raise ValueError("Each state must be -1, 0, or 1.")
        states.append(value)
    return states


def _destination(body: dict | None) -> str | None:
    raw = (body or {}).get("destination")
    if raw is None or raw == "":
        return None
    path = Path(str(raw)).expanduser()
    if not path.is_absolute():
        raise ValueError("The save folder must be an absolute path.")
    if not path.is_dir():
        raise ValueError("Choose an existing folder to save the trays.")
    return str(path)


def run_shim(body: dict | None = None) -> dict:
    request = shim_request(body)
    request["mode"] = "simulate"
    return _run_worker(request, field_map_upload(body))


def export_shim(body: dict | None = None) -> dict:
    """Write the upstream tray STLs and magnet collections for a finished run."""
    request = shim_request(body)
    request["mode"] = "export"
    request["states"] = _states(body)
    destination = _destination(body)
    if destination:
        request["destination"] = destination
    return _run_worker(request, None)


def inspect_field_map(body: dict | None = None) -> dict:
    """Load a measured field map in the shim environment and describe it."""
    upload = field_map_upload(body)
    if upload is None:
        raise ValueError("Attach a field map (.npy) to inspect.")
    request = {"mode": "inspect", "center_map": bool((body or {}).get("center_map", True))}
    return _run_worker(request, upload)


def _run_worker(request: dict, upload: tuple[str, bytes] | None) -> dict:
    python = shim_python()
    if not python:
        raise RuntimeError("Passive shimming is not installed. The shim environment is missing.")
    with tempfile.TemporaryDirectory(prefix="adelpha-shim-") as tmp:
        params = Path(tmp) / "params.json"
        result = Path(tmp) / "result.json"
        if upload is not None:
            name, data = upload
            field_path = Path(tmp) / "field_map.npy"
            field_path.write_bytes(data)
            request = {**request, "field_map_path": str(field_path), "field_map_name": name}
        params.write_text(json.dumps(request), encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = ""
        env["MPLBACKEND"] = "Agg"
        # Stable cache so matplotlib does not rebuild its font list on every call.
        mpl_dir = Path(tempfile.gettempdir()) / "adelpha-shim-mpl"
        mpl_dir.mkdir(parents=True, exist_ok=True)
        env["MPLCONFIGDIR"] = str(mpl_dir)
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


def _dsv_mm(request: dict) -> float:
    gap = float(request["top_mm"]) - float(request["bottom_mm"])
    return min(70.0, max(30.0, gap * 0.7))


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


def _load_field(request: dict):
    """Measured map when a file was attached, otherwise the synthetic bore."""
    import numpy as np

    from shimming_io import FieldMap

    path = request.get("field_map_path")
    if not path:
        field_map = _synthetic_field(_dsv_mm(request) if "top_mm" in request else 70.0)
        field_map.validate()
        return field_map, "synthetic"
    field_map = FieldMap.from_npy(
        filename=path,
        position_scale_to_m=POSITION_SCALE_TO_M,
        field_scale_to_T=FIELD_SCALE_TO_T,
        gammabar_Hz_per_T=GAMMABAR_HZ_PER_T,
    )
    if request.get("center_map", True) and len(field_map.positions_m):
        bounds = np.array([field_map.positions_m.min(axis=0), field_map.positions_m.max(axis=0)])
        shift = bounds.mean(axis=0)
        field_map = FieldMap(
            positions_m=field_map.positions_m - shift,
            B_T=field_map.B_T,
            gammabar_Hz_per_T=GAMMABAR_HZ_PER_T,
            V=field_map.V,
            source_filename=field_map.source_filename,
            grid_spacing_input=field_map.grid_spacing_input,
            position_scale_to_m=POSITION_SCALE_TO_M,
            field_scale_to_T=FIELD_SCALE_TO_T,
        )
    field_map.validate()
    return field_map, str(request.get("field_map_name") or Path(path).name)


def _sample_indices(count: int):
    import numpy as np

    if count <= MAX_FIELD_POINTS:
        return np.arange(count)
    return np.linspace(0, count - 1, MAX_FIELD_POINTS).round().astype(int)


def _field_summary(field_map, source: str, indices) -> dict:
    import numpy as np

    stats = field_map.statistics()
    bounds_mm = np.asarray(stats["position_bounds_m"], dtype=float) * 1000.0
    mean_t = float(stats["mean_field_T"])
    std_ppm = 1e6 * float(stats["std_field_T"]) / abs(mean_t) if abs(mean_t) > 0 else float("inf")
    positions = field_map.positions_m[indices]
    return {
        "source": source,
        "samples": int(stats["n_points"]),
        "mean_mt": round(float(stats["mean_field_mT"]), 4),
        "p2p_mt": round(float(stats["peak_to_peak_mT"]), 4),
        "p2p_khz": round(float(stats["peak_to_peak_kHz"]), 3),
        "std_ppm": round(std_ppm, 1),
        "extent_mm": {
            "x": [round(float(bounds_mm[0, 0]), 2), round(float(bounds_mm[1, 0]), 2)],
            "y": [round(float(bounds_mm[0, 1]), 2), round(float(bounds_mm[1, 1]), 2)],
            "z": [round(float(bounds_mm[0, 2]), 2), round(float(bounds_mm[1, 2]), 2)],
        },
        "points": [[round(float(v), 5) for v in row] for row in positions],
        "before_mt": [round(float(v) * 1000.0, 5) for v in field_map.B_T[indices]],
    }


def inspect(request: dict) -> dict:
    field_map, source = _load_field(request)
    summary = _field_summary(field_map, source, _sample_indices(field_map.n_points))
    return {"ok": True, "title": "Field map", "field": summary}


def _build_geometry(request: dict):
    import numpy as np

    from shimming_geometry import CandidateTray, ShimMagnet, TrayGeometry

    tray = TrayGeometry.circular(
        float(request["diameter_mm"]) / 1000.0,
        np.array([float(request["bottom_mm"]) / 1000.0, float(request["top_mm"]) / 1000.0]),
    )
    tray.validate()
    face_m = float(request["magnet_mm"]) / 1000.0
    thick_m = float(request["thickness_mm"]) / 1000.0
    magnet = ShimMagnet(
        material="N45",
        dimensions_m=np.array([face_m, face_m, thick_m]),
        polarization_T=float(request["polarization_t"]),
    )
    magnet.validate()
    candidates = CandidateTray(
        tray_geometry=tray,
        shim_magnet=magnet,
        radial_spacing_factor=float(request["radial_spacing"]),
        azimuthal_spacing_factor=float(request["azimuthal_spacing"]),
        require_full_magnet_inside=True,
    )
    candidates.build()
    return tray, candidates


def _file_payload(path: Path) -> dict:
    return {"name": path.name, "data_b64": base64.b64encode(path.read_bytes()).decode("ascii")}


def export_trays(request: dict) -> dict:
    import numpy as np

    from shimming_export import ShimCollectionExporter, ShimTrayExporter

    tray, candidates = _build_geometry(request)
    states = np.asarray(request["states"], dtype=int)
    if len(states) != len(candidates.candidate_metadata):
        raise ValueError("The saved states do not match these tray parameters.")
    destination = request.get("destination")
    folder = Path(destination) if destination else Path(tempfile.mkdtemp(prefix="adelpha-shim-export-"))
    collection = ShimCollectionExporter(candidates, states)
    collection.build()
    collection.save(folder)
    trays = ShimTrayExporter(tray, collection.optimized_collections)
    trays.export(
        folder,
        notch=False,
        orientation_marks=True,
        positive_polarity_mark="+",
        negative_polarity_mark=None,
    )
    solution = folder / "best_solution.json"
    solution.write_text(json.dumps({"states": [int(value) for value in states]}, indent=2), encoding="utf-8")
    names = [
        "shim_tray_top.stl",
        "shim_tray_bottom.stl",
        "shim_tray_export_report.json",
        "magnet_collection_shims.pkl",
        "magnet_collection_shims_top.pkl",
        "magnet_collection_shims_bottom.pkl",
        "shim_collection_manifest.json",
        "best_solution.json",
    ]
    files = []
    for name in names:
        path = folder / name
        if path.is_file():
            files.append({"name": name} if destination else _file_payload(path))
    return {
        "ok": True,
        "title": "Shim tray export",
        "folder": str(folder) if destination else None,
        "files": files,
    }


def _ppm(report: dict) -> float:
    return round(float(report["field"]["std_ppm"]), 1)


def _p2p_mt(report: dict) -> float:
    return round(float(report["field"]["peak_to_peak_mT"]), 3)


def simulate(request: dict) -> dict:
    import time

    import numpy as np

    from shimming_basis import ShimBasis
    from shimming_optimization import ShimOptimizationProblem, ShimOptimizer
    from shimming_reporting import ShimmingReporter

    started = time.perf_counter()
    field_map, source = _load_field(request)
    _tray, candidates = _build_geometry(request)
    basis = ShimBasis(field_map, candidates)
    basis.compute()
    problem = ShimOptimizationProblem(field_map, candidates)
    problem.attach_basis(basis)
    optimizer = ShimOptimizer(
        problem,
        random_seed=2,
        n_restarts=3,
        max_greedy_steps=40,
        perturbation_sizes=(2, 3, 5),
        verbose=False,
    )
    optimizer.run()
    states = np.asarray(optimizer.best_states, dtype=int)
    reporter = ShimmingReporter(field_map, problem)
    before = reporter.evaluate(field_map.B_T, "pre_shim")
    shimmed_t = field_map.B_T + basis.field_from_states(states)
    after = reporter.evaluate(shimmed_t, "post_shim", states)
    indices = _sample_indices(field_map.n_points)
    field = _field_summary(field_map, source, indices)
    field["after_mt"] = [round(float(v) * 1000.0, 5) for v in shimmed_t[indices]]
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
        "summary": (
            "Iterated-greedy passive shim on two circular trays. "
            + ("The bore field is synthetic." if source == "synthetic" else f"The bore field is {source}.")
        ),
        "field": field,
        "diameter_mm": request["diameter_mm"],
        "bottom_mm": request["bottom_mm"],
        "top_mm": request["top_mm"],
        "magnet_mm": request["magnet_mm"],
        "thickness_mm": request["thickness_mm"],
        "polarization_t": request["polarization_t"],
        "radial_spacing": request["radial_spacing"],
        "azimuthal_spacing": request["azimuthal_spacing"],
        "pre_std_ppm": _ppm(before),
        "post_std_ppm": _ppm(after),
        "pre_p2p_mt": _p2p_mt(before),
        "post_p2p_mt": _p2p_mt(after),
        "n_positive": int(counts["n_positive"]),
        "n_negative": int(counts["n_negative"]),
        "magnet_size_mm": [request["magnet_mm"], request["magnet_mm"], request["thickness_mm"]],
        "states": [int(value) for value in states],
        "magnets": placed,
        "elapsed_s": round(time.perf_counter() - started, 3),
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: shim_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        passthrough = {k: request[k] for k in ("field_map_path", "field_map_name") if k in request}
        if request.get("mode") == "inspect":
            payload = inspect({**passthrough, "center_map": bool(request.get("center_map", True))})
        elif request.get("mode") == "export":
            payload = export_trays({**shim_request(request), "states": request["states"], **({} if not request.get("destination") else {"destination": request["destination"]})})
        else:
            payload = simulate({**shim_request(request), **passthrough})
    except Exception as exc:
        payload = {"ok": False, "error": str(exc)}
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
