"""Adelpha Python supervisor entry point.

Start without a system Python when frozen; in development run:

    python -m adelpha_runtime
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import socket
import sys
import threading
from typing import Any

import uvicorn

from adelpha_runtime.first_run import initialize_user_data
from adelpha_runtime.gateway import create_gateway_app
from adelpha_runtime.lock import RuntimeLock, RuntimeLockError
from adelpha_runtime.logconfig import configure_logging, set_session_id
from adelpha_runtime.paths import HANDSHAKE_PREFIX, RUNTIME_VERSION, resolve_paths, session_token
from adelpha_runtime.registry import build_registry
from adelpha_runtime.secrets import apply_google_api_key

log = logging.getLogger("adelpha.runtime")


def _pick_port(requested: int) -> int:
    if requested > 0:
        return requested
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _emit_handshake(payload: dict[str, Any]) -> None:
    sys.stdout.write(HANDSHAKE_PREFIX + json.dumps(payload, default=str) + "\n")
    sys.stdout.flush()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="adelpha-python-runtime")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (loopback only)")
    parser.add_argument("--port", type=int, default=0, help="Gateway port; 0 selects an ephemeral port")
    parser.add_argument("--dev", action="store_true", help="Development logging")
    return parser


def run_adk_child(argv: list[str]) -> int:
    """Run `adk api_server …` inside this frozen executable (no `python -c`)."""
    from google.adk.cli import main as adk_main

    sys.argv = ["adk", *argv]
    result = adk_main()
    return int(result) if result is not None else 0


def main(argv: list[str] | None = None) -> int:
    import multiprocessing

    multiprocessing.freeze_support()
    raw = list(sys.argv[1:] if argv is None else argv)
    if raw and raw[0] == "adk-child":
        return run_adk_child(raw[1:])
    args = build_parser().parse_args(raw)
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        log.error("refusing to bind %s — loopback only", args.host)
        return 2

    paths = resolve_paths()
    initialize_user_data(paths)
    token = session_token()
    session_id = token[:12]
    set_session_id(session_id)
    configure_logging(paths.log_dir, level="DEBUG" if args.dev else os.environ.get("ADELPHA_LOG_LEVEL", "INFO"))

    lock = RuntimeLock(paths.data_dir)
    try:
        lock.acquire()
    except RuntimeLockError as exc:
        log.error("%s", exc)
        _emit_handshake(
            {
                "ok": False,
                "error": str(exc),
                "version": RUNTIME_VERSION,
            }
        )
        return 1

    has_api_key = apply_google_api_key(paths)
    registry = build_registry(paths)
    registry.start_always()
    start_agents = os.environ.get("ADELPHA_START_AGENTS", "").lower() in {"1", "true", "yes"}
    if start_agents or has_api_key:
        threading.Thread(target=lambda: registry.start("agents"), daemon=True, name="adelpha-agents").start()

    failed = registry.required_failed()
    app = create_gateway_app(
        registry,
        token=token,
        session_id=session_id,
        extra={"resource_dir": str(paths.resource_dir), "data_dir": str(paths.data_dir)},
    )

    port = _pick_port(int(os.environ.get("ADELPHA_GATEWAY_PORT", args.port) or 0))
    config = uvicorn.Config(
        app,
        host=args.host,
        port=port,
        log_config=None,
        access_log=False,
        lifespan="on",
    )
    server = uvicorn.Server(config)
    app.state.uvicorn_server = server

    original_startup = server.startup

    async def startup(**kwargs: Any) -> None:
        await original_startup(**kwargs)
        _emit_handshake(
            {
                "ok": not failed,
                "host": args.host,
                "port": port,
                "token": token,
                "version": RUNTIME_VERSION,
                "session": session_id,
                "services": registry.snapshot(),
                "required_failed": failed,
                "base_url": f"http://{args.host}:{port}",
            }
        )
        if failed:
            log.error("required services failed: %s", ", ".join(failed))

    server.startup = startup  # type: ignore[method-assign]

    def _handle_stop(signum: int, _frame: object) -> None:
        log.info("received signal %s — shutting down", signum)
        server.should_exit = True
        registry.stop_all()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_stop)
        except Exception:
            pass

    try:
        server.run()
        return 0 if not failed else 1
    finally:
        registry.stop_all()
        lock.release()


if __name__ == "__main__":
    raise SystemExit(main())
