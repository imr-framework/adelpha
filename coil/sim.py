"""Gradient-coil windings from pyCoilGen.

The Engineering Studio calls this for an X, Y, or Z gradient on a cylinder,
a planar plate, a biplanar pair, or a circular plate.
pyCoilGen lives in coil/.venv so its NumPy 1 pin stays out of the API process.
Source: https://github.com/sairamgeethanath/pyCoilGen/tree/master
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

AXES = ("x", "y", "z")
SHAPES = ("cylinder", "planar", "biplanar", "circular")
NAMES = {"x": "X gradient", "y": "Y gradient", "z": "Z gradient"}
SUMMARIES = {
    "cylinder": "pyCoilGen stream function and wire groups on a cylinder.",
    "planar": "pyCoilGen stream function and wire groups on a planar plate.",
    "biplanar": "pyCoilGen stream function and wire groups on a biplanar pair.",
    "circular": "pyCoilGen stream function and wire groups on a circular plate.",
}

DEFAULTS = {
    "shape": "cylinder",
    "axis": "y",
    "radius_mm": 140.0,
    "length_mm": 280.0,
    "width_mm": 250.0,
    "height_mm": 250.0,
    "gap_mm": 200.0,
    "levels": 10,
    "gradient_mt_m": 10.0,
}

LIMITS = {
    "radius_mm": (80.0, 300.0),
    "length_mm": (120.0, 600.0),
    "width_mm": (80.0, 500.0),
    "height_mm": (80.0, 500.0),
    "gap_mm": (40.0, 400.0),
    "levels": (4, 20),
    "gradient_mt_m": (1.0, 40.0),
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


def coil_request(body: dict | None) -> dict:
    payload = body or {}
    axis = str(payload.get("axis") or DEFAULTS["axis"]).lower()
    shape = str(payload.get("shape") or DEFAULTS["shape"]).lower()
    if axis not in AXES:
        raise ValueError("Choose an X, Y, or Z gradient.")
    if shape not in SHAPES:
        raise ValueError("Choose a cylinder, planar, biplanar, or circular former.")
    return {
        "shape": shape,
        "axis": axis,
        "radius_mm": _number(payload, "radius_mm"),
        "length_mm": _number(payload, "length_mm"),
        "width_mm": _number(payload, "width_mm"),
        "height_mm": _number(payload, "height_mm"),
        "gap_mm": _number(payload, "gap_mm"),
        "levels": int(round(_number(payload, "levels"))),
        "gradient_mt_m": _number(payload, "gradient_mt_m"),
    }


def coil_python() -> str:
    override = os.environ.get("COILGEN_PYTHON", "").strip()
    if override:
        return override
    candidate = Path(__file__).resolve().parents[3] / "coil" / ".venv" / "bin" / "python"
    if candidate.is_file():
        return str(candidate)
    return ""


def run_coil(body: dict | None = None) -> dict:
    request = coil_request(body)
    python = coil_python()
    if not python:
        raise RuntimeError("pyCoilGen is not installed. The coil environment is missing.")
    with tempfile.TemporaryDirectory(prefix="adelpha-coil-") as tmp:
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
            detail = (proc.stderr or proc.stdout or "pyCoilGen failed.").strip()
            raise RuntimeError(detail[-800:])
        payload = json.loads(result.read_text(encoding="utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(str(payload.get("error") or "pyCoilGen failed."))
    return payload


def _keep_layout(function):
    """Skipped PCB and sweep steps return None and would drop the winding."""

    def wrapped(coil_parts, input_args):
        result = function(coil_parts, input_args)
        return coil_parts if result is None else result

    return wrapped


def _keep_groups(function):
    """A flat plate has no cylinder cut, so keep the grouped loops instead."""

    def wrapped(coil_parts, input_args, *args, **kwargs):
        if not getattr(input_args, "surface_is_cylinder_flag", True):
            return coil_parts
        try:
            result = function(coil_parts, input_args, *args, **kwargs)
        except ValueError as exc:
            if "Opening of loop" not in str(exc):
                raise
            return coil_parts
        return coil_parts if result is None else result

    return wrapped


def _shift_if_connected(function):
    def wrapped(coil_parts, input_args):
        if any(getattr(part, "wire_path", None) is None for part in coil_parts):
            return coil_parts
        result = function(coil_parts, input_args)
        return coil_parts if result is None else result

    return wrapped


def _field_from_loops(function):
    def wrapped(coil_parts, input_args, target_field, sf_b_field):
        missing = any(getattr(part, "wire_path", None) is None for part in coil_parts)
        previous = input_args.skip_postprocessing
        if missing:
            input_args.skip_postprocessing = True
        try:
            return function(coil_parts, input_args, target_field, sf_b_field)
        finally:
            input_args.skip_postprocessing = previous

    return wrapped


def _install_layout_guard() -> None:
    import pyCoilGen.pyCoilGen_release as release

    if getattr(release, "_adelpha_layout_guard", False):
        return
    for name in ("generate_cylindrical_pcb_print", "create_sweep_along_surface"):
        setattr(release, name, _keep_layout(getattr(release, name)))
    release.interconnect_within_groups = _keep_groups(release.interconnect_within_groups)
    release.interconnect_among_groups = _keep_groups(release.interconnect_among_groups)
    release.shift_return_paths = _shift_if_connected(release.shift_return_paths)
    release.evaluate_field_errors = _field_from_loops(release.evaluate_field_errors)
    release._adelpha_layout_guard = True


def _loop_count(solution) -> int:
    count = 0
    for part in solution.coil_parts:
        groups = getattr(part, "groups", None)
        if groups is None or len(groups) == 0:
            count += len(getattr(part, "contour_lines", None) or [])
            continue
        count += sum(len(getattr(group, "loops", None) or []) for group in groups)
    return count


def _layout(solution) -> dict:
    """Mesh, stream-function colors, and grouped wires from pyCoilGen's 3D figure."""
    import numpy as np
    from matplotlib import colormaps

    vertices: list[list[float]] = []
    faces: list[list[int]] = []
    colors: list[list[float]] = []
    wires: list[dict] = []
    stream_min = None
    stream_max = None
    for part in solution.coil_parts:
        mesh = part.coil_mesh
        part_vertices = np.asarray(mesh.v, dtype=float)
        part_faces = np.asarray(mesh.f, dtype=int)
        if part_vertices.ndim != 2 or part_vertices.shape[1] != 3 or part_faces.size == 0:
            continue
        offset = len(vertices)
        stream = np.asarray(part.stream_function, dtype=float).reshape(-1)
        low = float(np.min(stream))
        high = float(np.max(stream))
        stream_min = low if stream_min is None else min(stream_min, low)
        stream_max = high if stream_max is None else max(stream_max, high)
        span = high - low
        normed = np.zeros_like(stream) if span < 1e-12 else (stream - low) / span
        painted = colormaps["viridis"](np.clip(normed, 0.0, 1.0))[:, :3]
        vertices.extend(np.round(part_vertices, 5).tolist())
        colors.extend(np.round(painted, 3).tolist())
        for face in part_faces:
            faces.append([int(face[0]) + offset, int(face[1]) + offset, int(face[2]) + offset])
        wires.extend(_wires(part))
    if not vertices or not faces:
        raise RuntimeError("pyCoilGen did not return a coil surface.")
    return {
        "vertices": vertices,
        "faces": faces,
        "colors": colors,
        "wires": wires,
        "wire_radius": round(max(_wire_scale(vertices) * 0.011, 1e-4), 5),
        "stream_min": round(float(stream_min or 0.0), 2),
        "stream_max": round(float(stream_max or 0.0), 2),
    }


def _wire_scale(vertices: list[list[float]]) -> float:
    import numpy as np

    points = np.asarray(vertices, dtype=float)
    return float(np.max(np.ptp(points, axis=0))) * 0.5


def _offset_wire(points, vertices, lift: float):
    import numpy as np

    span = np.ptp(vertices, axis=0)
    longest = float(np.max(span))
    if longest > 1e-6 and float(np.min(span)) < longest * 0.2:
        axis = int(np.argmin(span))
        sign = 1.0
        center = float(np.mean(vertices[:, axis]))
        if abs(center) > lift and center < 0.0:
            sign = -1.0
        points[axis] += sign * lift
        return points
    radial = np.maximum(np.hypot(points[0], points[1]), 1e-9)
    points[0] += points[0] / radial * lift
    points[1] += points[1] / radial * lift
    return points


def _wires(part) -> list[dict]:
    import numpy as np

    vertices = np.asarray(part.coil_mesh.v, dtype=float)
    scale = max(float(np.max(np.ptp(vertices, axis=0))) * 0.5, 1e-4)
    lift = max(scale * 0.022, 1e-4)

    groups = getattr(part, "groups", None)
    selected: list[tuple[int, object]] = []
    if groups is not None and len(groups):
        for index, group in enumerate(groups):
            for loop in getattr(group, "loops", None) or []:
                selected.append((int(index), loop))
    else:
        for index, loop in enumerate(getattr(part, "contour_lines", None) or []):
            selected.append((int(index), loop))
    wires: list[dict] = []
    for index, loop in selected:
        raw = np.asarray(getattr(loop, "v", None), dtype=float)
        if raw.ndim != 2 or raw.shape[0] != 3 or raw.shape[1] < 2:
            continue
        points = _offset_wire(raw.copy(), vertices, lift)
        gap = float(np.linalg.norm(points[:, 0] - points[:, -1]))
        closed = gap < max(lift, 1e-4)
        if closed and gap < 1e-5 and points.shape[1] > 3:
            points = points[:, :-1]
        wires.append(
            {
                "group": index % 10,
                "closed": closed and int(points.shape[1]) > 2,
                "points": np.round(points, 5).T.tolist(),
            }
        )
    return wires


def _relax_flat_axes() -> None:
    """Give a flat plate a readable camera in pyCoilGen's 3D figure."""
    import matplotlib.pyplot as plt

    axes = plt.gca()
    if not hasattr(axes, "get_zlim"):
        return
    getters = (axes.get_xlim, axes.get_ylim, axes.get_zlim)
    setters = (axes.set_xlim, axes.set_ylim, axes.set_zlim)
    limits = [getter() for getter in getters]
    spans = [abs(high - low) for low, high in limits]
    longest = max(spans)
    if longest <= 0 or min(spans) > longest * 0.05:
        return
    for span, (low, high), setter in zip(spans, limits, setters):
        if span < longest * 0.05:
            mid = (low + high) / 2
            pad = longest * 0.08
            setter(mid - pad, mid + pad)
    axes.view_init(elev=28, azim=-58)


def _figure_png(plot, solution, title: str) -> str:
    import base64
    from io import BytesIO

    import matplotlib.pyplot as plt

    figures = Path.cwd() / "figures"
    figures.mkdir(exist_ok=True)
    plot([solution], 0, title, save_dir=str(figures), dpi=160)
    _relax_flat_axes()
    buffer = BytesIO()
    plt.gcf().savefig(buffer, format="png", dpi=160, bbox_inches="tight", facecolor="white")
    plt.close("all")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _mean_gradient_mt_m(solution) -> float | None:
    gradient = getattr(solution, "coil_gradient", None)
    if gradient is None:
        return None
    value = getattr(gradient, "mean_gradient_in_target_direction", None)
    if value is None:
        return None
    return round(abs(float(value)), 3)


def _mean_error(solution) -> float | None:
    errors = getattr(solution, "solution_errors", None)
    if errors is None:
        return None
    values = getattr(errors, "field_error_vals", None)
    if values is None:
        return None
    value = getattr(values, "mean_rel_error_layout_vs_target", None)
    if value is None:
        return None
    return round(float(value), 4)


def _scale_m(request: dict) -> float:
    shape = request["shape"]
    if shape in ("cylinder", "circular"):
        return float(request["radius_mm"]) / 1000.0
    return min(float(request["width_mm"]), float(request["height_mm"])) / 2000.0


def _target_radius(request: dict) -> float:
    shape = request["shape"]
    if shape == "cylinder":
        radius_m = float(request["radius_mm"]) / 1000.0
        length_m = float(request["length_mm"]) / 1000.0
        return min(radius_m * 0.45, length_m * 0.22)
    if shape == "circular":
        return float(request["radius_mm"]) / 1000.0 * 0.35
    footprint = min(float(request["width_mm"]), float(request["height_mm"])) / 1000.0 * 0.28
    if shape == "biplanar":
        return min(footprint, float(request["gap_mm"]) / 1000.0 * 0.35)
    return footprint


def _pycoilgen_args(request: dict, work: Path) -> dict:
    shape = request["shape"]
    scale = _scale_m(request)
    args = {
        "coil_mesh_file": "none",
        "field_shape_function": request["axis"],
        "levels": int(request["levels"]),
        "target_region_resolution": 5,
        "target_region_radius": _target_radius(request),
        "iteration_num_mesh_refinement": 0,
        "skip_postprocessing": False,
        "skip_inductance_calculation": True,
        "skip_sweep": True,
        "make_cylindrical_pcb": False,
        "save_stl_flag": False,
        "debug": 0,
        "force_cut_selection": ["high"],
        "pot_offset_factor": 0.25,
        "secondary_target_weight": 0.5,
        "set_roi_into_mesh_center": True,
        "tikhonov_reg_factor": 10,
        "interconnection_cut_width": max(0.01, scale * 0.08),
        "normal_shift_length": max(0.002, scale * 0.02),
        "target_gradient_strength": float(request["gradient_mt_m"]) / 1000.0,
        "surface_is_cylinder_flag": shape == "cylinder",
        "output_directory": str(work / "images"),
        "persistence_dir": str(work / "debug"),
        "project_name": f"{request['axis']}_{shape}",
    }
    if shape == "cylinder":
        args["coil_mesh"] = "create cylinder mesh"
        args["cylinder_mesh_parameter_list"] = [
            float(request["length_mm"]) / 1000.0,
            float(request["radius_mm"]) / 1000.0,
            48,
            24,
            1,
            0,
            0,
            0,
        ]
    elif shape == "planar":
        args["coil_mesh"] = "create planar mesh"
        args["planar_mesh_parameter_list"] = [
            float(request["height_mm"]) / 1000.0,
            float(request["width_mm"]) / 1000.0,
            24,
            24,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    elif shape == "biplanar":
        args["coil_mesh"] = "create bi-planar mesh"
        args["biplanar_mesh_parameter_list"] = [
            float(request["height_mm"]) / 1000.0,
            float(request["width_mm"]) / 1000.0,
            20,
            20,
            1,
            0,
            0,
            0,
            0,
            0,
            float(request["gap_mm"]) / 1000.0,
        ]
    else:
        args["coil_mesh"] = "create circular mesh"
        args["circular_mesh_parameter_list"] = [
            float(request["radius_mm"]) / 1000.0,
            22,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    return args


def simulate(request: dict) -> dict:
    import logging
    import time

    from pyCoilGen.plotting.plot_2D_contours_with_sf import plot_2D_contours_with_sf
    from pyCoilGen.plotting.plot_3D_contours_with_sf import plot_3D_contours_with_sf
    from pyCoilGen.pyCoilGen_release import pyCoilGen

    logging.basicConfig(level=logging.ERROR)
    log = logging.getLogger("adelpha.coil")
    _install_layout_guard()
    work = Path.cwd()
    started = time.perf_counter()
    solution = pyCoilGen(log, _pycoilgen_args(request, work))
    if solution is None or not getattr(solution, "coil_parts", None):
        raise RuntimeError("pyCoilGen did not return a coil layout.")
    title = NAMES[request["axis"]]
    layout_png = _figure_png(plot_3D_contours_with_sf, solution, title)
    surface = _figure_png(plot_2D_contours_with_sf, solution, title)
    return {
        "ok": True,
        "shape": request["shape"],
        "axis": request["axis"],
        "title": title,
        "summary": SUMMARIES[request["shape"]],
        "radius_mm": request["radius_mm"],
        "length_mm": request["length_mm"],
        "width_mm": request["width_mm"],
        "height_mm": request["height_mm"],
        "gap_mm": request["gap_mm"],
        "levels": int(request["levels"]),
        "gradient_mt_m": request["gradient_mt_m"],
        "achieved_mt_m": _mean_gradient_mt_m(solution),
        "mean_field_error": _mean_error(solution),
        "layout": _layout(solution),
        "layout_png": layout_png,
        "surface_png": surface,
        "loop_count": _loop_count(solution),
        "elapsed_s": round(time.perf_counter() - started, 3),
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: coil_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        payload = simulate(request)
    except Exception as exc:
        payload = {"ok": False, "error": str(exc)}
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
