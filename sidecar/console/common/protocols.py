import json
import os
import tempfile
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from common import helper, runtime

_protocols_lock = RLock()


class ProtocolSequence(BaseModel):
    name: str = Field(min_length=1)
    sequence: str = Field(min_length=1)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class Protocol(BaseModel):
    id: str
    name: str = Field(min_length=1, pattern=r".*\S.*")
    sequences: List[ProtocolSequence] = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def migrate_single_sequence(cls, value):
        if not isinstance(value, dict) or "sequences" in value:
            return value
        if "sequence" not in value:
            return value
        migrated = dict(value)
        migrated["sequences"] = [
            {
                "name": value.get("name") or value["sequence"],
                "sequence": value["sequence"],
                "parameters": value.get("parameters") or {},
            }
        ]
        migrated.pop("sequence", None)
        migrated.pop("parameters", None)
        return migrated


def _protocols_path() -> Path:
    return Path(runtime.get_base_path()) / "data" / "state" / "protocols.json"


def _write_protocols(protocols: List[Protocol]) -> None:
    path = _protocols_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            json.dump(
                [protocol.model_dump() for protocol in protocols],
                temporary_file,
                indent=4,
            )
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def list_protocols() -> List[Protocol]:
    path = _protocols_path()
    if not path.exists():
        return []

    with open(path, "r") as protocol_file:
        data = json.load(protocol_file)
    return [Protocol.model_validate(item) for item in data]


def load_protocol(protocol_id: str) -> Optional[Protocol]:
    for protocol in list_protocols():
        if protocol.id == protocol_id:
            return protocol
    return None


def save_protocol(protocol: Protocol) -> None:
    with _protocols_lock:
        protocols = list_protocols()
        if any(saved.id == protocol.id for saved in protocols):
            raise ValueError(f"Protocol with ID {protocol.id} already exists")

        protocols.append(protocol)
        _write_protocols(protocols)


def rename_protocol(protocol_id: str, new_name: str) -> Protocol:
    with _protocols_lock:
        protocols = list_protocols()
        for index, protocol in enumerate(protocols):
            if protocol.id == protocol_id:
                renamed = Protocol.model_validate(
                    {**protocol.model_dump(), "name": new_name}
                )
                protocols[index] = renamed
                _write_protocols(protocols)
                return renamed

    raise ValueError(f"Protocol with ID {protocol_id} does not exist")


def duplicate_protocol(protocol_id: str, new_name: str) -> Protocol:
    with _protocols_lock:
        original = load_protocol(protocol_id)
        if original is None:
            raise ValueError(f"Protocol with ID {protocol_id} does not exist")

        duplicate = Protocol(
            id=helper.generate_uid(),
            name=new_name,
            sequences=deepcopy(original.sequences),
        )
        save_protocol(duplicate)
        return duplicate


def delete_protocol(protocol_id: str) -> None:
    with _protocols_lock:
        protocols = list_protocols()
        remaining = [protocol for protocol in protocols if protocol.id != protocol_id]
        if len(remaining) == len(protocols):
            raise ValueError(f"Protocol with ID {protocol_id} does not exist")

        _write_protocols(remaining)
