"""Regenerate the portable schema from the executable payload definitions."""

import json
from pathlib import Path

from .protocol import Command, CommandStatus, Publish, Registration


def schema():
    definitions = {}
    messages = []
    for method, model, response_required in [
        ("device.register", Registration, True),
        ("sensors.publish", Publish, False),
        ("actuators.set", Command, True),
        ("actuators.status", CommandStatus, False),
    ]:
        payload = model.model_json_schema()
        definitions.update(payload.pop("$defs", {}))
        definitions[model.__name__] = payload
        messages.append(
            {
                "type": "object",
                "additionalProperties": False,
                "required": ["jsonrpc", "method", "params"]
                + (["id"] if response_required else []),
                "properties": {
                    "jsonrpc": {"const": "2.0"},
                    "method": {"const": method},
                    "id": {"type": ["string", "integer", "null"]},
                    "params": {"$ref": f"#/$defs/{model.__name__}"},
                },
            }
        )
    for method, params in [
        ("device.ping", {"type": "object", "maxProperties": 0}),
        ("device.describe", {"type": "object", "maxProperties": 0}),
        (
            "actuators.get_status",
            {
                "type": "object",
                "required": ["command_id"],
                "additionalProperties": False,
                "properties": {
                    "command_id": {"type": "string", "minLength": 1, "maxLength": 100}
                },
            },
        ),
    ]:
        messages.append(
            {
                "type": "object",
                "required": ["jsonrpc", "method"],
                "additionalProperties": False,
                "properties": {
                    "jsonrpc": {"const": "2.0"},
                    "method": {"const": method},
                    "id": {"type": ["string", "integer", "null"]},
                    "params": params,
                },
            }
        )
    for field in ("result", "error"):
        messages.append(
            {
                "type": "object",
                "required": ["jsonrpc", "id", field],
                "additionalProperties": False,
                "properties": {
                    "jsonrpc": {"const": "2.0"},
                    "id": {"type": ["string", "integer", "null"]},
                    field: {}
                    if field == "result"
                    else {
                        "type": "object",
                        "required": ["code", "message"],
                        "properties": {
                            "code": {"type": "integer"},
                            "message": {"type": "string"},
                            "data": {},
                        },
                    },
                },
            }
        )
    definitions["Message"] = {"oneOf": messages}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Adelpha device protocol v1 — JSON-RPC 2.0",
        "$defs": definitions,
        "oneOf": [
            {"$ref": "#/$defs/Message"},
            {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {"$ref": "#/$defs/Message"},
            },
        ],
    }


if __name__ == "__main__":
    Path(__file__).with_name("adelpha-device-v1.schema.json").write_text(
        json.dumps(schema(), indent=2) + "\n"
    )
