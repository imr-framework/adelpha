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
    request = shim.shim_request({"diameter_mm": 152, "offset_mm": 48.5, "dsv_mm": 70, "candidates": 20, "steps": 40})
    assert request["diameter_mm"] == 152
    assert request["offset_mm"] == 48.5
    assert request["candidates"] == 20

    clipped = shim.shim_request({"candidates": 2, "steps": 200, "diameter_mm": 400})
    assert clipped["candidates"] == 8
    assert clipped["steps"] == 80
    assert clipped["diameter_mm"] == 250


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
