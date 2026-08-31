from __future__ import annotations

import logging
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Callable, Literal

from adelpha_runtime.logconfig import redact

log = logging.getLogger("adelpha.runtime.process")

StartPolicy = Literal["always", "lazy"]
RestartPolicy = Literal["never", "on-failure"]


@dataclass
class ServiceDef:
    id: str
    title: str
    required: bool
    start: StartPolicy
    restart: RestartPolicy
    version: str
    description: str
    mount_factory: Callable[[], object] | None = None
    child_factory: Callable[[int], subprocess.Popen] | None = None
    health_path: str = "/health"
    proxy_prefix: str | None = None
    wait_for_listen: bool = False


@dataclass
class ServiceState:
    definition: ServiceDef
    status: Literal["stopped", "starting", "healthy", "error", "unavailable"] = "stopped"
    detail: str = ""
    pid: int | None = None
    child: subprocess.Popen | None = None
    internal_port: int | None = None
    started_at: float | None = None
    mount: object | None = None


def spawn_child(args: list[str], env: dict[str, str], *, cwd: str | None = None) -> subprocess.Popen:
    creationflags = 0
    preexec = None
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        preexec = os.setsid  # type: ignore[attr-defined]
    child = subprocess.Popen(
        args,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        creationflags=creationflags,
        preexec_fn=preexec,
    )
    threading.Thread(target=_drain, args=(child, args[0] if args else "child"), daemon=True).start()
    return child


def _drain(child: subprocess.Popen, name: str) -> None:
    if not child.stdout:
        return
    for raw in child.stdout:
        line = raw.decode("utf-8", errors="replace").rstrip()
        log.info("child[%s] %s", name, redact(line))


def stop_child(child: subprocess.Popen, *, timeout: float = 8.0) -> None:
    if child.poll() is not None:
        return
    try:
        if os.name == "nt":
            child.send_signal(signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
        else:
            os.killpg(os.getpgid(child.pid), signal.SIGTERM)
    except Exception:
        child.terminate()
    deadline = time.time() + timeout
    while time.time() < deadline:
        if child.poll() is not None:
            return
        time.sleep(0.05)
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(child.pid), signal.SIGKILL)
        else:
            child.kill()
    except Exception:
        child.kill()


def current_python() -> str:
    return sys.executable


def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def wait_for_listen(port: int, child: subprocess.Popen, *, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if child.poll() is not None:
            raise RuntimeError(f"process exited before it listened (code {child.returncode})")
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            probe.settimeout(0.25)
            try:
                probe.connect(("127.0.0.1", port))
            finally:
                probe.close()
            return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"process did not listen on 127.0.0.1:{port} within {timeout:.0f}s")
