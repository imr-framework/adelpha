from __future__ import annotations

import base64
import math

import pytest

from halbach.sim import design, export_cad, halbach_request


def test_request_clamps_and_counts():
    request = halbach_request({"inner_radius_mm": 80, "magnets": 16, "rings": 1, "outer_ring": False})
    assert request["magnets"] == 16
    assert request["outer_ring"] is False


def test_single_ring_uses_double_angle_halbach_law():
    result = design({"inner_radius_mm": 80, "magnet_mm": 12, "magnets": 8, "rings": 1, "outer_ring": False})
    assert result["ok"] is True
    assert result["magnet_count"] == 8
    assert result["ring_count"] == 1
    assert result["slice_count"] == 1
    assert len(result["plates"]) == 1
    first = result["cubes"][0]
    assert first["x"] == pytest.approx(0.08)
    assert first["y"] == pytest.approx(0.0)
    assert first["angle"] == pytest.approx(0.0)
    second = result["cubes"][1]
    azimuth = 2 * math.pi / 8
    assert second["x"] == pytest.approx(0.08 * math.cos(azimuth))
    assert second["angle"] == pytest.approx(2 * azimuth)


def test_outer_ring_adds_magnets_on_each_plane():
    result = design(
        {
            "inner_radius_mm": 80,
            "magnets": 16,
            "rings": 3,
            "outer_ring": True,
            "outer_extra": 7,
        }
    )
    assert result["magnet_count"] == 3 * (16 + 23)
    assert result["length_mm"] == pytest.approx(44.0)
    assert result["geometry_mode"] == "uniform"


def test_catalog_geometry_mirrors_nonzero_slices():
    result = design(
        {
            "magnet_mm": 12,
            "geometry": {
                "rings": [
                    {"id": 0, "radius": 80, "numMagnets": 8},
                    {"id": 1, "radius": 101, "numMagnets": 10},
                ],
                "slices": [
                    {"position": 0, "innerRadius": 60, "outerRadius": 120, "rings": [0, 1], "standWidth": 100, "standHeight": 140},
                    {"position": 22, "innerRadius": 60, "outerRadius": 120, "rings": [{"id": 0}], "standWidth": 0, "standHeight": 0},
                ],
                "mirrorSlices": True,
                "standWidth": 100,
                "standHeight": 140,
                "numConnectionRods": 4,
                "connectionRodsArcRadius": 110,
                "connectionRodsDiameter": 5,
            },
        }
    )
    assert result["geometry_mode"] == "catalog"
    assert result["slice_count"] == 3
    assert result["magnet_count"] == 18 + 8 + 8
    assert len(result["rods"]) == 4
    end_plates = [plate for plate in result["plates"] if abs(plate["z"] - 0.022) < 1e-9 or abs(plate["z"] + 0.022) < 1e-9]
    assert len(end_plates) == 2
    assert end_plates[0]["stand_width"] == pytest.approx(0.0)


def test_rejects_arrays_that_exceed_the_preview_cap():
    with pytest.raises(ValueError, match="cubes"):
        design({"inner_radius_mm": 200, "magnets": 80, "rings": 23, "outer_ring": True, "outer_extra": 16})


def test_export_writes_binary_stl_for_a_slice_and_assembly():
    body = {"inner_radius_mm": 80, "magnet_mm": 12, "magnets": 8, "rings": 1, "outer_ring": False}
    ring = export_cad({**body, "target": "ring", "format": "stl", "slice_index": 0})
    assembly = export_cad({**body, "target": "assembly", "format": "stl"})
    assert ring["filename"] == "halbach-slice-00.stl"
    assert assembly["filename"] == "halbach-assembly.stl"
    raw = base64.b64decode(ring["data_b64"])
    assert raw.startswith(b"Adelpha Halbach array")
    count = int.from_bytes(raw[80:84], "little")
    assert count > 10
    assert len(raw) == 84 + count * 50


def test_step_export_reports_missing_gmsh():
    try:
        import gmsh  # noqa: F401
    except ImportError:
        with pytest.raises(ValueError, match="Gmsh"):
            export_cad({"rings": 1, "magnets": 8, "outer_ring": False, "target": "ring", "format": "step"})
        return
    exported = export_cad({"rings": 1, "magnets": 8, "outer_ring": False, "target": "ring", "format": "step"})
    assert exported["filename"].endswith(".step")
    assert exported["bytes"] > 100
