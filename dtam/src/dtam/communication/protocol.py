"""Adelpha device protocol v1 payloads and JSON-RPC 2.0 validation."""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_MESSAGE_BYTES = 65536
MAX_BATCH = 32
Identifier = Annotated[
    str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
]
Counter = Annotated[int, Field(strict=True, ge=0, le=9007199254740991)]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Reading(Payload):
    sensor_id: Annotated[int, Field(strict=True, ge=0, le=2147483647)]
    sample_time_ms: Counter
    value: float | None
    unit: Annotated[str, Field(min_length=1, max_length=32)]
    quality: Literal["valid", "suspect", "invalid", "missing"] = "valid"
    quantity: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    role: Literal["magnet", "room", "other"] = "other"
    dashboard_id: Annotated[int, Field(strict=True, ge=0, le=2147483647)] | None = None
    calibration_version: Annotated[str, Field(max_length=100)] | None = None

    @model_validator(mode="after")
    def valid_value(self):
        if self.value is None and self.quality not in {"missing", "invalid"}:
            raise ValueError("null readings must be missing or invalid")
        return self


class SensorGroups(Payload):
    temperature: list[Reading] = Field(default_factory=list, max_length=128)
    emi: list[Reading] = Field(default_factory=list, max_length=128)
    custom: list[Reading] = Field(default_factory=list, max_length=128)


class Publish(Payload):
    protocol_version: Literal["1.0"] = "1.0"
    device_id: Identifier
    boot_id: Identifier
    sequence: Counter
    sent_time_ms: Counter
    sensors: SensorGroups

    @model_validator(mode="after")
    def channels(self):
        seen = set()
        for category in ("temperature", "emi", "custom"):
            for item in getattr(self.sensors, category):
                if item.sensor_id in seen:
                    raise ValueError(
                        "sensor_id must be unique within a device publication"
                    )
                seen.add(item.sensor_id)
                if item.sample_time_ms > self.sent_time_ms:
                    raise ValueError("sample time cannot exceed send time")
                if category == "temperature" and item.unit != "degC":
                    raise ValueError("temperature requires degC")
                if category == "emi" and not item.quantity:
                    raise ValueError("EMI readings require quantity")
                if (
                    category == "emi"
                    and item.quantity == "voltage_rms"
                    and item.unit != "V"
                ):
                    raise ValueError("voltage_rms requires unit V")
                if (
                    category == "emi"
                    and item.quantity == "voltage_rms"
                    and item.value is not None
                    and item.value < 0
                ):
                    raise ValueError("RMS cannot be negative")
                if category == "custom" and not item.quantity:
                    raise ValueError("custom readings require quantity")
        if len(seen) > 256:
            raise ValueError("at most 256 readings per publication")
        return self


class Actuator(Payload):
    actuator_id: Identifier
    operations: dict[Identifier, dict[str, Any]] = Field(max_length=16)


class Registration(Payload):
    protocol_version: Literal["1.0"] = "1.0"
    device_id: Identifier
    boot_id: Identifier
    actuators: list[Actuator] = Field(default_factory=list, max_length=32)


class Command(Payload):
    protocol_version: Literal["1.0"] = "1.0"
    device_id: Identifier
    command_id: Identifier
    actuator_id: Identifier
    operation: Identifier
    arguments: dict[str, Any] = Field(default_factory=dict)


class CommandStatus(Payload):
    device_id: Identifier
    command_id: Identifier
    actuator_id: Identifier
    status: Literal["accepted", "completed", "failed", "unknown"]
    applied_state: dict[str, Any] | None = None
    detail: Annotated[str, Field(max_length=500)] | None = None


class RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data

    def response(self, request_id):
        error = {"code": self.code, "message": self.message}
        if self.data is not None:
            error["data"] = self.data
        return {"jsonrpc": "2.0", "id": request_id, "error": error}


def decode(raw: str):
    if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise RpcError(-32600, "Message exceeds 64 KiB")
    try:
        return json.loads(
            raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError())
        )
    except (ValueError, RecursionError):
        raise RpcError(-32700, "Parse error") from None


def encode(value):
    raw = json.dumps(value, separators=(",", ":"), allow_nan=False)
    if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise RpcError(-32600, "Message exceeds 64 KiB")
    return raw
