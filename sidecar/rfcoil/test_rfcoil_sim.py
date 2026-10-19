import json
from pathlib import Path

import pytest


def _module():
    import importlib.util

    path = Path(__file__).resolve().parent / "sim.py"
    spec = importlib.util.spec_from_file_location("adelpha_rfcoil_sim", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_request_keeps_diymri_defaults():
    rfcoil = _module()
    request = rfcoil.rfcoil_request({})
    assert request["radius_mm"] == 30
    assert request["length_mm"] == 180
    assert request["former_mm"] == 5
    assert request["grooves"] == 45
    assert request["freq_mhz"] == 10.64
    assert request["allow_bucking"] is True
    assert request["n_max"] == 1


def test_request_clamps_and_parses_bucking():
    rfcoil = _module()
    tight = rfcoil.rfcoil_request({"radius_mm": 4, "grooves": 200, "n_max": 9, "allow_bucking": "no"})
    assert tight["radius_mm"] == 10
    assert tight["grooves"] == 80
    assert tight["n_max"] == 4
    assert tight["allow_bucking"] is False


def test_unknown_number_is_rejected():
    rfcoil = _module()
    with pytest.raises(ValueError, match="radius_mm"):
        rfcoil.rfcoil_request({"radius_mm": "wide"})


def test_missing_environment_is_reported(monkeypatch):
    rfcoil = _module()
    monkeypatch.setenv("RFCOIL_PYTHON", "")
    monkeypatch.setattr(rfcoil, "rfcoil_python", lambda: "")
    with pytest.raises(RuntimeError, match="RF coil environment"):
        rfcoil.run_rfcoil({})


def test_runner_reads_result_json(monkeypatch):
    rfcoil = _module()

    def fake_run(command, **_kwargs):
        result = Path(command[-1])
        result.write_text(json.dumps({"ok": True, "loop_count": 2, "title": "Solenoid RF coil"}), encoding="utf-8")
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(rfcoil.subprocess, "run", fake_run)
    monkeypatch.setattr(rfcoil, "rfcoil_python", lambda: "python")
    payload = rfcoil.run_rfcoil({"radius_mm": 30})
    assert payload["ok"] is True
    assert payload["loop_count"] == 2


def test_packaged_runtime_uses_run_script(monkeypatch):
    rfcoil = _module()
    seen = {}

    def fake_run(command, **_kwargs):
        if command and str(command[-1]).endswith("result.json"):
            seen["command"] = command
            Path(command[-1]).write_text(json.dumps({"ok": True, "loop_count": 2}), encoding="utf-8")
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(rfcoil.subprocess, "run", fake_run)
    monkeypatch.setattr(
        rfcoil,
        "rfcoil_python",
        lambda: "/usr/lib/Adelpha/python-runtime/adelpha-python-runtime",
    )
    rfcoil.run_rfcoil({"radius_mm": 30})
    assert seen["command"][1] == "run-script"
    assert seen["command"][2].endswith("sim.py")


def test_closed_circular_turns_use_bore_axis_z():
    import numpy as np

    rfcoil = _module()
    layout = rfcoil.winding_layout(
        n_windings=[1, 0, -1],
        groove_positions=np.array([-0.06, 0.0, 0.06]),
        coil_radius=0.03,
        former_thickness=0.005,
        wire_dia_ins=0.000879,
        wire_radius=0.00044,
    )
    assert len(layout["wires"]) == 2
    assert layout["wires"][0]["group"] == 0
    assert layout["wires"][1]["group"] == 1
    for wire in layout["wires"]:
        assert wire["closed"] is True
        assert len(wire["points"]) == rfcoil.LOOP_SEGMENTS
        zs = {round(point[2], 6) for point in wire["points"]}
        assert len(zs) == 1
        radii = [round((point[0] ** 2 + point[1] ** 2) ** 0.5, 5) for point in wire["points"]]
        assert max(radii) - min(radii) < 1e-6
    assert layout["vertices"]
    assert layout["faces"]
