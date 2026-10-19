import json
from pathlib import Path

import pytest

def _module():
    import importlib.util

    path = Path(__file__).resolve().parent / "sim.py"
    spec = importlib.util.spec_from_file_location("adelpha_coil_sim", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_axes_keep_their_cylinder():
    coil = _module()
    y_gradient = coil.coil_request({"axis": "y", "radius_mm": 140, "length_mm": 280, "levels": 10, "gradient_mt_m": 10})
    assert y_gradient["axis"] == "y"
    assert y_gradient["radius_mm"] == 140
    assert y_gradient["levels"] == 10

    z_gradient = coil.coil_request({"axis": "Z", "levels": 6, "gradient_mt_m": 15})
    assert z_gradient["axis"] == "z"
    assert z_gradient["levels"] == 6
    assert z_gradient["gradient_mt_m"] == 15


def test_flat_formers_keep_their_plates():
    coil = _module()
    planar = coil.coil_request({"shape": "planar", "width_mm": 250, "height_mm": 180, "levels": 8})
    assert planar["shape"] == "planar"
    assert planar["width_mm"] == 250
    assert planar["height_mm"] == 180
    assert planar["axis"] == "y"

    biplanar = coil.coil_request({"shape": "Biplanar", "gap_mm": 120})
    assert biplanar["shape"] == "biplanar"
    assert biplanar["gap_mm"] == 120

    circular = coil.coil_request({"shape": "circular", "radius_mm": 200})
    assert circular["shape"] == "circular"
    assert circular["radius_mm"] == 200


def test_unknown_former_is_rejected():
    coil = _module()
    with pytest.raises(ValueError, match="former"):
        coil.coil_request({"shape": "sphere"})


def test_unknown_axis_is_rejected():
    coil = _module()
    with pytest.raises(ValueError, match="gradient"):
        coil.run_coil({"axis": "radial"})


def test_missing_environment_is_reported(monkeypatch):
    coil = _module()
    monkeypatch.setenv("COILGEN_PYTHON", "")
    monkeypatch.setattr(coil, "coil_python", lambda: "")
    with pytest.raises(RuntimeError, match="pyCoilGen"):
        coil.run_coil({"axis": "x"})


def test_runner_reads_result_json(monkeypatch):
    coil = _module()

    def fake_run(command, **_kwargs):
        result = Path(command[-1])
        result.write_text(
            json.dumps({"ok": True, "axis": "y", "loops": [[[0, 0, 0], [1, 0, 0]]], "loop_count": 1}),
            encoding="utf-8",
        )
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(coil.subprocess, "run", fake_run)
    monkeypatch.setattr(coil, "coil_python", lambda: "python")
    payload = coil.run_coil({"axis": "y"})
    assert payload["ok"] is True
    assert payload["loop_count"] == 1


def test_packaged_runtime_uses_run_script(monkeypatch):
    coil = _module()
    seen = {}

    def fake_run(command, **_kwargs):
        if command and str(command[-1]).endswith("result.json"):
            seen["command"] = command
            Path(command[-1]).write_text(json.dumps({"ok": True, "loop_count": 1}), encoding="utf-8")
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(coil.subprocess, "run", fake_run)
    monkeypatch.setattr(
        coil,
        "coil_python",
        lambda: "/usr/lib/Adelpha/python-runtime/adelpha-python-runtime",
    )
    coil.run_coil({"axis": "y"})
    assert seen["command"][1] == "run-script"
    assert seen["command"][2].endswith("sim.py")


@pytest.mark.parametrize("axis", ["x", "y", "z"])
def test_biplanar_profiles_preserve_requested_physics_and_dimensions(axis, tmp_path):
    coil = _module()
    request = coil.coil_request({
        "shape": "biplanar", "axis": axis, "width_mm": 240,
        "height_mm": 180, "gap_mm": 80, "levels": 14, "gradient_mt_m": 12,
    })
    args = coil._pycoilgen_args(request, tmp_path)
    assert args["field_shape_function"] == axis
    assert args["target_gradient_strength"] == pytest.approx(0.012)
    assert args["levels"] == 14
    mesh = args["biplanar_mesh_parameter_list"]
    assert mesh[:2] == [0.18, 0.24]
    # Both plates lie in XY, centered about Z; gap is full separation.
    assert mesh[4:10] == [0, 0, 1, 0, 0, 0]
    assert mesh[10] == 0.08
    assert args["target_region_radius"] < mesh[10] / 2
    assert args["surface_is_cylinder_flag"] is False
    assert args["level_set_method"] == "primary"
    assert args["target_region_resolution"] == 10
    assert args["iteration_num_mesh_refinement"] == 1
    assert args["tikhonov_reg_factor"] == (200 if axis == "z" else 10)
    assert args["pot_offset_factor"] == (0.35 if axis == "z" else 0.25)
    assert args["sf_opt_method"] == ("Iterative" if axis == "z" else "tikhonov")


def test_cylinder_keeps_its_dense_mesh(tmp_path):
    coil = _module()
    args = coil._pycoilgen_args(coil.coil_request({"shape": "cylinder", "axis": "z"}), tmp_path)
    assert args["tikhonov_reg_factor"] == 10
    assert args["pot_offset_factor"] == 0.25
    assert args["target_region_resolution"] == 10
    assert args["iteration_num_mesh_refinement"] == 0
    assert args["surface_is_cylinder_flag"] is True
    assert "sf_opt_method" not in args
    assert "level_set_method" not in args


@pytest.mark.parametrize("shape", ["planar", "circular"])
def test_plate_formers_use_closed_contour_preview(shape, tmp_path):
    coil = _module()
    args = coil._pycoilgen_args(coil.coil_request({"shape": shape, "axis": "x"}), tmp_path)
    assert args["target_region_resolution"] == 10
    assert args["iteration_num_mesh_refinement"] == 1
    assert args["level_set_method"] == "primary"
    assert args["surface_is_cylinder_flag"] is False
    assert args["tikhonov_reg_factor"] == 10
    assert args["min_loop_significance"] == 5
    assert args["set_roi_into_mesh_center"] is True
    assert args["smooth_factor"] == 3
    if shape == "circular":
        assert args["circular_mesh_parameter_list"][1] == 20
        assert args["circular_mesh_parameter_list"][-1] == 0
    else:
        assert args["planar_mesh_parameter_list"][-1] == 0


def _square(x0, y0, size=0.08):
    import numpy as np

    return np.array([
        [x0, x0 + size, x0 + size, x0, x0],
        [y0, y0, y0 + size, y0 + size, y0],
        [0.0, 0.0, 0.0, 0.0, 0.0],
    ])


def test_wires_use_closed_contour_groups_not_the_connected_path():
    from types import SimpleNamespace

    import numpy as np

    coil = _module()
    left = SimpleNamespace(v=_square(-0.1, -0.04))
    right = SimpleNamespace(v=_square(0.02, -0.04))
    part = SimpleNamespace(
        _adelpha_closed_groups=[SimpleNamespace(loops=[left]), SimpleNamespace(loops=[right])],
        groups=[SimpleNamespace(loops=[SimpleNamespace(v=np.array([[9.0, 8.0], [9.0, 8.0], [9.0, 8.0]]))])],
        wire_path=SimpleNamespace(v=np.array([[7.0, 6.0], [7.0, 6.0], [7.0, 6.0]])),
    )
    wires = coil._wires(part, min_length=0.01)
    assert [wire["group"] for wire in wires] == [0, 1]
    assert all(wire["closed"] for wire in wires)
    assert all(len(wire["points"]) >= 48 for wire in wires)


def test_wires_colour_by_stream_function_polarity():
    from types import SimpleNamespace

    coil = _module()
    positive = SimpleNamespace(v=_square(0.02, -0.04), potential=4.2)
    negative = SimpleNamespace(v=_square(-0.1, -0.04), potential=-3.1)
    part = SimpleNamespace(_adelpha_closed_groups=[SimpleNamespace(loops=[positive, negative])])
    assert [wire["group"] for wire in coil._wires(part, min_length=0.01)] == [0, 1]


def test_winding_stl_is_a_binary_solid():
    coil = _module()
    square = [
        [0.0, 0.0, 0.0],
        [0.05, 0.0, 0.0],
        [0.05, 0.05, 0.0],
        [0.0, 0.05, 0.0],
    ]
    stl = coil._winding_stl([{"group": 0, "closed": True, "points": square}], 0.002)
    assert stl[:80].startswith(b"Adelpha gradient winding loops")
    count = int.from_bytes(stl[80:84], "little")
    assert count > 10
    assert len(stl) == 84 + count * 50


def test_open_planar_contour_is_closed_into_one_loop():
    from types import SimpleNamespace

    import numpy as np

    coil = _module()
    theta = np.linspace(0.6, 2 * np.pi - 0.6, 30)
    loop = SimpleNamespace(v=np.array([0.06 * np.cos(theta), 0.06 * np.sin(theta), np.zeros_like(theta)]))
    points = np.asarray(coil._conductor_points(loop, min_length=0.01))
    assert points is not None
    nearest = np.min(np.linalg.norm(points - np.array([0.06, 0.0, 0.0]), axis=1))
    assert nearest < 0.012


def test_speck_loops_are_not_exported():
    from types import SimpleNamespace

    coil = _module()
    assert coil._conductor_points(SimpleNamespace(v=_square(0.0, 0.0, size=0.002)), min_length=0.01) is None


def test_capture_protects_closed_loops_from_interconnect_mutation():
    from types import SimpleNamespace

    import numpy as np

    coil = _module()
    loop = SimpleNamespace(v=np.array([[0.0, 1.0], [0.0, 0.0], [0.0, 0.0]], dtype=float))
    group = SimpleNamespace(loops=[loop])
    part = SimpleNamespace(groups=[group], contour_lines=[loop])
    coil._capture_closed_groups([part])
    group.loops[0].v[:] = 9
    saved = part._adelpha_closed_groups[0].loops[0].v
    assert np.allclose(saved[0], [0.0, 1.0])
    assert np.allclose(loop.v[0], [0.0, 1.0])
