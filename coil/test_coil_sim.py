import json
from pathlib import Path

import pytest

console = Path(__file__).resolve().parents[1]


def _module():
    import sys

    sys.path.insert(0, str(console))
    from services.api import coil_sim

    return coil_sim


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
