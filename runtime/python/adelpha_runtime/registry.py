from __future__ import annotations

import logging
import os
import socket
import sys
import threading
from pathlib import Path
from typing import Iterable

from adelpha_runtime.paths import RuntimePaths, cors_origins
from adelpha_runtime.process import (
    ServiceDef,
    ServiceState,
    current_python,
    frozen,
    spawn_child,
    stop_child,
    wait_for_listen,
)
from adelpha_runtime.secrets import apply_google_api_key

log = logging.getLogger("adelpha.runtime.registry")


class ServiceRegistry:
    def __init__(self, defs: Iterable[ServiceDef]) -> None:
        self.states: dict[str, ServiceState] = {item.id: ServiceState(definition=item) for item in defs}
        self._lock = threading.Lock()

    def snapshot(self) -> dict[str, dict[str, object]]:
        out: dict[str, dict[str, object]] = {}
        for sid, state in self.states.items():
            out[sid] = {
                "id": sid,
                "title": state.definition.title,
                "required": state.definition.required,
                "start": state.definition.start,
                "status": state.status,
                "detail": state.detail,
                "pid": state.pid,
                "version": state.definition.version,
            }
        return out

    def required_failed(self) -> list[str]:
        failed = []
        for state in self.states.values():
            if state.definition.required and state.status in {"error", "unavailable", "stopped"}:
                if state.definition.start == "always":
                    failed.append(state.definition.id)
        return failed

    def start_always(self) -> None:
        for state in self.states.values():
            if state.definition.start == "always":
                self.start(state.definition.id)

    def start(self, service_id: str) -> ServiceState:
        with self._lock:
            return self._start_locked(service_id)

    def _start_locked(self, service_id: str) -> ServiceState:
        state = self.states[service_id]
        if state.status in {"healthy", "starting"} and state.mount is not None:
            return state
        if state.status == "healthy" and state.child and state.child.poll() is None:
            return state
        state.status = "starting"
        state.detail = ""
        try:
            if state.definition.mount_factory is not None:
                state.mount = state.definition.mount_factory()
                state.status = "healthy"
                state.pid = os.getpid()
                state.detail = "mounted in supervisor"
                log.info("started %s (in-process)", service_id)
                return state
            if state.definition.child_factory is not None:
                port = _free_port()
                child = state.definition.child_factory(port)
                state.child = child
                state.pid = child.pid
                state.internal_port = port
                try:
                    if state.definition.wait_for_listen:
                        wait_for_listen(port, child)
                except Exception:
                    stop_child(child)
                    state.child = None
                    state.pid = None
                    state.internal_port = None
                    raise
                state.status = "healthy"
                state.detail = f"child pid={child.pid} port={port}"
                threading.Thread(
                    target=self._watch_child,
                    args=(service_id,),
                    daemon=True,
                ).start()
                log.info("started %s as child pid=%s", service_id, child.pid)
                return state
            state.status = "unavailable"
            state.detail = "no start method"
        except Exception as exc:
            log.exception("failed to start %s", service_id)
            state.status = "error"
            state.detail = str(exc)
            state.mount = None
        return state

    def stop(self, service_id: str) -> ServiceState:
        with self._lock:
            state = self.states[service_id]
            if state.child is None and state.mount is not None:
                return state
            state.status = "stopped"
            state.detail = ""
            if state.child is not None:
                stop_child(state.child)
                state.child = None
            state.pid = None
            state.internal_port = None
            return state

    def stop_all(self) -> None:
        for state in self.states.values():
            if state.child is None:
                continue
            state.status = "stopped"
            state.detail = ""
            stop_child(state.child)
            state.child = None
            state.pid = None
            state.internal_port = None

    def _watch_child(self, service_id: str) -> None:
        state = self.states[service_id]
        child = state.child
        if child is None:
            return
        code = child.wait()
        if state.status == "stopped":
            return
        state.status = "error"
        state.detail = f"process exited unexpectedly (code {code})"
        log.error("%s exited unexpectedly code=%s", service_id, code)
        if state.definition.restart == "on-failure" and state.definition.start == "lazy":
            log.info("restart policy on-failure for %s — not auto-restarting until requested", service_id)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _adk_apps_dir(paths: RuntimePaths) -> tuple[Path, str]:
    """Return (cwd, agents_dir argument for `adk api_server`)."""
    src = paths.dtam_src
    if src is None:
        raise RuntimeError("DTAM sources are not available for the agent service")
    if src.name == "src" and (src / "dtam" / "agents").is_dir():
        return src.parent, "src"
    if (src / "dtam" / "agents").is_dir():
        return src, "."
    raise RuntimeError("DTAM agent sources are not available in this install")


def _adk_argv(paths: RuntimePaths, port: int) -> tuple[list[str], str]:
    cwd, apps = _adk_apps_dir(paths)
    cli = [
        "api_server",
        apps,
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]
    seen_origins: set[str] = set()
    for origin in [*cors_origins(), "http://127.0.0.1", "http://localhost"]:
        if origin in seen_origins:
            continue
        seen_origins.add(origin)
        cli.extend(["--allow_origins", origin])

    if frozen():
        # PyInstaller binaries are not a python interpreter: `-c` is rejected
        # as an adelpha-python-runtime flag (exit code 2).
        return [current_python(), "adk-child", *cli], str(cwd)

    env_python = current_python()
    venv_bin = Path(env_python).parent
    adk_bin = venv_bin / ("adk.exe" if os.name == "nt" else "adk")
    if adk_bin.is_file():
        return [env_python, str(adk_bin), *cli], str(cwd)
    return [
        env_python,
        "-c",
        "import sys; from google.adk.cli import main; sys.argv = ['adk'] + sys.argv[1:]; raise SystemExit(main())",
        *cli,
    ], str(cwd)


def _prepend_sys_path(path: str) -> None:
    if path not in sys.path:
        sys.path.insert(0, path)


def build_registry(paths: RuntimePaths) -> ServiceRegistry:
    def twin_factory():
        if paths.dtam_src is not None:
            _prepend_sys_path(str(paths.dtam_src))
        if paths.dtam_configs is not None:
            os.environ.setdefault("DTAM_CONFIG_DIR", str(paths.dtam_configs))
        try:
            from dtam.api.app import create_app
        except ImportError as exc:
            raise RuntimeError(
                f"Twin service failed to initialize ({exc}). "
                "Run `make install` so DTAM is installed into the Python runtime."
            ) from exc
        return create_app(
            scanner_id=os.environ.get("DTAM_SCANNER_ID", "simulated_scanner"),
            environment=os.environ.get("DTAM_ENVIRONMENT", "production"),
            config_root=paths.dtam_configs,
        )

    def console_factory():
        if paths.console_root is None:
            raise RuntimeError("Imaging console sources are not available in this install")
        _prepend_sys_path(str(paths.console_root))
        _prepend_sys_path(str(paths.console_root / "external"))
        os.environ.setdefault("MRI4ALL_BASE", str(paths.data_dir / "mri4all"))
        os.environ.setdefault("MRI4ALL_DEBUG", "true")
        (paths.data_dir / "mri4all" / "logs").mkdir(parents=True, exist_ok=True)
        (paths.data_dir / "mri4all" / "config").mkdir(parents=True, exist_ok=True)
        (paths.data_dir / "mri4all" / "data").mkdir(parents=True, exist_ok=True)
        import asyncio

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.set_event_loop(asyncio.new_event_loop())
        from services.api.app import app as console_app

        return console_app

    def agents_child(port: int):
        apply_google_api_key(paths)
        if not os.environ.get("GOOGLE_API_KEY", "").strip():
            raise RuntimeError(
                "Agent service needs GOOGLE_API_KEY. In development put it in dtam/.env; "
                "in the packaged app write it to the google_api_key config file."
            )
        args, cwd = _adk_argv(paths, port)
        env = os.environ.copy()
        if paths.dtam_src is not None:
            env["PYTHONPATH"] = str(paths.dtam_src) + os.pathsep + env.get("PYTHONPATH", "")
        # Do not Path.resolve() the interpreter: uv venvs symlink python out of `.venv/bin`.
        venv_bin = Path(args[0]).parent
        env["PATH"] = str(venv_bin) + os.pathsep + env.get("PATH", "")
        env["VIRTUAL_ENV"] = str(venv_bin.parent)
        return spawn_child(args, env, cwd=cwd)

    defs = [
        ServiceDef(
            id="twin",
            title="DTAM Twin API",
            required=True,
            start="always",
            restart="never",
            version="0.1.0",
            description="Telemetry, forecast, and assessment over ThermalMagneticTwin.",
            mount_factory=twin_factory,
            health_path="/health",
        ),
        ServiceDef(
            id="console",
            title="Imaging Console API",
            required=True,
            start="always",
            restart="never",
            version="0.0.1-alpha.1",
            description="MRI4ALL FastAPI façade for registration, sequences, and studies.",
            mount_factory=console_factory,
            health_path="/health",
        ),
        ServiceDef(
            id="agents",
            title="ADK agent runtime",
            required=False,
            start="lazy",
            restart="on-failure",
            version="0.1.0",
            description="Google ADK api_server. Starts when a user API key is present.",
            child_factory=agents_child,
            health_path="/list-apps",
            proxy_prefix="/api/agents",
            wait_for_listen=True,
        ),
    ]
    return ServiceRegistry(defs)
