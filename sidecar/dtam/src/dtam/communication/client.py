"""Reusable Python device client; hardware acquisition belongs to the caller."""

from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from jsonschema import Draft202012Validator
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from .protocol import Command, Publish, Registration, RpcError, encode
from .rpc import Peer


class DeviceClient:
    def __init__(self, url: str, device_id: str, token: str, *, journal_path=None):
        """url is ws[s]://PC:8765/ws/DEVICE_ID; token is never put in the URL."""
        self.url, self.device_id, self.token = url, device_id, token
        self.boot_id = uuid.uuid4().hex
        self.started = time.monotonic()
        self.sequence = 0
        self.peer = None
        self.handlers = {}
        self.workers = set()
        self.journal = None
        if journal_path is not None:
            path = Path(journal_path).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            self.journal = sqlite3.connect(path)
            self.journal.execute(
                "CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL)"
            )
            self.journal.commit()

    def now_ms(self):
        return int((time.monotonic() - self.started) * 1000)

    def actuator(self, actuator_id, operation, *, argument_schema):
        """Register an async handler returning the applied state (a JSON object)."""
        if self.journal is None:
            raise ValueError(
                "Actuator handlers require journal_path for restart-safe deduplication"
            )
        Draft202012Validator.check_schema(argument_schema)
        if "$ref" in json.dumps(argument_schema) or "$dynamicRef" in json.dumps(
            argument_schema
        ):
            raise ValueError("Argument schemas must be self-contained")

        def register(handler):
            self.handlers[(actuator_id, operation)] = (handler, argument_schema)
            return handler

        return register

    def _status(self, command_id):
        row = (
            self.journal.execute(
                "SELECT payload, status FROM commands WHERE id=?", (command_id,)
            ).fetchone()
            if self.journal
            else None
        )
        if row:
            return json.loads(row[0]), json.loads(row[1])
        return None

    async def _dispatch(self, method, params, has_id):
        if method == "device.describe":
            return self._registration()
        if method == "actuators.get_status":
            row = self._status(params["command_id"])
            return (
                row[1]
                if row
                else {"command_id": params["command_id"], "status": "unknown"}
            )
        if method != "actuators.set":
            raise RpcError(-32601, "Method not found")
        if not has_id:
            raise RpcError(-32600, "Actuator commands require a response id")
        command = Command.model_validate(params)
        if command.device_id != self.device_id:
            raise RpcError(-32001, "Device identity mismatch")
        handler = self.handlers.get((command.actuator_id, command.operation))
        if handler is None:
            raise RpcError(-32601, "Actuator operation is not registered")
        if list(Draft202012Validator(handler[1]).iter_errors(command.arguments)):
            raise RpcError(-32602, "Invalid actuator arguments")
        payload = command.model_dump()
        previous = self._status(command.command_id)
        if previous:
            if previous[0] != payload:
                raise RpcError(-32602, "command_id already has different arguments")
            return previous[1]
        # Bound on-disk history without forgetting IDs and silently replaying commands.
        if self.journal.execute("SELECT count(*) FROM commands").fetchone()[0] >= 10000:
            raise RpcError(
                -32002, "Command journal full; archive it after reviewing outcomes"
            )
        if self.workers:
            raise RpcError(-32002, "An actuator operation is already running")
        status = {
            "device_id": self.device_id,
            "command_id": command.command_id,
            "actuator_id": command.actuator_id,
            "status": "accepted",
        }
        self.journal.execute(
            "INSERT INTO commands VALUES (?, ?, ?)",
            (command.command_id, encode(payload), encode(status)),
        )
        self.journal.commit()  # Persist BEFORE invoking the hardware handler.
        task = asyncio.create_task(self._execute(handler[0], command, status))
        self.workers.add(task)
        task.add_done_callback(self.workers.discard)
        return status

    async def _execute(self, handler, command, status):
        final = dict(status)
        try:
            applied = await handler(**command.arguments)
            if not isinstance(applied, dict):
                raise ValueError("Actuator handler must return a JSON object")
            encode(applied)
            final.update(status="completed", applied_state=applied)
        except asyncio.CancelledError:
            final.update(
                status="unknown", detail="Execution interrupted; inspect physical state"
            )
        except Exception as exc:
            final.update(status="failed", detail=str(exc)[:500])
        self.journal.execute(
            "UPDATE commands SET status=? WHERE id=?",
            (encode(final), command.command_id),
        )
        self.journal.commit()
        if self.peer:
            try:
                await self.peer.notify("actuators.status", final)
            except (ConnectionError, ConnectionClosed, TimeoutError):
                pass  # Persisted status can be queried after reconnecting.

    def _registration(self):
        actuators = {}
        for (actuator_id, operation), (_, schema) in self.handlers.items():
            actuators.setdefault(actuator_id, {})[operation] = schema
        return Registration(
            device_id=self.device_id,
            boot_id=self.boot_id,
            actuators=[
                {"actuator_id": key, "operations": operations}
                for key, operations in actuators.items()
            ],
        ).model_dump()

    @asynccontextmanager
    async def connection(self):
        if self.peer:
            raise RuntimeError("Client already connected")
        # An accepted command from an earlier process has an unknown physical outcome.
        if self.journal:
            for command_id, raw in self.journal.execute(
                "SELECT id, status FROM commands"
            ).fetchall():
                status = json.loads(raw)
                if status["status"] == "accepted" and not self.workers:
                    status.update(
                        status="unknown",
                        detail="Client restarted; query hardware before issuing a new command",
                    )
                    self.journal.execute(
                        "UPDATE commands SET status=? WHERE id=?",
                        (encode(status), command_id),
                    )
            self.journal.commit()
        async with connect(
            self.url,
            additional_headers={"Authorization": f"Bearer {self.token}"},
            proxy=None,
            max_size=65536,
            max_queue=16,
            ping_interval=20,
            ping_timeout=20,
            open_timeout=10,
            close_timeout=3,
        ) as ws:
            peer = Peer(ws.send, self._dispatch)
            self.peer = peer

            async def receive():
                try:
                    async for raw in ws:
                        if not isinstance(raw, str):
                            await ws.close(code=1003, reason="Text JSON required")
                            break
                        await peer.receive(raw)
                finally:
                    peer.close()

            reader = asyncio.create_task(receive())

            async def heartbeat():
                while True:
                    await asyncio.sleep(20)
                    await peer.call("device.ping", {})

            pulse = None
            try:
                await peer.call("device.register", self._registration())
                pulse = asyncio.create_task(heartbeat())
                yield self
            finally:
                self.peer = None
                reader.cancel()
                if pulse:
                    pulse.cancel()
                await asyncio.gather(
                    reader, *([pulse] if pulse else []), return_exceptions=True
                )
                peer.close()

    async def publish(self, *, temperature=(), emi=(), custom=(), acknowledge=False):
        if self.peer is None:
            raise ConnectionError("Client is not connected")
        now = self.now_ms()
        self.sequence += 1

        def readings(items):
            return [{"sample_time_ms": now, **item} for item in items]

        payload = Publish(
            device_id=self.device_id,
            boot_id=self.boot_id,
            sequence=self.sequence,
            sent_time_ms=now,
            sensors={
                "temperature": readings(temperature),
                "emi": readings(emi),
                "custom": readings(custom),
            },
        ).model_dump()
        if acknowledge:
            return await self.peer.call("sensors.publish", payload)
        await self.peer.notify("sensors.publish", payload)

    async def run(self, acquire):
        """Reconnect on transport loss; acquire(client) owns its sampling loop.

        Pending sensor publications are not replayed. Actuator command IDs are
        journaled. Protocol/configuration errors propagate to the application.
        """
        delay = 1
        while True:
            try:
                async with self.connection():
                    delay = 1
                    await acquire(self)
                    return
            except (OSError, ConnectionError, ConnectionClosed, TimeoutError):
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)

    async def close(self):
        # Caller must leave connection() first. Active hardware handlers finish.
        if self.peer:
            raise RuntimeError("Exit the connection context before closing the client")
        if self.workers:
            await asyncio.gather(*self.workers, return_exceptions=True)
        if self.journal:
            self.journal.close()
            self.journal = None
