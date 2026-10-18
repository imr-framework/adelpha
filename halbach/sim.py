"""Halbach-cylinder geometry from HalbachMRIDesigner for Engineering Studio.

Cube placement follows HalbachRing: magnets on a circle, magnetization at twice
the azimuth. Catalog rings and slices follow examples/mri1.json. This endpoint
builds the array. It does not evaluate B0.
"""

from __future__ import annotations

import base64
import math
import struct
import tempfile
import time
from pathlib import Path
from typing import Any

DEFAULTS = {
    "inner_radius_mm": 80.0,
    "magnet_mm": 12.0,
    "br_t": 1.3,
    "mur": 1.0,
    "magnets": 16,
    "rings": 5,
    "ring_sep_mm": 22.0,
    "outer_ring": True,
    "outer_offset_mm": 21.0,
    "outer_extra": 7,
}

LIMITS = {
    "inner_radius_mm": (30.0, 400.0),
    "magnet_mm": (4.0, 40.0),
    "br_t": (0.4, 1.6),
    "mur": (1.0, 1.2),
    "magnets": (6.0, 96.0),
    "rings": (1.0, 23.0),
    "ring_sep_mm": (8.0, 80.0),
    "outer_offset_mm": (10.0, 40.0),
    "outer_extra": (0.0, 16.0),
}

MECH_LIMITS = {
    "stand_width": (0.0, 500.0),
    "stand_height": (0.0, 500.0),
    "num_connection_rods": (0.0, 24.0),
    "connection_rods_arc_radius": (40.0, 400.0),
    "connection_rods_diameter": (2.0, 16.0),
    "shim_tray_height": (0.0, 40.0),
    "shim_tray_angle": (5.0, 60.0),
    "shim_tray_radius": (20.0, 400.0),
    "ring_radius": (40.0, 400.0),
    "ring_magnets": (4.0, 96.0),
    "slice_position": (-500.0, 500.0),
    "slice_inner": (20.0, 400.0),
    "slice_outer": (40.0, 500.0),
}

SLICE_HEIGHT_MM = 12.0
MAX_CUBES = 4000
MAX_RING_DEFS = 40
MAX_SLICES = 24
ANNULUS_SEGMENTS = 48


def _finite(raw: Any, name: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number.")
    return value


def _clamp(raw: Any, lo: float, hi: float, name: str) -> float:
    return min(hi, max(lo, _finite(raw, name)))


def _number(body: dict, key: str) -> float:
    lo, hi = LIMITS[key]
    return _clamp(body.get(key, DEFAULTS[key]), lo, hi, key)


def _flag(body: dict, key: str, default: bool) -> bool:
    value = body.get(key, default)
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return bool(value)


def _ring_ids(raw: Any) -> list[int]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("Each slice needs at least one ring id.")
    ids: list[int] = []
    for item in raw:
        if isinstance(item, dict):
            item = item.get("id")
        ids.append(int(_finite(item, "ring id")))
    return ids


def parse_geometry(raw: Any, magnet_mm: float) -> dict[str, Any] | None:
    if not raw:
        return None
    if not isinstance(raw, dict):
        raise ValueError("geometry must be an object.")
    catalog_raw = raw.get("rings")
    slices_raw = raw.get("slices")
    if not isinstance(catalog_raw, list) or not catalog_raw:
        raise ValueError("geometry.rings must list at least one ring.")
    if not isinstance(slices_raw, list) or not slices_raw:
        raise ValueError("geometry.slices must list at least one slice plate.")
    if len(catalog_raw) > MAX_RING_DEFS:
        raise ValueError(f"At most {MAX_RING_DEFS} ring definitions.")
    if len(slices_raw) > MAX_SLICES:
        raise ValueError(f"At most {MAX_SLICES} slice plates.")

    catalog: list[dict[str, Any]] = []
    by_id: dict[int, dict[str, Any]] = {}
    for item in catalog_raw:
        if not isinstance(item, dict):
            raise ValueError("Each ring definition needs id, radius, and numMagnets.")
        ring_id = int(_finite(item.get("id"), "ring id"))
        ring = {
            "id": ring_id,
            "radius": _clamp(item.get("radius"), *MECH_LIMITS["ring_radius"], "ring radius"),
            "numMagnets": int(round(_clamp(item.get("numMagnets"), *MECH_LIMITS["ring_magnets"], "numMagnets"))),
        }
        if ring_id in by_id:
            raise ValueError(f"Duplicate ring id {ring_id}.")
        by_id[ring_id] = ring
        catalog.append(ring)

    stand_w = _clamp(raw.get("standWidth", 0), *MECH_LIMITS["stand_width"], "standWidth")
    stand_h = _clamp(raw.get("standHeight", 0), *MECH_LIMITS["stand_height"], "standHeight")
    slices: list[dict[str, Any]] = []
    for item in slices_raw:
        if not isinstance(item, dict):
            raise ValueError("Each slice needs position, innerRadius, outerRadius, and rings.")
        inner = _clamp(item.get("innerRadius"), *MECH_LIMITS["slice_inner"], "innerRadius")
        outer = _clamp(item.get("outerRadius"), *MECH_LIMITS["slice_outer"], "outerRadius")
        if outer <= inner + magnet_mm:
            raise ValueError("Slice outerRadius must be larger than innerRadius.")
        width = stand_w if item.get("standWidth") is None else _clamp(item.get("standWidth"), *MECH_LIMITS["stand_width"], "standWidth")
        height = stand_h if item.get("standHeight") is None else _clamp(item.get("standHeight"), *MECH_LIMITS["stand_height"], "standHeight")
        ids = _ring_ids(item.get("rings"))
        missing = [ring_id for ring_id in ids if ring_id not in by_id]
        if missing:
            raise ValueError(f"Slice references unknown ring id {missing[0]}.")
        slices.append(
            {
                "position": _clamp(item.get("position"), *MECH_LIMITS["slice_position"], "slice position"),
                "innerRadius": inner,
                "outerRadius": outer,
                "rings": ids,
                "standWidth": width,
                "standHeight": height,
            }
        )

    return {
        "rings": catalog,
        "slices": slices,
        "mirrorSlices": _flag(raw, "mirrorSlices", True),
        "standWidth": stand_w,
        "standHeight": stand_h,
        "numConnectionRods": int(round(_clamp(raw.get("numConnectionRods", 0), *MECH_LIMITS["num_connection_rods"], "numConnectionRods"))),
        "connectionRodsArcRadius": _clamp(raw.get("connectionRodsArcRadius", 120), *MECH_LIMITS["connection_rods_arc_radius"], "connectionRodsArcRadius"),
        "connectionRodsDiameter": _clamp(raw.get("connectionRodsDiameter", 5), *MECH_LIMITS["connection_rods_diameter"], "connectionRodsDiameter"),
        "shimTrayHeight": _clamp(raw.get("shimTrayHeight", 14), *MECH_LIMITS["shim_tray_height"], "shimTrayHeight"),
        "shimTrayAngle": _clamp(raw.get("shimTrayAngle", 25), *MECH_LIMITS["shim_tray_angle"], "shimTrayAngle"),
        "shimTrayRadius": _clamp(raw.get("shimTrayRadius", 25), *MECH_LIMITS["shim_tray_radius"], "shimTrayRadius"),
    }


def uniform_geometry(request: dict[str, Any]) -> dict[str, Any]:
    inner = request["inner_radius_mm"]
    magnet = request["magnet_mm"]
    catalog = [{"id": 0, "radius": inner, "numMagnets": request["magnets"]}]
    ring_ids = [0]
    if request["outer_ring"]:
        catalog.append(
            {
                "id": 1,
                "radius": inner + request["outer_offset_mm"],
                "numMagnets": request["magnets"] + request["outer_extra"],
            }
        )
        ring_ids.append(1)
    planes = request["rings"]
    sep = request["ring_sep_mm"]
    length = 0.0 if planes <= 1 else (planes - 1) * sep
    positions = [0.0] if planes == 1 else [-length / 2.0 + index * sep for index in range(planes)]
    max_radius = max(ring["radius"] for ring in catalog)
    plate_inner = max(20.0, inner - magnet)
    plate_outer = max_radius + magnet + 18.0
    slices = [
        {
            "position": position,
            "innerRadius": plate_inner,
            "outerRadius": plate_outer,
            "rings": list(ring_ids),
            "standWidth": 0.0,
            "standHeight": 0.0,
        }
        for position in positions
    ]
    return {
        "rings": catalog,
        "slices": slices,
        "mirrorSlices": False,
        "standWidth": 0.0,
        "standHeight": 0.0,
        "numConnectionRods": 0,
        "connectionRodsArcRadius": plate_outer - 15.0,
        "connectionRodsDiameter": 5.0,
        "shimTrayHeight": 14.0,
        "shimTrayAngle": 25.0,
        "shimTrayRadius": plate_outer - 10.0,
    }


def expand_slices(geometry: dict[str, Any]) -> list[dict[str, Any]]:
    plates: list[dict[str, Any]] = []
    for slice_spec in geometry["slices"]:
        plates.append(dict(slice_spec))
        if geometry["mirrorSlices"] and abs(slice_spec["position"]) > 1e-9:
            mirrored = dict(slice_spec)
            mirrored["position"] = -slice_spec["position"]
            plates.append(mirrored)
    plates.sort(key=lambda item: item["position"])
    return plates


def halbach_request(body: dict | None = None) -> dict:
    payload = body or {}
    request = {
        "inner_radius_mm": _number(payload, "inner_radius_mm"),
        "magnet_mm": _number(payload, "magnet_mm"),
        "br_t": _number(payload, "br_t"),
        "mur": _number(payload, "mur"),
        "magnets": int(round(_number(payload, "magnets"))),
        "rings": int(round(_number(payload, "rings"))),
        "ring_sep_mm": _number(payload, "ring_sep_mm"),
        "outer_ring": _flag(payload, "outer_ring", DEFAULTS["outer_ring"]),
        "outer_offset_mm": _number(payload, "outer_offset_mm"),
        "outer_extra": int(round(_number(payload, "outer_extra"))),
    }
    request["geometry"] = parse_geometry(payload.get("geometry"), request["magnet_mm"])
    return request


def _ring_cubes(radius_m: float, count: int, z_m: float, size_m: float) -> list[dict[str, float]]:
    """Same double-angle Halbach law as HalbachMRIDesigner/HalbachRing.py."""
    cubes = []
    for index in range(count):
        azimuth = 2.0 * math.pi * index / count
        angle = 2.0 * azimuth
        cubes.append(
            {
                "x": radius_m * math.cos(azimuth),
                "y": radius_m * math.sin(azimuth),
                "z": z_m,
                "angle": angle,
                "size": size_m,
            }
        )
    return cubes


def _plates_and_rods(geometry: dict[str, Any], expanded: list[dict[str, Any]]) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
    height_m = SLICE_HEIGHT_MM / 1000.0
    plates = []
    zs: list[float] = []
    for index, slice_spec in enumerate(expanded):
        z_m = slice_spec["position"] / 1000.0
        zs.append(z_m)
        plates.append(
            {
                "index": index,
                "z": z_m,
                "inner_radius": slice_spec["innerRadius"] / 1000.0,
                "outer_radius": slice_spec["outerRadius"] / 1000.0,
                "height": height_m,
                "stand_width": slice_spec["standWidth"] / 1000.0,
                "stand_height": slice_spec["standHeight"] / 1000.0,
            }
        )
    rods: list[dict[str, float]] = []
    count = geometry["numConnectionRods"]
    if count and zs:
        radius_m = geometry["connectionRodsArcRadius"] / 1000.0
        rod_r = geometry["connectionRodsDiameter"] / 2000.0
        z0 = min(zs) - height_m / 2.0
        z1 = max(zs) + height_m / 2.0
        for index in range(count):
            azimuth = 2.0 * math.pi * (index + 0.5) / count
            rods.append(
                {
                    "x": radius_m * math.cos(azimuth),
                    "y": radius_m * math.sin(azimuth),
                    "radius": rod_r,
                    "z0": z0,
                    "z1": z1,
                }
            )
    return plates, rods


def _design_from_request(request: dict[str, Any]) -> dict[str, Any]:
    geometry = request["geometry"] or uniform_geometry(request)
    expanded = expand_slices(geometry)
    catalog = {ring["id"]: ring for ring in geometry["rings"]}
    size_m = request["magnet_mm"] / 1000.0
    cubes: list[dict[str, float]] = []
    for slice_spec in expanded:
        z_m = slice_spec["position"] / 1000.0
        for ring_id in slice_spec["rings"]:
            ring = catalog[ring_id]
            cubes.extend(_ring_cubes(ring["radius"] / 1000.0, ring["numMagnets"], z_m, size_m))
    if len(cubes) > MAX_CUBES:
        raise ValueError(f"This array has {len(cubes)} cubes. Reduce rings or magnets per ring (limit {MAX_CUBES}).")
    plates, rods = _plates_and_rods(geometry, expanded)
    positions = [slice_spec["position"] for slice_spec in expanded]
    length_mm = 0.0 if len(positions) <= 1 else max(positions) - min(positions)
    inner_mm = min(slice_spec["innerRadius"] for slice_spec in expanded)
    magnet_rings = sum(len(slice_spec["rings"]) for slice_spec in expanded)
    return {
        "ok": True,
        "title": "Halbach cylinder",
        "summary": "Halbach cylinder from HalbachMRIDesigner geometry. Magnetization follows the double-angle law.",
        "inner_radius_mm": inner_mm,
        "length_mm": round(length_mm, 1),
        "magnet_mm": request["magnet_mm"],
        "br_t": request["br_t"],
        "mur": request["mur"],
        "magnets": request["magnets"],
        "rings": len(expanded),
        "ring_sep_mm": request["ring_sep_mm"],
        "outer_ring": request["outer_ring"],
        "outer_offset_mm": request["outer_offset_mm"],
        "outer_extra": request["outer_extra"],
        "ring_count": magnet_rings,
        "magnet_count": len(cubes),
        "slice_count": len(expanded),
        "geometry_mode": "catalog" if request["geometry"] else "uniform",
        "cubes": cubes,
        "plates": plates,
        "rods": rods,
        "geometry": {
            "rings": geometry["rings"],
            "slices": geometry["slices"],
            "mirrorSlices": geometry["mirrorSlices"],
            "standWidth": geometry["standWidth"],
            "standHeight": geometry["standHeight"],
            "numConnectionRods": geometry["numConnectionRods"],
            "connectionRodsArcRadius": geometry["connectionRodsArcRadius"],
            "connectionRodsDiameter": geometry["connectionRodsDiameter"],
            "shimTrayHeight": geometry["shimTrayHeight"],
            "shimTrayAngle": geometry["shimTrayAngle"],
            "shimTrayRadius": geometry["shimTrayRadius"],
        },
    }


def design(body: dict | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    result = _design_from_request(halbach_request(body))
    result["elapsed_s"] = round(time.perf_counter() - started, 3)
    return result


def _sub(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(a: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.hypot(*a)
    if length < 1e-15:
        return (0.0, 0.0, 1.0)
    return (a[0] / length, a[1] / length, a[2] / length)


def _pack_stl(triangles: list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]], header: str) -> bytes:
    payload = bytearray(84 + len(triangles) * 50)
    encoded = header.encode("ascii", "replace")[:80]
    payload[: len(encoded)] = encoded
    payload[80:84] = len(triangles).to_bytes(4, "little")
    offset = 84
    for a, b, c in triangles:
        normal = _norm(_cross(_sub(b, a), _sub(c, a)))
        for value in (*normal, *a, *b, *c):
            payload[offset : offset + 4] = struct.pack("<f", value)
            offset += 4
        offset += 2
    return bytes(payload)


def _box_triangles(x: float, y: float, z: float, size: float, angle: float) -> list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]]:
    half = size / 2.0
    cosine, sine = math.cos(angle), math.sin(angle)
    corners = []
    for sx in (-half, half):
        for sy in (-half, half):
            for sz in (-half, half):
                corners.append((x + cosine * sx - sine * sy, y + sine * sx + cosine * sy, z + sz))
    # indices: x- y- z- = 0, x- y- z+ = 1, x- y+ z- = 2, x- y+ z+ = 3, x+ y- z- = 4, ...
    faces = (
        (0, 1, 3, 2),
        (4, 6, 7, 5),
        (0, 4, 5, 1),
        (2, 3, 7, 6),
        (0, 2, 6, 4),
        (1, 5, 7, 3),
    )
    tris = []
    for a, b, c, d in faces:
        tris.append((corners[a], corners[b], corners[c]))
        tris.append((corners[a], corners[c], corners[d]))
    return tris


def _annulus_triangles(inner: float, outer: float, z0: float, z1: float, segments: int = ANNULUS_SEGMENTS):
    tris = []
    for index in range(segments):
        a0 = 2.0 * math.pi * index / segments
        a1 = 2.0 * math.pi * (index + 1) / segments
        c0, s0 = math.cos(a0), math.sin(a0)
        c1, s1 = math.cos(a1), math.sin(a1)
        i00 = (c0 * inner, s0 * inner, z0)
        i01 = (c0 * inner, s0 * inner, z1)
        i10 = (c1 * inner, s1 * inner, z0)
        i11 = (c1 * inner, s1 * inner, z1)
        o00 = (c0 * outer, s0 * outer, z0)
        o01 = (c0 * outer, s0 * outer, z1)
        o10 = (c1 * outer, s1 * outer, z0)
        o11 = (c1 * outer, s1 * outer, z1)
        tris.extend(
            [
                (o00, o10, o11),
                (o00, o11, o01),
                (i10, i00, i01),
                (i10, i01, i11),
                (o01, o11, i11),
                (o01, i11, i01),
                (o00, i00, i10),
                (o00, i10, o10),
            ]
        )
    return tris


def _prism_triangles(xy: list[tuple[float, float]], z0: float, z1: float):
    tris = []
    count = len(xy)
    top = [(x, y, z1) for x, y in xy]
    bottom = [(x, y, z0) for x, y in xy]
    for index in range(1, count - 1):
        tris.append((top[0], top[index], top[index + 1]))
        tris.append((bottom[0], bottom[index + 1], bottom[index]))
    for index in range(count):
        nxt = (index + 1) % count
        a, b = bottom[index], bottom[nxt]
        c, d = top[nxt], top[index]
        tris.append((a, b, c))
        tris.append((a, c, d))
    return tris


def _cylinder_triangles(x: float, y: float, z0: float, z1: float, radius: float, segments: int = 16):
    xy = [(x + math.cos(2.0 * math.pi * index / segments) * radius, y + math.sin(2.0 * math.pi * index / segments) * radius) for index in range(segments)]
    return _prism_triangles(xy, z0, z1)


def _stand_triangles(plate: dict[str, float]):
    width = plate["stand_width"] * 1000.0
    height = plate["stand_height"] * 1000.0
    if width <= 0 or height <= 0:
        return []
    outer = plate["outer_radius"] * 1000.0
    z_mm = plate["z"] * 1000.0
    half = plate["height"] * 500.0
    return _prism_triangles(
        [(-width / 2.0, -height), (width / 2.0, -height), (outer, 0.0), (-outer, 0.0)],
        z_mm - half,
        z_mm + half,
    )


def _selected_plates(result: dict[str, Any], target: str, slice_index: int) -> list[dict[str, float]]:
    plates = result["plates"]
    if not plates:
        raise ValueError("Generate an array before exporting CAD.")
    if target == "assembly":
        return plates
    if target != "ring":
        raise ValueError("Export target must be ring or assembly.")
    if slice_index < 0 or slice_index >= len(plates):
        raise ValueError("slice_index is out of range.")
    return [plates[slice_index]]


def _stl_triangles(result: dict[str, Any], plates: list[dict[str, float]], include_rods: bool) -> list:
    triangles = []
    plate_z = {round(plate["z"], 6) for plate in plates}
    for plate in plates:
        inner = plate["inner_radius"] * 1000.0
        outer = plate["outer_radius"] * 1000.0
        z_mm = plate["z"] * 1000.0
        half = plate["height"] * 500.0
        triangles.extend(_annulus_triangles(inner, outer, z_mm - half, z_mm + half))
        triangles.extend(_stand_triangles(plate))
    for cube in result["cubes"]:
        if round(cube["z"], 6) in plate_z:
            triangles.extend(_box_triangles(cube["x"] * 1000.0, cube["y"] * 1000.0, cube["z"] * 1000.0, cube["size"] * 1000.0, cube["angle"]))
    if include_rods:
        for rod in result["rods"]:
            triangles.extend(
                _cylinder_triangles(
                    rod["x"] * 1000.0,
                    rod["y"] * 1000.0,
                    rod["z0"] * 1000.0,
                    rod["z1"] * 1000.0,
                    rod["radius"] * 1000.0,
                )
            )
    if not triangles:
        raise ValueError("Nothing to export for this selection.")
    return triangles


def _write_step(result: dict[str, Any], plates: list[dict[str, float]], include_rods: bool, path: Path) -> None:
    try:
        import gmsh
    except ImportError as exc:
        raise ValueError("STEP export needs Gmsh. Save STL instead, or install the Gmsh used by FEM.") from exc
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    try:
        gmsh.model.add("halbach")
        bodies: list[tuple[int, int]] = []
        plate_z = {round(plate["z"], 6) for plate in plates}
        for plate in plates:
            z_mm = plate["z"] * 1000.0
            height = plate["height"] * 1000.0
            outer_r = plate["outer_radius"] * 1000.0
            inner_r = plate["inner_radius"] * 1000.0
            outer = gmsh.model.occ.addCylinder(0, 0, z_mm - height / 2.0, 0, 0, height, outer_r)
            volume = [(3, outer)]
            if plate["stand_width"] > 0 and plate["stand_height"] > 0:
                width = plate["stand_width"] * 1000.0
                stand_h = plate["stand_height"] * 1000.0
                z0 = z_mm - height / 2.0
                points = [
                    gmsh.model.occ.addPoint(-width / 2.0, -stand_h, z0),
                    gmsh.model.occ.addPoint(width / 2.0, -stand_h, z0),
                    gmsh.model.occ.addPoint(outer_r, 0.0, z0),
                    gmsh.model.occ.addPoint(-outer_r, 0.0, z0),
                ]
                lines = [gmsh.model.occ.addLine(points[i], points[(i + 1) % 4]) for i in range(4)]
                loop = gmsh.model.occ.addCurveLoop(lines)
                surface = gmsh.model.occ.addPlaneSurface([loop])
                extruded = gmsh.model.occ.extrude([(2, surface)], 0, 0, height)
                stand = [dt for dt in extruded if dt[0] == 3]
                volume, _ = gmsh.model.occ.fuse(volume, stand)
            inner = gmsh.model.occ.addCylinder(0, 0, z_mm - (height + 1) / 2.0, 0, 0, height + 1, inner_r)
            cut, _ = gmsh.model.occ.cut(volume, [(3, inner)], removeObject=True, removeTool=True)
            bodies.extend([dt for dt in cut if dt[0] == 3])
        for cube in result["cubes"]:
            if round(cube["z"], 6) not in plate_z:
                continue
            size = cube["size"] * 1000.0
            x, y, z = cube["x"] * 1000.0, cube["y"] * 1000.0, cube["z"] * 1000.0
            box = gmsh.model.occ.addBox(x - size / 2.0, y - size / 2.0, z - size / 2.0, size, size, size)
            gmsh.model.occ.rotate([(3, box)], x, y, z, 0, 0, 1, cube["angle"])
            bodies.append((3, box))
        if include_rods:
            for rod in result["rods"]:
                bodies.append(
                    (
                        3,
                        gmsh.model.occ.addCylinder(
                            rod["x"] * 1000.0,
                            rod["y"] * 1000.0,
                            rod["z0"] * 1000.0,
                            0,
                            0,
                            (rod["z1"] - rod["z0"]) * 1000.0,
                            rod["radius"] * 1000.0,
                        ),
                    )
                )
        if not bodies:
            raise ValueError("Nothing to export for this selection.")
        gmsh.model.occ.synchronize()
        gmsh.write(str(path))
    finally:
        gmsh.finalize()


def export_cad(body: dict | None = None) -> dict[str, Any]:
    payload = body or {}
    result = _design_from_request(halbach_request(payload))
    target = str(payload.get("target", "assembly")).strip().lower()
    fmt = str(payload.get("format", "stl")).strip().lower()
    slice_index = int(round(_finite(payload.get("slice_index", 0), "slice_index")))
    plates = _selected_plates(result, target, slice_index)
    include_rods = target == "assembly"
    stem = "halbach-assembly" if target == "assembly" else f"halbach-slice-{slice_index:02d}"
    if fmt == "stl":
        triangles = _stl_triangles(result, plates, include_rods)
        data = _pack_stl(triangles, "Adelpha Halbach array")
        filename = f"{stem}.stl"
        media = "model/stl"
    elif fmt in {"step", "stp"}:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"{stem}.step"
            _write_step(result, plates, include_rods, path)
            data = path.read_bytes()
        filename = f"{stem}.step"
        media = "model/step"
    else:
        raise ValueError("Export format must be stl or step.")
    return {
        "ok": True,
        "filename": filename,
        "media_type": media,
        "data_b64": base64.b64encode(data).decode("ascii"),
        "bytes": len(data),
        "target": target,
        "format": "step" if fmt in {"step", "stp"} else "stl",
    }

