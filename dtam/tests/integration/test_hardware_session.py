"""Hardware selection must keep the API alive without inventing measurements."""
import json
from dtam.api.session import TwinApiSession
from dtam.domain.modes import OperationalMode


def test_halbach_waits_without_crashing(config_root):
    session = TwinApiSession.create(scanner_id="halbach_48mt", config_root=config_root)
    assert session.mode == OperationalMode.READ_ONLY
    assert not session.connected
    state = session.update_twin()
    assert state.scanner_id == "halbach_48mt"
    assert state.thermal is None and state.emi is None and state.magnetic is None
    session.close()


def test_custom_system_and_switch_back(config_root, tmp_path, monkeypatch):
    path = tmp_path / "prefs.json"
    path.write_text(json.dumps({"custom_systems": [{"id": "custom_test", "display_name": "My scanner",
        "architecture": "C magnet", "field_strength_t": 0.1}]}))
    monkeypatch.setenv("ADELPHA_DTAM_PREFS", str(path))
    hardware = TwinApiSession.create(scanner_id="custom_test", config_root=config_root)
    assert hardware.scanner_id == "custom_test"
    assert hardware._app.adapter.identity.field_strength_t == 0.1
    assert hardware.update_twin().mode == OperationalMode.READ_ONLY
    assert not hardware.read_batch().measurements
    hardware.close()
    simulation = TwinApiSession.create(config_root=config_root)
    assert simulation.mode == OperationalMode.SIMULATION
    assert simulation.connected
    assert simulation.read_batch().measurements
    simulation.close()


def test_hardware_api_starts_and_serves_empty_state(config_root):
    from fastapi.testclient import TestClient
    from dtam.api.app import create_app
    with TestClient(create_app(scanner_id="halbach_48mt", config_root=config_root)) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["mode"] == "read_only"
        assert health.json()["connected"] is False
        state = client.get("/twin/state")
        assert state.status_code == 200
        assert state.json()["thermal"] is None
