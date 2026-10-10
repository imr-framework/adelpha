import json
from pathlib import Path

import pytest

console = Path(__file__).resolve().parents[1]


def _module():
    import sys

    sys.path.insert(0, str(console))
    from services.api import shim_sim

    return shim_sim


def test_request_keeps_the_two_trays():
    shim = _module()
    request = shim.shim_request(
        {
            "diameter_mm": 203.3,
            "bottom_mm": -48.5,
            "top_mm": 48.5,
            "magnet_mm": 6.35,
            "thickness_mm": 3.18,
            "polarization_t": 1.2,
            "radial_spacing": 1,
            "azimuthal_spacing": 1.25,
        }
    )
    assert request["diameter_mm"] == 203.3
    assert request["bottom_mm"] == -48.5
    assert request["top_mm"] == 48.5
    assert request["radial_spacing"] == 1

    clipped = shim.shim_request({"diameter_mm": 400, "bottom_mm": -200, "azimuthal_spacing": 9})
    assert clipped["diameter_mm"] == 300
    assert clipped["bottom_mm"] == -120
    assert clipped["azimuthal_spacing"] == 2.5


def test_missing_environment_is_reported(monkeypatch):
    shim = _module()
    monkeypatch.setenv("SHIM_PYTHON", "")
    monkeypatch.setattr(shim, "shim_python", lambda: "")
    with pytest.raises(RuntimeError, match="Passive shimming"):
        shim.run_shim({})


def test_runner_reads_result_json(monkeypatch):
    shim = _module()

    def fake_run(command, **_kwargs):
        result = Path(command[-1])
        result.write_text(json.dumps({"ok": True, "n_positive": 2, "n_negative": 1}), encoding="utf-8")
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(shim.subprocess, "run", fake_run)
    monkeypatch.setattr(shim, "shim_python", lambda: "python")
    payload = shim.run_shim({})
    assert payload["ok"] is True
    assert payload["n_positive"] == 2


def _npy_b64(rows: int = 4) -> str:
    import base64
    import struct

    header = "{'descr': '<f8', 'fortran_order': False, 'shape': (%d, 4), }" % rows
    padding = 64 - ((10 + len(header) + 1) % 64)
    header = header + " " * padding + "\n"
    body = b"\x93NUMPY\x01\x00" + struct.pack("<H", len(header)) + header.encode("latin1")
    for i in range(rows):
        body += struct.pack("<4d", float(i), 0.0, 0.0, 250.0 + i * 0.1)
    return base64.b64encode(body).decode("ascii")


def test_field_map_upload_is_written_next_to_the_request(monkeypatch):
    shim = _module()
    seen = {}

    def fake_run(command, **_kwargs):
        params = json.loads(Path(command[-2]).read_text(encoding="utf-8"))
        seen["params"] = params
        seen["bytes"] = Path(params["field_map_path"]).read_bytes()
        Path(command[-1]).write_text(json.dumps({"ok": True, "field": {"samples": 4}}), encoding="utf-8")
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(shim.subprocess, "run", fake_run)
    monkeypatch.setattr(shim, "shim_python", lambda: "python")

    upload = {"name": "nested/Exp_1044.npy", "data_b64": _npy_b64()}
    payload = shim.inspect_field_map({"field_map": upload, "center_map": False})
    assert payload["field"]["samples"] == 4
    assert seen["params"]["mode"] == "inspect"
    assert seen["params"]["center_map"] is False
    assert seen["params"]["field_map_name"] == "Exp_1044.npy"
    assert seen["bytes"].startswith(b"\x93NUMPY")

    shim.run_shim({"field_map": upload})
    assert seen["params"]["mode"] == "simulate"
    assert seen["params"]["center_map"] is True
    assert seen["params"]["diameter_mm"] == 203.3


def test_field_map_upload_is_validated():
    shim = _module()
    with pytest.raises(ValueError, match="Attach a field map"):
        shim.inspect_field_map({})
    with pytest.raises(ValueError, match="base64"):
        shim.field_map_upload({"field_map": {"name": "a.npy", "data_b64": "!!!"}})
    with pytest.raises(ValueError, match="NumPy"):
        shim.field_map_upload({"field_map": {"name": "a.csv", "data_b64": "aGVsbG8="}})
    assert shim.field_map_upload({}) is None


def test_export_writes_to_the_chosen_folder(monkeypatch, tmp_path):
    shim = _module()
    seen = {}

    def fake_run(command, **_kwargs):
        params = json.loads(Path(command[-2]).read_text(encoding="utf-8"))
        seen["params"] = params
        Path(command[-1]).write_text(
            json.dumps({"ok": True, "folder": params["destination"], "files": [{"name": "shim_tray_top.stl"}]}),
            encoding="utf-8",
        )
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(shim.subprocess, "run", fake_run)
    monkeypatch.setattr(shim, "shim_python", lambda: "python")
    payload = shim.export_shim({"states": [1, 0, -1], "destination": str(tmp_path)})
    assert payload["folder"] == str(tmp_path)
    assert seen["params"]["mode"] == "export"
    assert seen["params"]["states"] == [1, 0, -1]
    assert seen["params"]["destination"] == str(tmp_path)


def test_export_needs_states_and_an_existing_folder(tmp_path):
    shim = _module()
    with pytest.raises(ValueError, match="states"):
        shim.export_shim({})
    with pytest.raises(ValueError, match="existing folder"):
        shim.export_shim({"states": [1], "destination": str(tmp_path / "missing")})
