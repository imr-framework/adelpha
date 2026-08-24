"""FIFO → WebSocket bridge. Acq/recon keep using Communicator; TypeScript never opens those pipes."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket

log = logging.getLogger("mri4all-api")

PIPE_DIR = Path("/tmp/mri4all/pipes")
ACQ_TO_UI = PIPE_DIR / "ui_recon_acq"
UI_TO_ACQ = PIPE_DIR / "acq_pipe"
RECON_TO_UI = PIPE_DIR / "ui_recon_pipe"
UI_TO_RECON = PIPE_DIR / "recon_pipe"

_clients: Set[WebSocket] = set()
_loop: Optional[asyncio.AbstractEventLoop] = None
_pending: Dict[str, asyncio.Future] = {}
_started = False


def attach_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


async def register(ws: WebSocket) -> None:
    await ws.accept()
    _clients.add(ws)


def unregister(ws: WebSocket) -> None:
    _clients.discard(ws)


async def broadcast(payload: dict) -> None:
    dead: Set[WebSocket] = set()
    text = json.dumps(payload)
    for ws in list(_clients):
        try:
            await ws.send_text(text)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _clients.discard(ws)


def _mkfifo(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    try:
        os.mkfifo(path)
    except FileExistsError:
        pass
    except OSError as exc:
        log.warning("Unable to create fifo %s: %s", path, exc)


def _listen_pipe(path: Path, source: str) -> None:
    _mkfifo(path)
    while True:
        try:
            with open(path, "r", encoding="utf-8") as fifo:
                for line in fifo:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        envelope = json.loads(line)
                    except json.JSONDecodeError:
                        log.warning("Invalid FIFO JSON from %s", source)
                        continue
                    if _loop:
                        asyncio.run_coroutine_threadsafe(
                            broadcast({"source": source, **envelope}),
                            _loop,
                        )
        except Exception as exc:
            log.warning("FIFO listener %s: %s", source, exc)


def start_listeners() -> None:
    global _started
    if _started:
        return
    _started = True
    for path, source in ((ACQ_TO_UI, "acq"), (RECON_TO_UI, "recon")):
        thread = threading.Thread(target=_listen_pipe, args=(path, source), daemon=True)
        thread.start()


def write_response(target: str, envelope: dict) -> bool:
    path = UI_TO_ACQ if target != "recon" else UI_TO_RECON
    _mkfifo(path)
    if not path.exists():
        return False
    try:
        with open(path, "w", encoding="utf-8") as fifo:
            fifo.write(json.dumps(envelope) + "\n")
        return True
    except Exception as exc:
        log.warning("Failed writing FIFO %s: %s", path, exc)
        return False


def complete_pending(event_id: str, value: Any) -> None:
    fut = _pending.pop(event_id, None)
    if fut and not fut.done():
        fut.set_result(value)
