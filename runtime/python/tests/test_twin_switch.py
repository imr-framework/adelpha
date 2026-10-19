"""Scanner switching stays inside the running gateway and preserves other services."""
import pytest
from fastapi.testclient import TestClient
from adelpha_runtime.gateway import create_gateway_app
from adelpha_runtime.paths import sidecar_root
from adelpha_runtime.process import ServiceDef
from adelpha_runtime.registry import ServiceRegistry

dtam_api = pytest.importorskip("dtam.api.app")
create_app = dtam_api.create_app

CONFIGS = sidecar_root() / "dtam" / "configs"


@pytest.mark.skipif(not CONFIGS.is_dir(), reason="DTAM configs not present")
def test_switch_keeps_gateway_and_rolls_back_invalid_profile():
    twin = create_app(config_root=CONFIGS)
    registry = ServiceRegistry([ServiceDef(id="twin", title="Twin", required=True,
        start="always", restart="never", version="test", description="test", mount_factory=lambda: twin)])
    registry.start_always()
    gateway = create_gateway_app(registry, token="test-token", session_id="unchanged")
    with TestClient(gateway) as client:
        client.headers["Authorization"] = "Bearer test-token"
        assert client.post("/runtime/twin/configuration", json={"scanner_id": "halbach_48mt", "environment": "development"}).status_code == 200
        assert client.get("/api/dtam/health").json()["mode"] == "read_only"
        assert client.post("/runtime/twin/configuration", json={"scanner_id": "missing", "environment": "development"}).status_code == 422
        assert client.get("/api/dtam/health").json()["scanner_id"] == "halbach_48mt"
        assert client.post("/runtime/twin/configuration", json={"scanner_id": "simulated_scanner", "environment": "development"}).status_code == 200
        assert client.get("/api/dtam/health").json()["mode"] == "simulation"
        assert client.get("/runtime/health").json()["session"] == "unchanged"
