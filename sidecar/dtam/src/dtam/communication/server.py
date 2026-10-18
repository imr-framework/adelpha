"""Authenticated device-only WebSocket listener and Twin measurement bridge."""

from __future__ import annotations

import asyncio
import hmac
import json
import os
import socket
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from jsonschema import Draft202012Validator
from pydantic import Field

from dtam.domain.measurements import (
    Measurement,
    MeasurementBatch,
    Provenance,
    QuantityKind,
)

from .protocol import (
    Command,
    CommandStatus,
    Identifier,
    Payload,
    Publish,
    Registration,
    RpcError,
)
from .rpc import Peer


class DevicePermission(Payload):
    token: str = Field(min_length=24, repr=False)
    scanner_id: Identifier
    allowed_actuators: dict[str, list[str]] = Field(default_factory=dict)


class ListenerConfig(Payload):
    host: str = "127.0.0.1"
    port: int = Field(default=8765, ge=0, le=65535)
    devices: dict[Identifier, DevicePermission] = Field(
        default_factory=dict, max_length=32
    )
    allow_control: bool = False
    certfile: str | None = None
    keyfile: str | None = None

    @classmethod
    def from_environment(cls):
        candidates = []
        explicit = os.environ.get("ADELPHA_DEVICE_CONFIG")
        if explicit:
            candidates.append(Path(explicit))
        for root in (
            os.environ.get("ADELPHA_CONFIG_DIR"),
            os.environ.get("DTAM_CONFIG_DIR"),
        ):
            if root:
                base = Path(root)
                candidates.append(base / "devices.json")
                candidates.append(base / "dtam" / "devices.json")
        for path in candidates:
            if path.is_file():
                return cls.model_validate_json(path.read_text())
        return None


class DeviceHub:
    def __init__(self, session, config: ListenerConfig):
        self.session, self.config = session, config
        self.peers = {}
        self.registrations = {}
        self.readings = {}
        self.sequences = {}
        self.commands = {}
        self.control_scanner = None
        self.lock = RLock()

    def connected(self, scanner_id):
        with self.lock:
            return any(
                self.config.devices[d].scanner_id == scanner_id
                for d in self.registrations
            )

    def batch(self, scanner_id):
        now = datetime.now(timezone.utc)
        measurements = []
        with self.lock:
            snapshots = [
                (d, self.readings[d])
                for d in self.registrations
                if d in self.readings
                and self.config.devices[d].scanner_id == scanner_id
            ]
        for device_id, (payload, received) in snapshots:
            for category in ("temperature", "emi", "custom"):
                for item in getattr(payload.sensors, category):
                    timestamp = received - timedelta(
                        milliseconds=payload.sent_time_ms - item.sample_time_ms
                    )
                    if (now - timestamp).total_seconds() >= 30 or item.value is None:
                        continue
                    if item.quality not in {"valid", "suspect"}:
                        continue
                    prefix = category
                    if category == "temperature" and item.role == "magnet":
                        prefix = "temp_magnet"
                    elif category == "temperature" and item.role == "room":
                        prefix = "temp_room"
                    quantity = QuantityKind.OTHER
                    if category == "temperature":
                        quantity = QuantityKind.TEMPERATURE
                    elif category == "emi" and item.quantity == "voltage_rms":
                        quantity = QuantityKind.EMI_FIELD_RMS
                    elif item.quantity in {"rf_noise_floor", "noise_floor"}:
                        quantity = QuantityKind.RF_NOISE_FLOOR
                    measurements.append(
                        Measurement(
                            sensor_id=f"{prefix}:{device_id}:{item.sensor_id}",
                            scanner_id=scanner_id,
                            timestamp=timestamp,
                            value=item.value,
                            unit=item.unit,
                            validity=item.quality,
                            quantity=quantity,
                            calibration_version=item.calibration_version,
                            provenance=Provenance(
                                source=device_id,
                                method="websocket-jsonrpc",
                                version="1.0",
                                notes="Timestamp estimated from reception minus device-reported sample age; clocks are not synchronized.",
                            ),
                            metadata={
                                "device_id": device_id,
                                "sensor_id": item.sensor_id,
                                "role": item.role,
                                "dashboard_id": item.dashboard_id,
                                "quantity": item.quantity,
                                "boot_id": payload.boot_id,
                                "sequence": payload.sequence,
                                "sample_time_ms": item.sample_time_ms,
                                "received_at": received.isoformat(),
                            },
                        )
                    )
        return MeasurementBatch(
            scanner_id=scanner_id,
            measurements=measurements,
            window_start=min((m.timestamp for m in measurements), default=now),
            window_end=now,
        )

    def coverage(self, scanner_id: str) -> dict[str, str]:
        """Per-family status for dashboard notes: received, missing, invalid, stale, or not_connected."""
        now = datetime.now(timezone.utc)
        status = {
            "magnet_temperature": "not_connected",
            "room_temperature": "not_connected",
            "emi_rms": "not_connected",
            "rf_noise": "not_connected",
            "custom": "not_connected",
        }
        rank = {
            "not_connected": 0,
            "stale": 1,
            "invalid": 2,
            "missing": 3,
            "received": 4,
        }

        def bump(key: str, value: str) -> None:
            if rank[value] > rank[status[key]]:
                status[key] = value

        with self.lock:
            for device_id, permission in self.config.devices.items():
                if (
                    permission.scanner_id != scanner_id
                    or device_id not in self.registrations
                ):
                    continue
                entry = self.readings.get(device_id)
                if entry is None:
                    continue
                payload, received = entry
                for category in ("temperature", "emi", "custom"):
                    for item in getattr(payload.sensors, category):
                        age = (
                            now
                            - (
                                received
                                - timedelta(
                                    milliseconds=payload.sent_time_ms
                                    - item.sample_time_ms
                                )
                            )
                        ).total_seconds()
                        if (
                            item.quality in {"valid", "suspect"}
                            and item.value is not None
                            and age < 30
                        ):
                            quality = "received"
                        elif age >= 30:
                            quality = "stale"
                        elif item.quality == "missing" or item.value is None:
                            quality = "missing"
                        else:
                            quality = "invalid"
                        if category == "temperature" and item.role == "magnet":
                            bump("magnet_temperature", quality)
                        elif category == "temperature" and item.role == "room":
                            bump("room_temperature", quality)
                        elif category == "emi" and item.quantity == "voltage_rms":
                            bump("emi_rms", quality)
                        elif item.quantity in {"rf_noise_floor", "noise_floor"}:
                            bump("rf_noise", quality)
                        else:
                            bump("custom", quality)
        return status

    def reset(self):
        # Session changes require fresh data and explicit control re-enablement.
        with self.lock:
            self.readings.clear()
            self.control_scanner = None

    def describe(self):
        with self.lock:
            return [
                {
                    "device_id": d,
                    "scanner_id": permission.scanner_id,
                    "connected": d in self.registrations,
                    "last_received": self.readings[d][1].isoformat()
                    if d in self.readings
                    else None,
                    "capabilities": self.registrations[d].model_dump()
                    if d in self.registrations
                    else None,
                }
                for d, permission in self.config.devices.items()
            ]

    async def dispatch(self, device_id, method, params, has_id):
        if method == "device.register":
            registration = Registration.model_validate(params)
            if registration.device_id != device_id:
                raise RpcError(-32001, "Device identity mismatch")
            if device_id in self.registrations:
                raise RpcError(-32003, "Already registered")
            ids = set()
            for actuator in registration.actuators:
                if actuator.actuator_id in ids:
                    raise ValueError("Duplicate actuator id")
                ids.add(actuator.actuator_id)
                for schema in actuator.operations.values():
                    # Never resolve remote schema references supplied by devices.
                    if "$ref" in json.dumps(schema) or "$dynamicRef" in json.dumps(
                        schema
                    ):
                        raise ValueError("Argument schemas must be self-contained")
                    Draft202012Validator.check_schema(schema)
            with self.lock:
                self.registrations[device_id] = registration
            return {
                "protocol_version": "1.0",
                "scanner_id": self.config.devices[device_id].scanner_id,
            }
        if device_id not in self.registrations:
            raise RpcError(-32003, "Register device first")
        if method == "sensors.publish":
            publication = Publish.model_validate(params)
            if (
                publication.device_id != device_id
                or publication.boot_id != self.registrations[device_id].boot_id
            ):
                raise RpcError(-32001, "Device or boot identity mismatch")
            previous = self.sequences.get(device_id)
            if (
                previous
                and previous[0] == publication.boot_id
                and publication.sequence <= previous[1]
            ):
                return {
                    "accepted": False,
                    "reason": "duplicate_or_out_of_order",
                    "sequence": publication.sequence,
                }
            if (
                self.config.devices[device_id].scanner_id != self.session.scanner_id
                or self.session.mode.value == "simulation"
            ):
                raise RpcError(
                    -32004, "Select the assigned hardware scanner in Adelpha"
                )
            with self.lock:
                self.readings[device_id] = (publication, datetime.now(timezone.utc))
                self.sequences[device_id] = (publication.boot_id, publication.sequence)
            return {"accepted": True, "sequence": publication.sequence}
        if method == "actuators.status":
            status = CommandStatus.model_validate(params)
            key = (device_id, status.command_id)
            entry = self.commands.get(key)
            if (
                status.device_id != device_id
                or not entry
                or entry["command"]["actuator_id"] != status.actuator_id
            ):
                raise RpcError(-32001, "Unknown command")
            if entry["status"]["status"] not in {"completed", "failed"}:
                entry["status"] = status.model_dump()
            return {"accepted": True}
        if method == "device.ping":
            return {"ok": True}
        raise RpcError(-32601, "Method not found")

    async def command(self, command: Command):
        permission = self.config.devices.get(command.device_id)
        if (
            not self.config.allow_control
            or self.control_scanner != self.session.scanner_id
            or not self.session.mode.allows_physical_mutation()
        ):
            raise RpcError(-32010, "Physical control is not enabled")
        if not permission or permission.scanner_id != self.session.scanner_id:
            raise RpcError(-32010, "Device belongs to a different scanner")
        if command.operation not in permission.allowed_actuators.get(
            command.actuator_id, []
        ):
            raise RpcError(-32010, "Operation is not permitted by the PC configuration")
        registration = self.registrations.get(command.device_id)
        if registration is None:
            raise RpcError(-32003, "Device is disconnected")
        actuator = next(
            (a for a in registration.actuators if a.actuator_id == command.actuator_id),
            None,
        )
        if not actuator or command.operation not in actuator.operations:
            raise RpcError(-32601, "Device does not advertise this operation")
        errors = list(
            Draft202012Validator(actuator.operations[command.operation]).iter_errors(
                command.arguments
            )
        )
        if errors:
            raise RpcError(-32602, "Arguments do not match device capabilities")
        key = (command.device_id, command.command_id)
        body = command.model_dump()
        if key in self.commands:
            if self.commands[key]["command"] != body:
                raise RpcError(-32602, "command_id already has different arguments")
            return self.commands[key]["status"]
        if len(self.commands) >= 1024:
            raise RpcError(
                -32002, "Command history full; restart after reviewing outcomes"
            )
        entry = {
            "command": body,
            "status": {"command_id": command.command_id, "status": "unknown"},
        }
        self.commands[key] = entry
        try:
            result = await self.peers[command.device_id].call("actuators.set", body)
            status = CommandStatus.model_validate(result)
            if (status.device_id, status.command_id, status.actuator_id) != (
                command.device_id,
                command.command_id,
                command.actuator_id,
            ):
                raise RpcError(-32600, "Command response identity mismatch")
            if entry["status"]["status"] not in {"completed", "failed"}:
                entry["status"] = status.model_dump()
        except (TimeoutError, ConnectionError):
            pass  # Unknown is deliberately not failed; don't blindly replay.
        except RpcError as exc:
            if entry["status"]["status"] == "unknown":
                entry["status"] = {
                    "command_id": command.command_id,
                    "status": "failed",
                    "detail": exc.message,
                }
        return entry["status"]

    async def query_command(self, device_id, command_id):
        peer = self.peers.get(device_id)
        if peer is None:
            return self.commands.get((device_id, command_id), {}).get(
                "status", {"status": "unknown"}
            )
        result = await peer.call("actuators.get_status", {"command_id": command_id})
        entry = self.commands.get((device_id, command_id))
        if entry:
            status = CommandStatus.model_validate(result)
            if (
                status.device_id != device_id
                or status.command_id != command_id
                or status.actuator_id != entry["command"]["actuator_id"]
            ):
                raise RpcError(-32600, "Command status identity mismatch")
            entry["status"] = status.model_dump()
        return result


def create_device_app(hub: DeviceHub):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.websocket("/ws/{device_id}")
    async def device_socket(ws: WebSocket, device_id: str):
        permission = hub.config.devices.get(device_id)
        header = ws.headers.get("authorization", "")
        if permission is None or not hmac.compare_digest(
            header, f"Bearer {permission.token}"
        ):
            await ws.close(code=4401)
            return
        if ws.headers.get("origin") or device_id in hub.peers:
            await ws.close(code=4409)
            return
        await ws.accept()
        peer = Peer(ws.send_text, lambda m, p, i: hub.dispatch(device_id, m, p, i))
        hub.peers[device_id] = peer
        start, count = time.monotonic(), 0
        try:
            while True:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=60)
                now = time.monotonic()
                if now - start >= 1:
                    start, count = now, 0
                count += 1
                if count > 100:
                    await ws.close(code=4429)
                    break
                await peer.receive(raw)
        except (WebSocketDisconnect, TimeoutError, RuntimeError, KeyError):
            pass
        finally:
            peer.close()
            hub.peers.pop(device_id, None)
            with hub.lock:
                hub.registrations.pop(device_id, None)
                hub.readings.pop(device_id, None)
            try:
                await ws.close()
            except RuntimeError:
                pass

    return app


@asynccontextmanager
async def device_listener(hub):
    """Start a dedicated LAN port without exposing desktop gateway routes."""
    import uvicorn

    class EmbeddedServer(uvicorn.Server):
        @contextmanager
        def capture_signals(self):
            yield

    config = hub.config
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((config.host, config.port))
    sock.listen(32)
    server = EmbeddedServer(
        uvicorn.Config(
            create_device_app(hub),
            log_config=None,
            access_log=False,
            lifespan="off",
            ws_max_size=65536,
            ws_max_queue=16,
            timeout_graceful_shutdown=3,
            ssl_certfile=config.certfile,
            ssl_keyfile=config.keyfile,
        )
    )
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        while not server.started:
            if task.done():
                await task
                raise RuntimeError("Device listener did not start")
            await asyncio.sleep(0.01)
        yield sock.getsockname()[1]
    finally:
        server.should_exit = True
        await task
        sock.close()
