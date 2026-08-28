#!/usr/bin/env python3
"""Launch the built sidecar, parse the handshake, hit /runtime/health, stop."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[2]
BUNDLE = REPO / "src-tauri" / "resources" / "python-runtime"
EXE = BUNDLE / ("adelpha-python-runtime.exe" if os.name == "nt" else "adelpha-python-runtime")
PREFIX = "ADELPHA_RUNTIME_READY "


def main() -> int:
    if not EXE.is_file():
        print(f"error: sidecar missing at {EXE}", file=sys.stderr)
        return 2
    data = Path(tempfile.mkdtemp(prefix="adelpha-smoke-"))
    env = os.environ.copy()
    env["ADELPHA_DATA_DIR"] = str(data)
    env["ADELPHA_LOG_DIR"] = str(data / "logs")
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        [str(EXE)],
        cwd=str(BUNDLE),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    handshake = None
    deadline = time.time() + 90
    assert proc.stdout is not None
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        if line.startswith(PREFIX):
            handshake = json.loads(line[len(PREFIX) :])
            break
    if not handshake:
        proc.kill()
        print("error: no handshake", file=sys.stderr)
        return 1
    token = handshake["token"]
    base = handshake.get("base_url") or f"http://127.0.0.1:{handshake['port']}"
    with httpx.Client(timeout=10) as client:
        res = client.get(f"{base}/runtime/health", headers={"Authorization": f"Bearer {token}"})
        res.raise_for_status()
        body = res.json()
        print(json.dumps({"handshake_ok": handshake.get("ok"), "health": body}, indent=2))
        client.post(f"{base}/runtime/shutdown", headers={"Authorization": f"Bearer {token}"})
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=5)
    return 0 if handshake.get("ok") or body.get("ok") is not None else 1


if __name__ == "__main__":
    raise SystemExit(main())
