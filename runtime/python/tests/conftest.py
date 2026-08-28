from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adelpha_runtime.gateway import create_gateway_app
from adelpha_runtime.process import ServiceDef, spawn_child, stop_child
from adelpha_runtime.registry import ServiceRegistry


TOKEN = "test-session-token"


def _stub_app(name: str) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": name}

    return app


def stub_registry(*, agents: bool = False) -> ServiceRegistry:
    defs = [
        ServiceDef(
            id="twin",
            title="Twin",
            required=True,
            start="always",
            restart="never",
            version="0.1.0",
            description="stub",
            mount_factory=lambda: _stub_app("twin"),
        ),
        ServiceDef(
            id="console",
            title="Console",
            required=True,
            start="always",
            restart="never",
            version="0.1.0",
            description="stub",
            mount_factory=lambda: _stub_app("console"),
        ),
        ServiceDef(
            id="agents",
            title="Agents",
            required=False,
            start="lazy",
            restart="never",
            version="0.1.0",
            description="stub",
            child_factory=(lambda port: spawn_child([sys.executable, "-c", "import time; time.sleep(30)"], os.environ.copy()))
            if agents
            else None,
        ),
    ]
    registry = ServiceRegistry(defs)
    registry.start_always()
    return registry


def gateway_client(registry: ServiceRegistry | None = None) -> TestClient:
    registry = registry or stub_registry()
    app = create_gateway_app(registry, token=TOKEN, session_id="testsession")
    return TestClient(app)


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    data = tmp_path / "Adelpha Data"
    monkeypatch.setenv("ADELPHA_DATA_DIR", str(data))
    monkeypatch.setenv("ADELPHA_CONFIG_DIR", str(data / "config"))
    monkeypatch.setenv("ADELPHA_LOG_DIR", str(data / "logs"))
    monkeypatch.setenv("ADELPHA_CACHE_DIR", str(data / "cache"))
    monkeypatch.setenv("ADELPHA_TEMP_DIR", str(data / "tmp"))
    return data
