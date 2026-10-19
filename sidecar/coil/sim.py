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
    try:
        from adelpha_runtime.workers import resolve_worker_python
    except ImportError:
        override = os.environ.get("COILGEN_PYTHON", "").strip()
        if override:
            return override
        root = Path(__file__).resolve().parent / ".venv"
        for candidate in (root / "bin" / "python", root / "bin" / "python3", root / "Scripts" / "python.exe"):
            if candidate.is_file():
                return str(candidate)
        return sys.executable if getattr(sys, "frozen", False) else ""
    return resolve_worker_python("COILGEN_PYTHON", Path(__file__).resolve().parent / ".venv")


def _worker_command(python: str, params: Path, result: Path) -> list[str]:
    script = Path(__file__).resolve()
    try:
        from adelpha_runtime.workers import worker_argv
        return worker_argv(python, script, str(params), str(result))
    except ImportError:
        if Path(python.replace("\\", "/")).name.lower().removesuffix(".exe") == "adelpha-python-runtime":
            return [python, "run-script", str(script), str(params), str(result)]
        return [python, str(script), str(params), str(result)]


def _release_memory() -> None:
    import gc

    try:
        import matplotlib.pyplot as plt

        plt.close("all")
    except Exception:
        pass
    gc.collect()


def run_coil(body: dict | None = None) -> dict:
    request = coil_request(body)
    python = coil_python()
    if not python:
        raise RuntimeError("pyCoilGen is not installed. The coil environment is missing.")
    try:
        with tempfile.TemporaryDirectory(prefix="adelpha-coil-") as tmp:
            params = Path(tmp) / "params.json"
            result = Path(tmp) / "result.json"
            params.write_text(json.dumps(request), encoding="utf-8")
            env = os.environ.copy()
            env["PYTHONPATH"] = ""
            env["MPLBACKEND"] = "Agg"
            env.setdefault("OPENBLAS_NUM_THREADS", "1")
            env.setdefault("VECLIB_MAXIMUM_THREADS", "1")
            env.setdefault("OMP_NUM_THREADS", "1")
            env["MPLCONFIGDIR"] = str(Path(tmp) / "mpl")
            proc = subprocess.run(
                _worker_command(python, params, result),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                timeout=180,
                cwd=tmp,
            )
            if not result.exists():
                detail = (proc.stderr or "pyCoilGen failed.").strip()
                raise RuntimeError(detail[-800:])
            payload = json.loads(result.read_text(encoding="utf-8"))
        if not payload.get("ok"):
            raise RuntimeError(str(payload.get("error") or "pyCoilGen failed."))
        return payload
    finally:
        _release_memory()


def _keep_layout(function):
    """Skipped PCB and sweep steps return None and would drop the winding."""

    def wrapped(coil_parts, input_args):
        result = function(coil_parts, input_args)
        return coil_parts if result is None else result

    return wrapped


def _capture_then(function):
    """Keep closed stream-function loops; interconnect mutates the same objects."""

    def wrapped(coil_parts, input_args):
        _capture_closed_groups(coil_parts)
        return function(coil_parts, input_args)

    return wrapped


def _capture_closed_groups(coil_parts) -> None:
    """Copy topological groups before interconnection opens and joins them."""
    import copy
    import numpy as np

    for part in coil_parts:
        if getattr(part, "_adelpha_closed_groups", None) is not None:
            continue
        groups = getattr(part, "groups", None)
        saved = []
        if groups is not None and len(groups) > 0:
            saved = copy.deepcopy(list(groups))
            for group in groups:
                loops = list(getattr(group, "loops", None) or [])
                group.loops = [copy.deepcopy(loop) for loop in loops]
        if not saved:
            contours = []
            for loop in getattr(part, "contour_lines", None) or []:
                raw = np.asarray(getattr(loop, "v", None), dtype=float)
                if raw.ndim == 2 and raw.shape[0] == 3 and raw.shape[1] >= 2 and np.isfinite(raw).all():
                    contours.append(copy.deepcopy(loop))
            if contours:
                from types import SimpleNamespace
                saved = [SimpleNamespace(loops=contours)]
        part._adelpha_closed_groups = saved


def _install_layout_guard() -> None:
    import pyCoilGen.pyCoilGen_release as release
    if __package__:
        from .pycoilgen_compat import install
    else:
        from pycoilgen_compat import install
    install()

    if getattr(release, "_adelpha_layout_guard", False):
        return
    for name in ("generate_cylindrical_pcb_print", "create_sweep_along_surface"):
        setattr(release, name, _keep_layout(getattr(release, name)))
    release.interconnect_within_groups = _keep_layout(_capture_then(release.interconnect_within_groups))
    release._adelpha_layout_guard = True


def _loop_count(solution) -> int:
    count = 0
    for part in solution.coil_parts:
        groups = _contour_groups(part)
        if groups:
            count += sum(len(getattr(group, "loops", None) or []) for group in groups)
            continue
        count += len(getattr(part, "contour_lines", None) or [])
    return count


def _contour_groups(part):
    saved = getattr(part, "_adelpha_closed_groups", None)
    if saved is not None:
        return saved
    groups = getattr(part, "groups", None)
    if groups is None or len(groups) == 0:
        return []
    return list(groups)


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
        wires.extend(_wires(part, min_length=max(_wire_scale(part_vertices.tolist()) * 0.08, 0.004)))
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


def _catmull(p0, p1, p2, p3, t: float):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )


def _nearly_planar(points) -> bool:
    import numpy as np

    center = points.mean(axis=0)
    centered = points - center
    normal = np.zeros(3)
    for index, point in enumerate(points):
        other = points[(index + 1) % len(points)]
        normal += np.array([
            (point[1] - other[1]) * (point[2] + other[2]),
            (point[2] - other[2]) * (point[0] + other[0]),
            (point[0] - other[0]) * (point[1] + other[1]),
        ])
    length = float(np.linalg.norm(normal))
    if length < 1e-18:
        return False
    normal = normal / length
    radius = float(np.max(np.linalg.norm(centered, axis=1)))
    return bool(np.all(np.abs(centered @ normal) < 0.08 * max(radius, 1e-6)))


def _fill_closed_gap(points):
    import numpy as np

    gap = float(np.linalg.norm(points[0] - points[-1]))
    edges = np.linalg.norm(np.diff(points, axis=0), axis=1)
    if len(edges) == 0:
        return points
    typical = float(np.median(edges))
    perimeter = float(edges.sum() + gap)
    if gap <= typical * 1.25 or gap > 0.55 * perimeter or not _nearly_planar(points):
        return points
    steps = max(4, min(24, int(round(gap / max(typical, 1e-6)))))
    extra = np.array([
        _catmull(points[-2], points[-1], points[0], points[1], index / steps)
        for index in range(1, steps)
    ])
    return np.vstack([points, extra])


def _closed_array(loop):
    import numpy as np

    raw = np.asarray(getattr(loop, "v", None), dtype=float)
    if raw.ndim != 2 or raw.shape[0] != 3 or raw.shape[1] < 3 or not np.isfinite(raw).all():
        return None
    points = raw.T
    if np.allclose(points[0], points[-1], atol=1e-9):
        points = points[:-1]
    if len(points) < 3:
        return None
    return _fill_closed_gap(points)


def _resample_closed(points, count: int):
    import numpy as np

    ring = np.vstack([points, points[0]])
    edge = np.linalg.norm(np.diff(ring, axis=0), axis=1)
    length = float(edge.sum())
    if not math.isfinite(length) or length < 1e-9:
        return points
    sample = np.linspace(0.0, length, int(count), endpoint=False)
    progress = np.concatenate([[0.0], np.cumsum(edge)])
    return np.column_stack([np.interp(sample, progress, ring[:, axis]) for axis in range(3)])


def _chaikin_closed(points, rounds: int = 2):
    import numpy as np

    refined = np.asarray(points, dtype=float)
    for _ in range(max(0, rounds)):
        nxt = []
        count = len(refined)
        for index in range(count):
            start = refined[index]
            end = refined[(index + 1) % count]
            nxt.append(0.75 * start + 0.25 * end)
            nxt.append(0.25 * start + 0.75 * end)
        refined = np.asarray(nxt, dtype=float)
    return refined


def _conductor_points(loop, min_length: float) -> list[list[float]] | None:
    import numpy as np

    points = _closed_array(loop)
    if points is None:
        return None
    extent = float(np.max(np.ptp(points, axis=0)))
    if not math.isfinite(extent) or extent < max(min_length * 0.45, 0.01):
        return None
    perimeter = float(np.linalg.norm(np.diff(np.vstack([points, points[0]]), axis=0), axis=1).sum())
    if not math.isfinite(perimeter) or perimeter < max(min_length, 1e-4):
        return None
    count = max(48, min(int(round(perimeter / 0.002)), 160))
    points = _resample_closed(points, count)
    points = _chaikin_closed(points, rounds=2)
    points = _resample_closed(points, max(48, min(len(points), 72)))
    return np.round(points, 6).tolist()


def _polarity_index(loop, fallback: int = 0) -> int:
    value = getattr(loop, "potential", None)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(number):
        return fallback
    return 0 if number >= 0 else 1


def _usable_loop(loop, require_uv: bool = False) -> bool:
    import numpy as np

    vertices = np.asarray(getattr(loop, "v", None), dtype=float)
    if vertices.ndim != 2 or vertices.shape[0] != 3 or vertices.shape[1] < 4 or not np.isfinite(vertices).all():
        return False
    uv = getattr(loop, "uv", None)
    if uv is None:
        return not require_uv
    surface = np.asarray(uv, dtype=float)
    return surface.ndim == 2 and surface.shape[0] >= 2 and surface.shape[1] >= 4 and np.isfinite(surface).all()


def _polarity_groups(groups, require_uv: bool = False) -> list:
    """Collapse nested topological groups into opposite-current families."""
    from types import SimpleNamespace

    buckets: list[list] = [[], []]
    saw_potential = False
    original = []
    for group_index, group in enumerate(groups or []):
        kept = [loop for loop in (getattr(group, "loops", None) or []) if _usable_loop(loop, require_uv=require_uv)]
        if not kept:
            continue
        original.append(SimpleNamespace(loops=kept))
        for loop in kept:
            if getattr(loop, "potential", None) is not None:
                saw_potential = True
            buckets[_polarity_index(loop, group_index % 2)].append(loop)
    if not saw_potential:
        return original
    return [SimpleNamespace(loops=loops) for loops in buckets if loops]


def _wires(part, min_length: float = 0.004) -> list[dict]:
    wires: list[dict] = []
    for group_index, group in enumerate(_polarity_groups(_contour_groups(part))):
        for loop in getattr(group, "loops", None) or []:
            points = _conductor_points(loop, min_length)
            if points is None:
                continue
            wires.append({"group": int(group_index), "closed": True, "points": points})
    if wires:
        return wires
    raise RuntimeError(
        "pyCoilGen did not produce finite closed conductor loops. Adjust the contour count or former dimensions and retry."
    )


def _tube_triangles(points, radius: float, sides: int = 10):
    import numpy as np

    ring = np.asarray(points, dtype=float)
    count = len(ring)
    tangents = np.zeros_like(ring)
    for index in range(count):
        tangent = ring[(index + 1) % count] - ring[(index - 1) % count]
        length = np.linalg.norm(tangent)
        tangents[index] = tangent / length if length > 1e-15 else np.array([1.0, 0.0, 0.0])
    helper = np.array([0.0, 0.0, 1.0]) if abs(tangents[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    normal = np.cross(tangents[0], helper)
    normal = normal / np.linalg.norm(normal)
    shells = []
    angles = np.linspace(0.0, 2.0 * math.pi, sides, endpoint=False)
    for index in range(count):
        tangent = tangents[index]
        binormal = np.cross(tangent, normal)
        length = np.linalg.norm(binormal)
        if length < 1e-15:
            continue
        binormal = binormal / length
        normal = np.cross(binormal, tangent)
        normal = normal / np.linalg.norm(normal)
        shells.append(ring[index] + radius * (np.cos(angles)[:, None] * normal + np.sin(angles)[:, None] * binormal))
    triangles = []
    for index, shell in enumerate(shells):
        nxt = shells[(index + 1) % len(shells)]
        for side in range(sides):
            other = (side + 1) % sides
            for a, b, c in ((shell[side], shell[other], nxt[side]), (shell[other], nxt[other], nxt[side])):
                crossed = np.cross(b - a, c - a)
                length = np.linalg.norm(crossed)
                face = crossed / length if length > 1e-18 else np.array([0.0, 0.0, 1.0])
                triangles.append((face, a, b, c))
    return triangles


def _binary_stl(triangles) -> bytes:
    import struct

    payload = bytearray(b"Adelpha gradient winding loops".ljust(80, b"\0"))
    payload.extend(struct.pack("<I", len(triangles)))
    for normal, a, b, c in triangles:
        payload.extend(struct.pack("<12fH", *normal, *a, *b, *c, 0))
    return bytes(payload)


def _winding_stl(wires: list[dict], radius: float) -> bytes:
    millimetres = max(radius, 1e-4) * 1000.0
    triangles = []
    for wire in wires:
        points = [[axis * 1000.0 for axis in point] for point in wire["points"]]
        if len(points) < 4:
            continue
        triangles.extend(_tube_triangles(points, millimetres))
    if not triangles:
        raise RuntimeError("Could not build an STL solid from the winding loops.")
    return _binary_stl(triangles)


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


CONTOUR_COLOURS = ["#6ea8ff", "#e07070"]


def _for_contour_plots(solution):
    """Restore closed opposite-current groups so PNG figures match the 3D view."""
    from copy import copy

    plotted = copy(solution)
    plotted.coil_parts = [copy(part) for part in solution.coil_parts]
    for part in plotted.coil_parts:
        saved = getattr(part, "_adelpha_closed_groups", None)
        if saved is not None:
            part.groups = _polarity_groups(saved, require_uv=True)
    return plotted


def _figure_png(plot, solution, title: str) -> str:
    import base64
    from io import BytesIO

    import matplotlib.pyplot as plt

    figures = Path.cwd() / "figures"
    figures.mkdir(exist_ok=True)
    try:
        plot([solution], 0, title, save_dir=str(figures), dpi=160, group_colours=CONTOUR_COLOURS)
        _relax_flat_axes()
        buffer = BytesIO()
        plt.gcf().savefig(buffer, format="png", dpi=160, bbox_inches="tight", facecolor="white")
        return base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return ""
    finally:
        plt.close("all")


def _finite_metric(value) -> float | None:
    if value is None:
        return None
    number = abs(float(value))
    if not math.isfinite(number):
        return None
    return round(number, 4)


def _mean_gradient_mt_m(solution) -> float | None:
    gradient = getattr(solution, "coil_gradient", None)
    if gradient is None:
        return None
    value = _finite_metric(getattr(gradient, "mean_gradient_in_target_direction", None))
    if value is None:
        return None
    return round(value, 3)


def _mean_error(solution) -> float | None:
    errors = getattr(solution, "solution_errors", None)
    if errors is None:
        return None
    values = getattr(errors, "field_error_vals", None)
    if values is None:
        return None
    # Studio shows closed stream-function contours, not the interconnected path.
    value = getattr(values, "mean_rel_error_unconnected_contours_vs_target", None)
    if value is None:
        value = getattr(values, "mean_rel_error_layout_vs_target", None)
    return _finite_metric(value)


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
        "target_region_resolution": 10,
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
        "smooth_factor": 2,
        "tikhonov_reg_factor": 10,
        "min_loop_significance": 3,
        "interconnection_cut_width": max(0.004, scale * 0.03),
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
        args.update(_contour_former_profile())
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
        # Adapt examples/biplanar_xgradient.py (X/Y) and
        # examples/biplanar_gradient.py (Z). Keep the user's dimensions,
        # strength and contour count, rather than the examples' fixed STL.
        args.update(_biplanar_profile(request))
        args["coil_mesh"] = "create bi-planar mesh"
        args["biplanar_mesh_parameter_list"] = [
            float(request["height_mm"]) / 1000.0,
            float(request["width_mm"]) / 1000.0,
            10,
            10,
            0,
            0,
            1,
            0,
            0,
            0,
            float(request["gap_mm"]) / 1000.0,
        ]
    else:
        args.update(_contour_former_profile())
        args["coil_mesh"] = "create circular mesh"
        args["circular_mesh_parameter_list"] = [
            float(request["radius_mm"]) / 1000.0,
            20,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    return args


def _contour_former_profile() -> dict:
    """Single-plate preview with the imaging sphere centred on the former."""
    return {
        "target_region_resolution": 10,
        "iteration_num_mesh_refinement": 1,
        "level_set_method": "primary",
        "surface_is_cylinder_flag": False,
        "set_roi_into_mesh_center": True,
        "smooth_factor": 3,
        "min_loop_significance": 5,
    }


def _biplanar_profile(request: dict) -> dict:
    """Headless contour synthesis adapted from the local pyCoilGen examples.

    The planar example's fabrication/spiral extraction is deliberately not
    invoked: Studio displays optimized contours, not manufacturing toolpaths.
    One refinement of a 10 x 10 grid retains the existing 20 x 20 density.
    """
    longitudinal = request["axis"] == "z"
    return {
        "target_region_resolution": 10,
        "iteration_num_mesh_refinement": 1,
        "level_set_method": "primary",
        "surface_is_cylinder_flag": False,
        "smooth_factor": 3,
        "min_loop_significance": 5,
        "pot_offset_factor": 0.35 if longitudinal else 0.25,
        "tikhonov_reg_factor": 200 if longitudinal else 10,
        "sf_opt_method": "Iterative" if longitudinal else "tikhonov",
        "minimize_method_parameters": "{'tol': 1e-9}",
        "minimize_method_options": "{'disp': False, 'maxiter': 5}",
        "interconnection_cut_width": max(0.004, _scale_m(request) * 0.03),
        "normal_shift_length": 0.002 if longitudinal else _scale_m(request) * 0.02,
    }


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
    layout = _layout(solution)
    plotted = _for_contour_plots(solution)
    title = NAMES[request["axis"]]
    layout_png = _figure_png(plot_3D_contours_with_sf, plotted, title)
    surface = _figure_png(plot_2D_contours_with_sf, plotted, title)
    mean_error = _mean_error(solution)
    achieved = _mean_gradient_mt_m(solution)
    payload = {
        "ok": True,
        "generator_version": 5,
        "connected_path_count": len(layout["wires"]),
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
        "achieved_mt_m": achieved,
        "mean_field_error": mean_error,
        "error_definition": "Mean absolute Bz error / peak target Bz (percent), closed conductor loops at contour current" if mean_error is not None else None,
        "target_region_radius_mm": round(_target_radius(request) * 1000.0, 1),
        "layout": layout,
        "layout_png": layout_png,
        "surface_png": surface,
        "loop_count": len(layout["wires"]),
        "elapsed_s": round(time.perf_counter() - started, 3),
    }
    del solution, plotted
    _release_memory()
    return payload


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: coil_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        payload = simulate(request)
    except Exception as exc:
        import traceback

        detail = traceback.format_exc().strip().splitlines()
        payload = {"ok": False, "error": f"{exc}\n{detail[-1]}" if detail else str(exc)}
    finally:
        _release_memory()
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
