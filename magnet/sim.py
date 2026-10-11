"""Assembly magnetostatics and Elmer FEM for Engineering Studio.

The desk sends included part instances, world transforms, and engineering
properties. Visibility and selection are not part of the physical model.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

MU0 = 4.0e-7 * math.pi
ROLES = ("permanent_magnet", "magnetic_yoke", "conductor", "nonmagnetic_structure")
MAGNET_MODELS = ("dipole", "cuboid")
APPROXIMATIONS = ("imported_mesh", "oriented_box")
EXAMPLE_HALBACH = "example-halbach-8"


def _finite(value: Any, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number.") from exc
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number.")
    return number


def _vec3(value: Any, name: str) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError(f"{name} must be a 3-vector.")
    return [_finite(item, name) for item in value]


def _matrix(value: Any) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 16:
        raise ValueError("worldMatrix must have 16 numbers.")
    return [_finite(item, "worldMatrix") for item in value]


def _normalize(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(item * item for item in vector))
    if length < 1e-15:
        return [0.0, 0.0, 1.0]
    return [item / length for item in vector]


def _rotation(matrix: list[float]) -> list[list[float]]:
    cols = [
        _normalize([matrix[0], matrix[1], matrix[2]]),
        _normalize([matrix[4], matrix[5], matrix[6]]),
        _normalize([matrix[8], matrix[9], matrix[10]]),
    ]
    return [
        [cols[0][0], cols[1][0], cols[2][0]],
        [cols[0][1], cols[1][1], cols[2][1]],
        [cols[0][2], cols[1][2], cols[2][2]],
    ]


def rotate_local(local: list[float], matrix: list[float]) -> list[float]:
    rot = _rotation(matrix)
    return _normalize(
        [
            rot[0][0] * local[0] + rot[0][1] * local[1] + rot[0][2] * local[2],
            rot[1][0] * local[0] + rot[1][1] * local[1] + rot[1][2] * local[2],
            rot[2][0] * local[0] + rot[2][1] * local[1] + rot[2][2] * local[2],
        ]
    )


def world_magnetization(part: dict) -> list[float] | None:
    local = part.get("magnetizationWorld")
    if isinstance(local, (list, tuple)) and len(local) == 3:
        try:
            return _normalize([float(item) for item in local])
        except (TypeError, ValueError):
            pass
    direction = part.get("magnetizationLocal")
    if not isinstance(direction, (list, tuple)) or len(direction) != 3:
        return None
    try:
        local = [float(item) for item in direction]
    except (TypeError, ValueError):
        return None
    if part.get("magnetizationFrame") == "world":
        return _normalize(local)
    return rotate_local(local, _matrix(part.get("worldMatrix") or [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))


def example_halbach_parts() -> list[dict]:
    """Labeled 8-cube Halbach ring. Used only when the desk asks for this example."""
    size = [0.02, 0.02, 0.02]
    radius = 0.08
    parts = []
    for index in range(8):
        angle = index * math.pi / 4.0
        mag_angle = 2.0 * angle
        cx = radius * math.cos(angle)
        cy = radius * math.sin(angle)
        matrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            cx, cy, 0, 1,
        ]
        parts.append(
            {
                "instanceId": f"example-halbach::{index}",
                "partId": "example-halbach",
                "cadName": f"Example Halbach cube {index + 1}",
                "sourceAssetId": EXAMPLE_HALBACH,
                "geometryRevision": "example-halbach-8",
                "worldMatrix": matrix,
                "translationM": [cx, cy, 0.0],
                "sizeM": size,
                "units": "m",
                "role": "permanent_magnet",
                "remanenceT": 1.2,
                "magnetizationLocal": [math.cos(mag_angle), math.sin(mag_angle), 0.0],
                "magnetizationFrame": "world",
                "relativePermeability": 1.05,
                "conductivitySPerM": 0.0,
            }
        )
    return parts


def parse_parts(body: dict) -> list[dict]:
    example = str(body.get("example_id") or "").strip()
    if example == EXAMPLE_HALBACH:
        return example_halbach_parts()
    raw = body.get("parts")
    if not isinstance(raw, list):
        raise ValueError("Send the included assembly parts.")
    parts = []
    for index, row in enumerate(raw):
        if not isinstance(row, dict):
            raise ValueError(f"Part {index} is not an object.")
        instance_id = str(row.get("instanceId") or row.get("partId") or "").strip()
        if not instance_id:
            raise ValueError(f"Part {index} is missing instanceId.")
        role = row.get("role")
        if role is not None and role not in ROLES:
            raise ValueError(f"{instance_id} has an unknown engineering role.")
        matrix = _matrix(row.get("worldMatrix") or [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        size = _vec3(row.get("sizeM") or [0, 0, 0], "sizeM")
        translation = _vec3(row.get("translationM") or [matrix[12], matrix[13], matrix[14]], "translationM")
        units = "mm" if row.get("units") == "mm" else "m"
        if units == "mm":
            size = [item * 1e-3 for item in size]
            translation = [item * 1e-3 for item in translation]
            matrix = list(matrix)
            matrix[12] *= 1e-3
            matrix[13] *= 1e-3
            matrix[14] *= 1e-3
        remanence = row.get("remanenceT")
        parts.append(
            {
                "instanceId": instance_id,
                "partId": str(row.get("partId") or instance_id),
                "cadName": str(row.get("cadName") or instance_id),
                "sourceAssetId": str(row.get("sourceAssetId") or ""),
                "geometryRevision": str(row.get("geometryRevision") or ""),
                "worldMatrix": matrix,
                "translationM": translation,
                "sizeM": size,
                "units": "m",
                "role": role,
                "remanenceT": None if remanence is None else _finite(remanence, "remanenceT"),
                "magnetizationLocal": row.get("magnetizationLocal"),
                "magnetizationWorld": row.get("magnetizationWorld"),
                "magnetizationFrame": "world" if row.get("magnetizationFrame") == "world" else "local",
                "relativePermeability": None
                if row.get("relativePermeability") is None
                else _finite(row.get("relativePermeability"), "relativePermeability"),
                "conductivitySPerM": None
                if row.get("conductivitySPerM") is None
                else _finite(row.get("conductivitySPerM"), "conductivitySPerM"),
                "closed": row.get("closed"),
                "triangleCount": int(row.get("triangleCount") or 0),
                "boundaryEdges": int(row.get("boundaryEdges") or 0),
                "degenerateFaces": int(row.get("degenerateFaces") or 0),
            }
        )
    return parts


def parse_roi(body: dict) -> dict:
    raw = body.get("roi") or {}
    center = _vec3(raw.get("centerM") or [0, 0, 0], "roi.centerM")
    size = _vec3(raw.get("sizeM") or [0.08, 0.08, 0.08], "roi.sizeM")
    samples = raw.get("samples") or [17, 17, 17]
    if not isinstance(samples, (list, tuple)) or len(samples) != 3:
        raise ValueError("roi.samples must be three integers.")
    counts = [max(3, min(41, int(item))) for item in samples]
    if any(item <= 0 for item in size):
        raise ValueError("The ROI size must be positive.")
    return {"centerM": center, "sizeM": size, "samples": counts}


def parse_mesh(body: dict) -> dict:
    raw = body.get("mesh") or {}
    approximation = raw.get("approximation") or "oriented_box"
    if approximation not in APPROXIMATIONS:
        raise ValueError("Choose imported_mesh or oriented_box.")
    grid = raw.get("grid") or [16, 16, 16]
    if not isinstance(grid, (list, tuple)) or len(grid) != 3:
        raise ValueError("mesh.grid must be three integers.")
    return {
        "approximation": approximation,
        "airPaddingM": max(0.005, _finite(raw.get("airPaddingM") or 0.04, "airPaddingM")),
        "grid": [max(6, min(32, int(item))) for item in grid],
    }


def diagnostics_for(parts: list[dict], study: str, mesh: dict | None = None) -> list[dict]:
    issues = []
    if not parts:
        issues.append(
            {
                "instanceId": "",
                "partId": "",
                "severity": "error",
                "code": "NO_INCLUDED_PARTS",
                "message": "No assembly parts are added to simulation.",
                "correction": "Add the magnets and magnetic structures that should enter the physical model.",
            }
        )
        return issues
    magnets = [part for part in parts if part["role"] == "permanent_magnet"]
    if study in {"magnet", "fem"} and not magnets:
        issues.append(
            {
                "instanceId": "",
                "partId": "",
                "severity": "error",
                "code": "NO_MAGNETS",
                "message": "The included set has no permanent magnets.",
                "correction": "Assign the permanent-magnet role and remanence, or exclude unrelated parts.",
            }
        )
    for part in parts:
        name = part["cadName"]
        if part["role"] is None:
            issues.append(
                {
                    "instanceId": part["instanceId"],
                    "partId": part["partId"],
                    "severity": "error",
                    "code": "MISSING_ROLE",
                    "message": f"{name} is included but has no engineering role.",
                    "correction": "Assign a role or exclude the part before running.",
                }
            )
            continue
        if part["role"] == "permanent_magnet":
            if part["remanenceT"] is None or part["remanenceT"] <= 0:
                issues.append(
                    {
                        "instanceId": part["instanceId"],
                        "partId": part["partId"],
                        "severity": "error",
                        "code": "MISSING_REMANENCE",
                        "message": f"{name} is a permanent magnet without remanence.",
                        "correction": "Enter remanence in tesla, or exclude the part.",
                    }
                )
            if world_magnetization(part) is None:
                issues.append(
                    {
                        "instanceId": part["instanceId"],
                        "partId": part["partId"],
                        "severity": "error",
                        "code": "MISSING_MAGNETIZATION",
                        "message": f"{name} has no magnetization direction.",
                        "correction": "Set a local or world-frame direction.",
                    }
                )
        if part["role"] == "magnetic_yoke" and study == "fem":
            mu = part["relativePermeability"]
            if mu is None or mu <= 0:
                issues.append(
                    {
                        "instanceId": part["instanceId"],
                        "partId": part["partId"],
                        "severity": "error",
                        "code": "MISSING_PERMEABILITY",
                        "message": f"{name} is a yoke without relative permeability.",
                        "correction": "Enter μr or exclude the part.",
                    }
                )
        if any(item <= 0 for item in part["sizeM"]):
            issues.append(
                {
                    "instanceId": part["instanceId"],
                    "partId": part["partId"],
                    "severity": "error",
                    "code": "INVALID_DIMENSIONS",
                    "message": f"{name} has a non-positive bounding box.",
                    "correction": "Check nested transforms and imported units.",
                }
            )
        if mesh and mesh["approximation"] == "imported_mesh" and study == "fem":
            if part["closed"] is False:
                issues.append(
                    {
                        "instanceId": part["instanceId"],
                        "partId": part["partId"],
                        "severity": "error",
                        "code": "OPEN_SURFACE",
                        "message": f"{name} is not a closed volume.",
                        "correction": "Repair the GLB solid, or choose the oriented-box approximation.",
                    }
                )
            if part["triangleCount"] < 4:
                issues.append(
                    {
                        "instanceId": part["instanceId"],
                        "partId": part["partId"],
                        "severity": "error",
                        "code": "NO_VOLUME_MESH",
                        "message": f"{name} does not contain a volumetric region.",
                        "correction": "Import a closed solid or use the oriented-box approximation.",
                    }
                )
    return issues


def blocking_errors(issues: list[dict]) -> list[dict]:
    return [item for item in issues if item["severity"] == "error"]


def _grid(roi: dict):
    import numpy as np

    center = np.array(roi["centerM"], dtype=float)
    size = np.array(roi["sizeM"], dtype=float)
    samples = roi["samples"]
    axes = [
        np.linspace(center[i] - size[i] / 2.0, center[i] + size[i] / 2.0, samples[i])
        for i in range(3)
    ]
    x, y, z = np.meshgrid(axes[0], axes[1], axes[2], indexing="ij")
    points = np.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)
    return points, axes, tuple(samples)


def dipole_field(points, center, moment):
    import numpy as np

    r = points - center
    r2 = np.sum(r * r, axis=1, keepdims=True)
    rnorm = np.sqrt(np.maximum(r2, 1e-20))
    rhat = r / rnorm
    m = np.asarray(moment, dtype=float)
    m_r = np.sum(m * rhat, axis=1, keepdims=True)
    return (MU0 / (4.0 * math.pi)) * (3.0 * m_r * rhat - m) / np.maximum(r2 * rnorm, 1e-30)


def _cuboid_axis(obs, x1, x2, y1, y2, z1, z2, magnetization):
    import numpy as np

    field = np.zeros_like(obs)
    xs = (x1, x2)
    ys = (y1, y2)
    zs = (z1, z2)
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            for k, z in enumerate(zs):
                sign = 1.0 if (i + j + k) % 2 == 0 else -1.0
                rx = obs[:, 0] - x
                ry = obs[:, 1] - y
                rz = obs[:, 2] - z
                r = np.sqrt(np.maximum(rx * rx + ry * ry + rz * rz, 1e-20))
                field[:, 0] -= sign * np.log(np.maximum(ry + r, 1e-20))
                field[:, 1] -= sign * np.log(np.maximum(rx + r, 1e-20))
                field[:, 2] += sign * np.arctan2(rx * ry, rz * r)
    return (MU0 * magnetization / (4.0 * math.pi)) * field


def cuboid_field(points, center, size, magnetization_vector):
    import numpy as np

    mag = np.asarray(magnetization_vector, dtype=float)
    strength = float(np.linalg.norm(mag))
    if strength < 1e-18:
        return np.zeros_like(points)
    direction = mag / strength
    # Local frame with z along magnetization so the closed-form z-magnetized cuboid applies.
    z_axis = direction
    helper = np.array([1.0, 0.0, 0.0]) if abs(z_axis[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    x_axis = np.cross(helper, z_axis)
    x_axis /= max(float(np.linalg.norm(x_axis)), 1e-15)
    y_axis = np.cross(z_axis, x_axis)
    rot = np.stack([x_axis, y_axis, z_axis], axis=1)
    local = (points - center) @ rot
    hx, hy, hz = 0.5 * np.abs(size)
    local_b = _cuboid_axis(local, -hx, hx, -hy, hy, -hz, hz, strength)
    # If the cuboid formula is inverted on axis, flip so +M produces +B on +z.
    axis = np.array([[0.0, 0.0, max(hz * 3.0, 1e-3)]])
    probe = _cuboid_axis(axis, -hx, hx, -hy, hy, -hz, hz, strength)
    if probe[0, 2] < 0:
        local_b = -local_b
    return local_b @ rot.T


def magnet_moment(part: dict) -> tuple[Any, Any]:
    import numpy as np

    size = np.array(part["sizeM"], dtype=float)
    volume = float(np.prod(np.abs(size)))
    remanence = float(part["remanenceT"] or 0.0)
    direction = np.array(world_magnetization(part) or [0.0, 0.0, 1.0], dtype=float)
    magnetization = (remanence / MU0) * direction
    moment = magnetization * volume
    center = np.array(part["translationM"], dtype=float)
    return center, moment, magnetization, size


def field_from_parts(parts: list[dict], points, model: str):
    import numpy as np

    field = np.zeros_like(points)
    magnets = [part for part in parts if part["role"] == "permanent_magnet"]
    for part in magnets:
        center, moment, magnetization, size = magnet_moment(part)
        if model == "dipole":
            field += dipole_field(points, center, moment)
        else:
            field += cuboid_field(points, center, size, magnetization)
    return field


def slice_from_field(field, shape: tuple[int, int, int], quantity: str):
    import numpy as np

    bx = field[:, 0].reshape(shape)
    by = field[:, 1].reshape(shape)
    bz = field[:, 2].reshape(shape)
    magnitude = np.sqrt(bx * bx + by * by + bz * bz)
    if quantity == "bx":
        values = bx
        label = "Bx"
    elif quantity == "by":
        values = by
        label = "By"
    elif quantity == "bz":
        values = bz
        label = "Bz"
    else:
        values = magnitude
        label = "|B|"
    index = shape[2] // 2
    plane = values[:, :, index]
    return {
        "axis": "z",
        "index": int(index),
        "width": int(shape[0]),
        "height": int(shape[1]),
        "values": plane.T.ravel().tolist(),
        "quantity": label,
        "units": "T",
    }


def homogeneity(field, roi: dict, reference: float | None):
    import numpy as np

    magnitude = np.sqrt(np.sum(field * field, axis=1))
    ref = float(reference) if reference and reference > 0 else float(np.mean(magnitude))
    if ref == 0:
        ref = 1e-12
    peak = float(np.max(magnitude) - np.min(magnitude))
    std = float(np.std(magnitude))
    return {
        "roi": roi,
        "referenceT": ref,
        "metric": "peak-to-peak and RMS |B| over the sampled ROI, relative to the recorded reference field",
        "meanT": float(np.mean(magnitude)),
        "peakToPeakT": peak,
        "stdT": std,
        "ppmPeakToPeak": 1e6 * peak / ref,
        "ppmRms": 1e6 * std / ref,
    }


def thin_vectors(points, field, limit: int = 80):
    import numpy as np

    if len(points) <= limit:
        index = np.arange(len(points))
    else:
        index = np.linspace(0, len(points) - 1, limit).astype(int)
    selected = field[index]
    scale = float(np.percentile(np.linalg.norm(selected, axis=1), 90) or 1.0)
    return {
        "points": points[index].tolist(),
        "components": selected.tolist(),
        "scale": scale,
    }


def model_fingerprint(parts: list[dict]) -> str:
    payload = [
        {
            "id": part["instanceId"],
            "rev": part["geometryRevision"],
            "T": part["translationM"],
            "S": part["sizeM"],
            "R": part["role"],
            "Br": part["remanenceT"],
            "M": world_magnetization(part),
        }
        for part in parts
    ]
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def elmer_available() -> str:
    return shutil.which("ElmerSolver") or ""


def write_structured_mesh(work: Path, parts: list[dict], roi: dict, mesh: dict) -> dict:
    import numpy as np

    center = np.array(roi["centerM"], dtype=float)
    size = np.array(roi["sizeM"], dtype=float) + 2.0 * mesh["airPaddingM"]
    nx, ny, nz = mesh["grid"]
    xs = np.linspace(center[0] - size[0] / 2.0, center[0] + size[0] / 2.0, nx)
    ys = np.linspace(center[1] - size[1] / 2.0, center[1] + size[1] / 2.0, ny)
    zs = np.linspace(center[2] - size[2] / 2.0, center[2] + size[2] / 2.0, nz)
    nodes = []
    for k, z in enumerate(zs):
        for j, y in enumerate(ys):
            for i, x in enumerate(xs):
                nodes.append((1 + i + nx * j + nx * ny * k, x, y, z))
    solids = [part for part in parts if part["role"] in {"permanent_magnet", "magnetic_yoke"}]
    bodies = []
    for k in range(nz - 1):
        for j in range(ny - 1):
            for i in range(nx - 1):
                n000 = 1 + i + nx * j + nx * ny * k
                n100 = n000 + 1
                n010 = n000 + nx
                n110 = n010 + 1
                n001 = n000 + nx * ny
                n101 = n001 + 1
                n011 = n001 + nx
                n111 = n011 + 1
                cx = 0.5 * (xs[i] + xs[i + 1])
                cy = 0.5 * (ys[j] + ys[j + 1])
                cz = 0.5 * (zs[k] + zs[k + 1])
                body = 1
                for solid_index, part in enumerate(solids, start=2):
                    half = [abs(item) * 0.5 for item in part["sizeM"]]
                    t = part["translationM"]
                    if (
                        abs(cx - t[0]) <= half[0]
                        and abs(cy - t[1]) <= half[1]
                        and abs(cz - t[2]) <= half[2]
                    ):
                        body = solid_index
                        break
                bodies.append((n000, n100, n110, n010, n001, n101, n111, n011, body))
    header = work / "mesh.header"
    header.write_text(f"{len(nodes)} {len(bodies)} 0\n8 0 0\n8 808 {len(bodies)}\n", encoding="utf-8")
    with (work / "mesh.nodes").open("w", encoding="utf-8") as handle:
        for node_id, x, y, z in nodes:
            handle.write(f"{node_id} -1 {x:.8e} {y:.8e} {z:.8e}\n")
    with (work / "mesh.elements").open("w", encoding="utf-8") as handle:
        for index, (a, b, c, d, e, f, g, h, body) in enumerate(bodies, start=1):
            handle.write(f"{index} {body} 808 {a} {b} {c} {d} {e} {f} {g} {h}\n")
    (work / "mesh.boundary").write_text("", encoding="utf-8")
    regions = [{"id": "air", "body": 1, "name": "Air"}]
    for index, part in enumerate(solids, start=2):
        regions.append({"id": part["instanceId"], "body": index, "name": part["cadName"]})
    return {"nodes": len(nodes), "elements": len(bodies), "regions": regions, "directory": str(work)}


def write_sif(work: Path, parts: list[dict], regions: list[dict]) -> Path:
    solids = [part for part in parts if part["role"] in {"permanent_magnet", "magnetic_yoke"}]
    lines = [
        "Header",
        "  CHECK KEYWORDS Warn",
        '  Mesh DB "." "."',
        "End",
        "",
        "Simulation",
        "  Max Output Level = 4",
        "  Coordinate System = Cartesian 3D",
        "  Simulation Type = Steady State",
        "  Steady State Max Iterations = 1",
        '  Post File = "case.vtu"',
        "End",
        "",
        "Body 1",
        "  Target Bodies(1) = 1",
        '  Name = "Air"',
        "  Equation = 1",
        "  Material = 1",
        "End",
        "",
    ]
    force_index = 0
    for index, part in enumerate(solids, start=2):
        block = [
            f"Body {index}",
            f"  Target Bodies(1) = {index}",
            f'  Name = "{part["instanceId"]}"',
            "  Equation = 1",
            f"  Material = {index}",
        ]
        if part["role"] == "permanent_magnet":
            force_index += 1
            block.append(f"  Body Force = {force_index}")
        block.extend(["End", ""])
        lines.extend(block)
    lines.extend(
        [
            "Equation 1",
            '  Name = "Magnetostatic"',
            "  Magnetic Induction = Logical True",
            "  Active Solvers(1) = 1",
            "End",
            "",
            "Solver 1",
            "  Equation = MgDyn3D",
            '  Procedure = "MagnetoDynamics" "WhitneyAVSolver"',
            "  Variable = AV",
            "  Linear System Solver = Iterative",
            "  Linear System Iterative Method = BiCGStab",
            "  Linear System Convergence Tolerance = 1e-7",
            "  Linear System Max Iterations = 300",
            "  Linear System Preconditioning = ILU0",
            "End",
            "",
            "Material 1",
            '  Name = "Air"',
            "  Relative Permeability = 1.0",
            "End",
            "",
        ]
    )
    force_index = 0
    for index, part in enumerate(solids, start=2):
        mu = part["relativePermeability"] if part["relativePermeability"] else 1.05
        lines.extend(
            [
                f"Material {index}",
                f'  Name = "{part["instanceId"]}"',
                f"  Relative Permeability = {mu}",
                "End",
                "",
            ]
        )
        if part["role"] != "permanent_magnet":
            continue
        force_index += 1
        direction = world_magnetization(part) or [0.0, 0.0, 1.0]
        remanence = float(part["remanenceT"] or 0.0)
        magnetization = [remanence / MU0 * item for item in direction]
        lines.extend(
            [
                f"Body Force {force_index}",
                f'  Name = "M_{part["instanceId"]}"',
                f"  Magnetization 1 = {magnetization[0]:.8e}",
                f"  Magnetization 2 = {magnetization[1]:.8e}",
                f"  Magnetization 3 = {magnetization[2]:.8e}",
                "End",
                "",
            ]
        )
    path = work / "case.sif"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    (work / "ELMERSOLVER_STARTINFO").write_text("case.sif\n", encoding="utf-8")
    (work / "region_map.json").write_text(json.dumps(regions, indent=2), encoding="utf-8")
    return path


def run_elmer(work: Path) -> tuple[bool, str]:
    solver = elmer_available()
    if not solver:
        return False, "ElmerSolver is not installed. The case was prepared but no FEM field was computed."
    proc = subprocess.run(
        [solver, "case.sif"],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "ElmerSolver failed.").strip()
        return False, detail[-800:]
    return True, (proc.stdout or "").strip()[-400:]


def parse_elmer_vtu(path: Path) -> tuple[list[list[float]], list[list[float]]] | None:
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "format=\"appended\"" in text or "format='appended'" in text:
        return None
    points = _vtu_array(text, "Points") or _vtu_array(text, "coordinates")
    field = None
    for name in ("magnetic flux density e", "magnetic flux density", "magnetic field strength e", "B"):
        field = _vtu_array(text, name)
        if field:
            break
    if not points or not field or len(points) != len(field):
        return None
    return points, field


def _vtu_array(text: str, name: str) -> list[list[float]] | None:
    token = f'Name="{name}"'
    start = text.find(token)
    if start < 0:
        token = f"Name='{name}'"
        start = text.find(token)
    if start < 0:
        return None
    open_tag = text.rfind("<DataArray", 0, start)
    close = text.find("</DataArray>", start)
    if open_tag < 0 or close < 0:
        return None
    inner_start = text.find(">", open_tag)
    if inner_start < 0 or inner_start > close:
        return None
    values = [float(item) for item in text[inner_start + 1 : close].split() if item]
    if len(values) % 3 != 0:
        return None
    return [values[index : index + 3] for index in range(0, len(values), 3)]


def versions() -> dict[str, str]:
    import numpy as np

    return {
        "numpy": np.__version__,
        "elmer": Path(elmer_available()).name if elmer_available() else "unavailable",
        "magnet_service": "0.1.0",
    }


def _payload_base(body: dict) -> tuple[str, list[dict], dict, dict, list[dict]]:
    study = str(body.get("study") or "magnet")
    if study not in {"magnet", "fem"}:
        raise ValueError("Choose magnet or fem.")
    parts = parse_parts(body)
    roi = parse_roi(body)
    mesh = parse_mesh(body)
    issues = diagnostics_for(parts, study, mesh)
    return study, parts, roi, mesh, issues


def run_validate(body: dict | None = None) -> dict:
    payload = body or {}
    study, parts, roi, mesh, issues = _payload_base(payload)
    errors = blocking_errors(issues)
    return {
        "ok": not errors,
        "study": study,
        "included": [part["instanceId"] for part in parts],
        "included_part_ids": sorted({part["partId"] for part in parts}),
        "model_key": model_fingerprint(parts),
        "issues": issues,
        "roi": roi,
        "mesh": mesh,
        "versions": versions(),
        "example_id": payload.get("example_id") or None,
    }


def _field_result(parts: list[dict], roi: dict, model: str, reference: float | None, approximations: list[str], title: str, summary: str, solver: str, limitation: str, completed: bool, extra: dict | None = None):
    import numpy as np

    started = time.perf_counter()
    points, _axes, shape = _grid(roi)
    field = field_from_parts(parts, points, model)
    magnitude = np.sqrt(np.sum(field * field, axis=1))
    center = np.array(roi["centerM"], dtype=float)
    nearest = int(np.argmin(np.sum((points - center) ** 2, axis=1)))
    result = {
        "ok": completed,
        "completed": completed,
        "title": title,
        "summary": summary,
        "solver": solver,
        "approximations": approximations,
        "diagnostics": [],
        "limitation": limitation,
        "included": [part["instanceId"] for part in parts],
        "included_part_ids": sorted({part["partId"] for part in parts}),
        "model_key": model_fingerprint(parts),
        "field": {
            "points": points.tolist(),
            "bx": field[:, 0].tolist(),
            "by": field[:, 1].tolist(),
            "bz": field[:, 2].tolist(),
            "magnitude": magnitude.tolist(),
            "units": "T",
        },
        "slice": slice_from_field(field, shape, "magnitude"),
        "vectors": thin_vectors(points, field),
        "probes": [
            {
                "position": points[nearest].tolist(),
                "bT": field[nearest].tolist(),
                "magnitudeT": float(magnitude[nearest]),
            }
        ],
        "homogeneity": homogeneity(field, roi, reference),
        "mesh": None,
        "elapsed_s": time.perf_counter() - started,
        "versions": versions(),
    }
    if extra:
        result.update(extra)
    return result


def run_magnet(body: dict | None = None) -> dict:
    payload = body or {}
    study, parts, roi, mesh, issues = _payload_base({**payload, "study": "magnet"})
    errors = blocking_errors(issues)
    if errors:
        raise ValueError(errors[0]["message"] + " " + errors[0]["correction"])
    model = str(payload.get("magnet_model") or "cuboid")
    if model not in MAGNET_MODELS:
        raise ValueError("Choose dipole or cuboid.")
    yokes = [part for part in parts if part["role"] == "magnetic_yoke"]
    approximations = [
        "Uniform magnetization inside each oriented bounding box."
        if model == "cuboid"
        else "Point-dipole superposition of each included magnet volume.",
        "Imported GLB surfaces are not used as FEM volumes in this magnet study.",
    ]
    if yokes:
        approximations.append("Magnetic yokes are ignored by the analytical magnet model. Use Elmer FEM to include them.")
    if payload.get("example_id") == EXAMPLE_HALBACH:
        approximations.append("Labeled example: 8 cuboid magnets on an 80 mm Halbach ring, Br = 1.2 T.")
    reference = payload.get("reference_field_t")
    return _field_result(
        parts,
        roi,
        model,
        None if reference is None else _finite(reference, "reference_field_t"),
        approximations,
        "Magnet field",
        f"{model} superposition of {sum(1 for part in parts if part['role'] == 'permanent_magnet')} included magnets.",
        f"analytical-{model}",
        "",
        True,
        {"issues": issues, "mesh": {"nodes": 0, "elements": 0, "regions": [{"id": part["instanceId"], "body": index + 1, "name": part["cadName"]} for index, part in enumerate(parts)]}},
    )


def run_fem(body: dict | None = None) -> dict:
    payload = body or {}
    study, parts, roi, mesh, issues = _payload_base({**payload, "study": "fem"})
    errors = blocking_errors(issues)
    if errors:
        raise ValueError(errors[0]["message"] + " " + errors[0]["correction"])
    if mesh["approximation"] == "imported_mesh" and any(part.get("closed") is False for part in parts):
        raise ValueError("Imported surfaces are not closed. Repair the geometry or choose the oriented-box approximation.")
    with tempfile.TemporaryDirectory(prefix="adelpha-elmer-") as tmp:
        work = Path(tmp)
        prepared = write_structured_mesh(work, parts, roi, mesh)
        write_sif(work, parts, prepared["regions"])
        ok, detail = run_elmer(work)
        approximations = [
            "Oriented bounding-box volume mesh of included magnets inside the ROI air box.",
            "Stable body numbers come from included instance IDs, not display names.",
        ]
        if mesh["approximation"] == "oriented_box":
            approximations.append("Parameterized oriented-box approximation. This is not the raw imported GLB volume.")
        parsed = parse_elmer_vtu(work / "case.vtu") if ok else None
        if not ok or parsed is None:
            limitation = detail if not ok else "Elmer finished but the VTU field could not be parsed. ASCII case.vtu is required."
            return {
                "ok": False,
                "completed": False,
                "title": "Elmer FEM",
                "summary": "The magnetostatic case was prepared. Elmer did not produce a usable field.",
                "solver": "elmer-whitney-av",
                "approximations": approximations,
                "diagnostics": [detail] if detail else [limitation],
                "limitation": limitation,
                "included": [part["instanceId"] for part in parts],
                "included_part_ids": sorted({part["partId"] for part in parts}),
                "model_key": model_fingerprint(parts),
                "field": None,
                "slice": None,
                "vectors": None,
                "probes": [],
                "homogeneity": None,
                "mesh": {key: prepared[key] for key in ("nodes", "elements", "regions")},
                "elapsed_s": 0.0,
                "versions": versions(),
                "issues": issues,
                "prepared": {"sif": "case.sif", "directory": prepared["directory"]},
            }
        points, values = parsed
        import numpy as np

        field = np.array(values, dtype=float)
        sample_points = np.array(points, dtype=float)
        magnitude = np.linalg.norm(field, axis=1)
        reference = payload.get("reference_field_t")
        shape = (max(2, int(mesh["grid"][0])), max(2, int(mesh["grid"][1])), max(2, int(mesh["grid"][2])))
        center = np.array(roi["centerM"], dtype=float)
        nearest = int(np.argmin(np.sum((sample_points - center) ** 2, axis=1)))
        return {
            "ok": True,
            "completed": True,
            "title": "Elmer FEM",
            "summary": "Elmer magnetostatic solve of the included assembly.",
            "solver": "elmer-whitney-av",
            "approximations": approximations,
            "diagnostics": [detail] if detail else [],
            "limitation": "",
            "included": [part["instanceId"] for part in parts],
            "included_part_ids": sorted({part["partId"] for part in parts}),
            "model_key": model_fingerprint(parts),
            "field": {
                "points": sample_points.tolist(),
                "bx": field[:, 0].tolist(),
                "by": field[:, 1].tolist(),
                "bz": field[:, 2].tolist(),
                "magnitude": magnitude.tolist(),
                "units": "T",
            },
            "slice": slice_from_field(field[: shape[0] * shape[1] * shape[2]], shape, "magnitude")
            if field.shape[0] >= shape[0] * shape[1] * shape[2]
            else None,
            "vectors": thin_vectors(sample_points, field),
            "probes": [
                {
                    "position": sample_points[nearest].tolist(),
                    "bT": field[nearest].tolist(),
                    "magnitudeT": float(magnitude[nearest]),
                }
            ],
            "homogeneity": homogeneity(field, roi, None if reference is None else _finite(reference, "reference_field_t")),
            "mesh": {key: prepared[key] for key in ("nodes", "elements", "regions")},
            "elapsed_s": 0.0,
            "versions": versions(),
            "issues": issues,
        }


def run_study(body: dict | None = None) -> dict:
    payload = body or {}
    study = str(payload.get("study") or "magnet")
    if study == "fem":
        return run_fem(payload)
    return run_magnet(payload)
