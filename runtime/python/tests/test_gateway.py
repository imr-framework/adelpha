from __future__ import annotations

from adelpha_runtime.gateway import create_gateway_app
from adelpha_runtime.process import ServiceDef
from adelpha_runtime.registry import ServiceRegistry

from .conftest import TOKEN, gateway_client, stub_registry


def test_health_requires_token():
    client = gateway_client()
    assert client.get("/runtime/health").status_code == 401


def test_health_with_token():
    client = gateway_client()
    res = client.get("/runtime/health", headers={"Authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["services"]["twin"]["status"] == "healthy"
    assert body["services"]["console"]["status"] == "healthy"
    assert body["services"]["agents"]["status"] == "stopped"


def test_mounted_stub_services():
    client = gateway_client()
    headers = {"Authorization": f"Bearer {TOKEN}"}
    twin = client.get("/api/dtam/health", headers=headers)
    console = client.get("/api/mri/health", headers=headers)
    assert twin.status_code == 200
    assert twin.json()["service"] == "twin"
    assert console.status_code == 200
    assert console.json()["service"] == "console"


def test_query_token_accepted():
    client = gateway_client()
    res = client.get(f"/runtime/health?token={TOKEN}")
    assert res.status_code == 200


def test_required_service_failure_is_reported():
    def boom():
        raise RuntimeError("Twin service failed to initialize")

    registry = ServiceRegistry(
        [
            ServiceDef(
                id="twin",
                title="Twin",
                required=True,
                start="always",
                restart="never",
                version="0.1.0",
                description="stub",
                mount_factory=boom,
            ),
            ServiceDef(
                id="console",
                title="Console",
                required=True,
                start="always",
                restart="never",
                version="0.1.0",
                description="stub",
                mount_factory=lambda: __import__("fastapi").FastAPI(),
            ),
        ]
    )
    registry.start_always()
    app = create_gateway_app(registry, token=TOKEN, session_id="s")
    from fastapi.testclient import TestClient

    client = TestClient(app)
    body = client.get("/runtime/health", headers={"Authorization": f"Bearer {TOKEN}"}).json()
    assert body["ok"] is False
    assert "twin" in body["required_failed"]
    assert "Twin service failed to initialize" in registry.states["twin"].detail


def test_optional_service_failure_does_not_fail_runtime():
    def boom(_port: int):
        raise RuntimeError("agents unavailable")

    registry = stub_registry()
    registry.states["agents"].definition.child_factory = boom
    registry.start("agents")
    app = create_gateway_app(registry, token=TOKEN, session_id="s")
    from fastapi.testclient import TestClient

    client = TestClient(app)
    body = client.get("/runtime/health", headers={"Authorization": f"Bearer {TOKEN}"}).json()
    assert body["ok"] is True
    assert body["services"]["agents"]["status"] == "error"


def test_lazy_start_endpoint():
    import os
    import sys

    from adelpha_runtime.process import spawn_child

    registry = stub_registry()

    def child(port: int):
        return spawn_child([sys.executable, "-c", "import time; time.sleep(30)"], os.environ.copy())

    registry.states["agents"].definition.child_factory = child
    client = gateway_client(registry)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    before = client.get("/runtime/health", headers=headers).json()
    assert before["services"]["agents"]["status"] == "stopped"
    started = client.post("/runtime/services/agents/start", headers=headers).json()
    assert started["status"] == "healthy"
    registry.stop_all()


def test_agents_unstarted_returns_actionable_error():
    client = gateway_client()
    res = client.get("/api/agents/list-apps", headers={"Authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 503
    assert res.json()["detail"]


def test_agents_proxy_lazy_starts():
    import os
    import sys

    from adelpha_runtime.process import spawn_child

    registry = stub_registry()

    def child(port: int):
        script = f"""
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'["dtam"]')
    def log_message(self, *args):
        pass
HTTPServer(("127.0.0.1", {port}), H).serve_forever()
"""
        return spawn_child([sys.executable, "-c", script], os.environ.copy())

    registry.states["agents"].definition.child_factory = child
    registry.states["agents"].definition.wait_for_listen = True
    client = gateway_client(registry)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    res = client.get("/api/agents/list-apps", headers=headers)
    assert res.status_code == 200
    assert res.json() == ["dtam"]
    registry.stop_all()


def test_configure_google_api_key_starts_agents(monkeypatch):
    import os
    import sys

    from adelpha_runtime.process import spawn_child

    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    registry = stub_registry()

    def child(port: int):
        return spawn_child([sys.executable, "-c", "import time; time.sleep(30)"], os.environ.copy())

    registry.states["agents"].definition.child_factory = child
    client = gateway_client(registry)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    denied = client.post("/runtime/secrets/google-api-key", json={"api_key": "test-key-value"})
    assert denied.status_code == 401
    res = client.post(
        "/runtime/secrets/google-api-key",
        json={"api_key": "test-key-value"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["agents"]["status"] == "healthy"
    assert os.environ.get("GOOGLE_API_KEY") == "test-key-value"
    cleared = client.post(
        "/runtime/secrets/google-api-key",
        json={"api_key": None},
        headers=headers,
    )
    assert cleared.status_code == 200
    assert os.environ.get("GOOGLE_API_KEY") in {None, ""}
    assert cleared.json()["agents"]["status"] == "stopped"
    registry.stop_all()
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
