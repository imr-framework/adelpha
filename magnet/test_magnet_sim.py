from __future__ import annotations

import importlib.util
import math
import tempfile
from pathlib import Path

import numpy as np
import pytest


def _module():
    path = Path(__file__).resolve().parent / "sim.py"
    spec = importlib.util.spec_from_file_location("adelpha_magnet_sim", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


sim = _module()


def _cube(instance_id: str, center: list[float], size: float, remanence: float, direction: list[float], matrix=None):
    matrix = matrix or [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, center[0], center[1], center[2], 1]
    return {
        "instanceId": instance_id,
        "partId": instance_id.split("::")[0],
        "cadName": instance_id,
        "sourceAssetId": "test",
        "geometryRevision": "rev1",
        "worldMatrix": matrix,
        "translationM": center,
        "sizeM": [size, size, size],
        "units": "m",
        "role": "permanent_magnet",
        "remanenceT": remanence,
        "magnetizationLocal": direction,
        "magnetizationFrame": "local",
        "relativePermeability": 1.05,
        "conductivitySPerM": 0.0,
        "closed": True,
        "triangleCount": 12,
        "boundaryEdges": 0,
        "degenerateFaces": 0,
    }


def test_hidden_flag_is_not_in_the_physical_model():
    magnet = _cube("m1", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    body = {"study": "magnet", "parts": [magnet], "roi": {"centerM": [0, 0, 0.08], "sizeM": [0.02, 0.02, 0.02], "samples": [5, 5, 5]}}
    first = sim.model_fingerprint(sim.parse_parts(body))
    magnet["visible"] = False
    magnet["selected"] = True
    second = sim.model_fingerprint(sim.parse_parts(body))
    assert first == second


def test_excluding_a_part_changes_the_model():
    a = _cube("a", [-0.03, 0, 0], 0.02, 1.2, [0, 0, 1])
    b = _cube("b", [0.03, 0, 0], 0.02, 1.2, [0, 0, 1])
    both = sim.run_magnet({"parts": [a, b], "roi": {"centerM": [0, 0, 0.08], "sizeM": [0.04, 0.04, 0.04], "samples": [5, 5, 5]}})
    one = sim.run_magnet({"parts": [a], "roi": {"centerM": [0, 0, 0.08], "sizeM": [0.04, 0.04, 0.04], "samples": [5, 5, 5]}})
    assert both["included"] == ["a", "b"]
    assert one["included"] == ["a"]
    assert both["model_key"] != one["model_key"]
    assert both["field"]["magnitude"] != one["field"]["magnitude"]


def test_millimetre_units_are_converted_once():
    part = _cube("mm", [20, 0, 0], 20, 1.2, [0, 0, 1])
    part["units"] = "mm"
    part["translationM"] = [20, 0, 0]
    part["sizeM"] = [20, 20, 20]
    part["worldMatrix"] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1]
    parsed = sim.parse_parts({"parts": [part]})[0]
    assert parsed["units"] == "m"
    assert parsed["translationM"][0] == pytest.approx(0.02)
    assert parsed["sizeM"][0] == pytest.approx(0.02)


def test_nested_transform_applied_once():
    parent = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0, 0, 1]
    local = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.02, 0, 0, 1]
    world = [
        parent[0] * local[12] + parent[4] * local[13] + parent[8] * local[14] + parent[12],
        parent[1] * local[12] + parent[5] * local[13] + parent[9] * local[14] + parent[13],
        parent[2] * local[12] + parent[6] * local[13] + parent[10] * local[14] + parent[14],
    ]
    # Column-major Three.js multiply is used on the desk; here the translation is already world.
    part = _cube("nested", world, 0.01, 1.2, [0, 0, 1])
    parsed = sim.parse_parts({"parts": [part]})[0]
    assert parsed["translationM"][0] == pytest.approx(0.12)


def test_magnetization_follows_part_rotation():
    # 90° about z: local +x becomes world +y.
    matrix = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    part = _cube("rot", [0, 0, 0], 0.02, 1.2, [1, 0, 0], matrix)
    direction = sim.world_magnetization(part)
    assert direction[0] == pytest.approx(0.0, abs=1e-9)
    assert direction[1] == pytest.approx(1.0, abs=1e-9)
    assert direction[2] == pytest.approx(0.0, abs=1e-9)


def test_missing_remanence_is_actionable():
    part = _cube("bare", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    part["remanenceT"] = None
    issues = sim.diagnostics_for([part], "magnet")
    codes = {item["code"] for item in issues}
    assert "MISSING_REMANENCE" in codes
    with pytest.raises(ValueError, match="remanence"):
        sim.run_magnet({"parts": [part]})


def test_open_mesh_blocks_imported_fem():
    part = _cube("open", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    part["closed"] = False
    part["boundaryEdges"] = 12
    issues = sim.diagnostics_for([part], "fem", {"approximation": "imported_mesh", "airPaddingM": 0.04, "grid": [8, 8, 8]})
    assert any(item["code"] == "OPEN_SURFACE" for item in issues)


def test_dipole_far_field_matches_reference():
    size = 0.02
    remanence = 1.2
    volume = size**3
    moment = (remanence / sim.MU0) * volume * np.array([0.0, 0.0, 1.0])
    z = 0.5
    points = np.array([[0.0, 0.0, z]])
    computed = sim.dipole_field(points, np.array([0.0, 0.0, 0.0]), moment)[0]
    expected = (sim.MU0 / (4 * math.pi)) * (2 * moment[2]) / z**3
    assert computed[2] == pytest.approx(expected, rel=1e-6)
    part = _cube("ref", [0, 0, 0], size, remanence, [0, 0, 1])
    result = sim.run_magnet(
        {
            "parts": [part],
            "magnet_model": "dipole",
            "roi": {"centerM": [0, 0, z], "sizeM": [0.002, 0.002, 0.002], "samples": [3, 3, 3]},
        }
    )
    assert result["completed"] is True
    assert result["solver"] == "analytical-dipole"
    assert "Point-dipole" in result["approximations"][0]
    probe = result["probes"][0]["bT"][2]
    assert probe == pytest.approx(expected, rel=0.15)


def test_cuboid_agrees_with_dipole_in_the_far_field():
    part = _cube("far", [0, 0, 0], 0.01, 1.2, [0, 0, 1])
    roi = {"centerM": [0, 0, 0.4], "sizeM": [0.002, 0.002, 0.002], "samples": [3, 3, 3]}
    dipole = sim.run_magnet({"parts": [part], "magnet_model": "dipole", "roi": roi})
    cuboid = sim.run_magnet({"parts": [part], "magnet_model": "cuboid", "roi": roi})
    d = dipole["probes"][0]["magnitudeT"]
    c = cuboid["probes"][0]["magnitudeT"]
    assert c == pytest.approx(d, rel=0.08)


def test_fem_regions_keep_instance_ids_for_yokes():
    magnet = _cube("keep", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    yoke = _cube("yoke", [0.04, 0, 0], 0.02, 1.2, [0, 0, 1])
    yoke["role"] = "magnetic_yoke"
    yoke["remanenceT"] = None
    yoke["relativePermeability"] = 400
    with tempfile.TemporaryDirectory() as tmp:
        prepared = sim.write_structured_mesh(
            Path(tmp),
            [magnet, yoke],
            {"centerM": [0, 0, 0], "sizeM": [0.12, 0.08, 0.08], "samples": [5, 5, 5]},
            {"approximation": "oriented_box", "airPaddingM": 0.02, "grid": [6, 6, 6]},
        )
    ids = [row["id"] for row in prepared["regions"]]
    assert ids == ["air", "keep", "yoke"]


def test_ascii_vtu_field_is_parsed():
    text = """<?xml version="1.0"?>
<VTKFile type="UnstructuredGrid" version="0.1">
  <UnstructuredGrid>
    <Piece NumberOfPoints="2">
      <Points>
        <DataArray type="Float64" Name="Points" NumberOfComponents="3" format="ascii">
          0 0 0 0 0 0.01
        </DataArray>
      </Points>
      <PointData>
        <DataArray type="Float64" Name="magnetic flux density e" NumberOfComponents="3" format="ascii">
          0 0 0.05 0 0 0.04
        </DataArray>
      </PointData>
    </Piece>
  </UnstructuredGrid>
</VTKFile>
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "case.vtu"
        path.write_text(text, encoding="utf-8")
        parsed = sim.parse_elmer_vtu(path)
    assert parsed is not None
    points, field = parsed
    assert points[1][2] == pytest.approx(0.01)
    assert field[0][2] == pytest.approx(0.05)


def test_elmer_without_solver_is_not_a_completed_field():
    part = _cube("fem", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    result = sim.run_fem(
        {
            "parts": [part],
            "roi": {"centerM": [0, 0, 0], "sizeM": [0.06, 0.06, 0.06], "samples": [5, 5, 5]},
            "mesh": {"approximation": "oriented_box", "airPaddingM": 0.02, "grid": [6, 6, 6]},
        }
    )
    if not sim.elmer_available():
        assert result["completed"] is False
        assert result["field"] is None
        assert "ElmerSolver" in result["limitation"]
        assert result["mesh"]["nodes"] > 0
        assert result["mesh"]["regions"][1]["id"] == "fem"


def test_example_halbach_is_explicit():
    result = sim.run_magnet(
        {
            "example_id": sim.EXAMPLE_HALBACH,
            "roi": {"centerM": [0, 0, 0], "sizeM": [0.04, 0.04, 0.04], "samples": [5, 5, 5]},
        }
    )
    assert len(result["included"]) == 8
    assert any("Halbach" in item for item in result["approximations"])
    probe = result["probes"][0]
    assert probe["bT"][0] > 0
    assert probe["magnitudeT"] == pytest.approx(0.018, rel=0.2)
    dipole = sim.run_magnet(
        {
            "example_id": sim.EXAMPLE_HALBACH,
            "magnet_model": "dipole",
            "roi": {"centerM": [0, 0, 0], "sizeM": [0.04, 0.04, 0.04], "samples": [5, 5, 5]},
        }
    )
    assert result["probes"][0]["magnitudeT"] == pytest.approx(dipole["probes"][0]["magnitudeT"], rel=0.08)


def test_validate_reports_included_ids():
    a = _cube("keep", [0, 0, 0], 0.02, 1.2, [0, 0, 1])
    report = sim.run_validate({"study": "magnet", "parts": [a]})
    assert report["ok"] is True
    assert report["included"] == ["keep"]
