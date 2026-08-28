from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
from pathlib import Path

import httpx
import uvicorn

from adelpha_runtime.gateway import create_gateway_app
from adelpha_runtime.paths import HANDSHAKE_PREFIX

from .conftest import TOKEN, stub_registry


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_dynamic_port_and_handshake(isolated_data):
    registry = stub_registry()
    app = create_gateway_app(registry, token=TOKEN, session_id="sess")
    port = _free_port()
    handshake: dict = {}
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    original = server.startup

    async def startup(**kwargs):
        await original(**kwargs)
        handshake["payload"] = {
            "ok": True,
            "port": port,
            "token": TOKEN,
            "base_url": f"http://127.0.0.1:{port}",
        }

    server.startup = startup  # type: ignore[method-assign]
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 8
    while time.time() < deadline and not handshake:
        time.sleep(0.05)
    assert handshake["payload"]["port"] == port
    with httpx.Client(timeout=5) as client:
        denied = client.get(f"http://127.0.0.1:{port}/runtime/health")
        assert denied.status_code == 401
        ok = client.get(
            f"http://127.0.0.1:{port}/runtime/health",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert ok.status_code == 200
        assert ok.json()["ok"] is True
    server.should_exit = True
    thread.join(timeout=5)


def test_handshake_prefix_is_stable():
    assert HANDSHAKE_PREFIX == "ADELPHA_RUNTIME_READY "
    sample = HANDSHAKE_PREFIX + json.dumps({"ok": True, "port": 1})
    assert sample.startswith("ADELPHA_RUNTIME_READY ")
