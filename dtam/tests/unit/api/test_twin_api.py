"""HTTP API tests for the twin REST surface."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from dtam.api.app import create_app


@pytest.fixture
def client(config_root: Path) -> TestClient:
    app = create_app(
        scanner_id="simulated_scanner",
        environment="testing",
        config_root=config_root,
    )
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["scanner_id"] == "simulated_scanner"
    assert body["connected"] is True


def test_twin_state(client: TestClient) -> None:
    response = client.get("/twin/state")
    assert response.status_code == 200
    body = response.json()
    assert body["scanner_id"] == "simulated_scanner"
    assert body["twin_version"] == "phase2b-thermal-emi-rf-v1"
    assert body["thermal"] is not None
    assert body["magnetic"] is not None
    assert body["emi"] is not None
    assert body["rf"] is not None
    assert body["thermal"]["mean_magnet_temperature_c"]["value"] is not None
    assert body["magnetic"]["b0_t"]["value"] is not None


def test_twin_forecast(client: TestClient) -> None:
    response = client.post(
        "/twin/forecast",
        json={
            "predict_horizon_s": 60.0,
            "magnet_setpoint_c": 26.0,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["thermal"]["predicted_mean_magnet_temperature_c"] is not None
    assert body["magnetic"]["predicted_b0_t"] is not None
    assert any("horizon_s=60" in note for note in body["notes"])


def test_sensors_batch(client: TestClient) -> None:
    response = client.get("/sensors/batch")
    assert response.status_code == 200
    body = response.json()
    assert body["scanner_id"] == "simulated_scanner"
    assert len(body["measurements"]) >= 3


def test_assess_from_twin(client: TestClient) -> None:
    response = client.post("/assess/from-twin", json={"mode": "observe"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["twin"]["thermal"] is not None
    assert "activated_agents" in body["assessment"]
    assert body["assessment"]["overall_confidence"] >= 0.0


def test_assess_observation_json(client: TestClient) -> None:
    example = (
        Path(__file__).resolve().parents[3]
        / "src"
        / "dtam"
        / "agents"
        / "examples"
        / "thermal_drift.json"
    )
    payload = json.loads(example.read_text(encoding="utf-8"))
    response = client.post(
        "/assess?mode=recommend",
        json=payload,
    )
    assert response.status_code == 200
    body = response.json()
    assert "thermal_agent" in body["activated_agents"]
    assert body["operating_mode"] == "recommend"
