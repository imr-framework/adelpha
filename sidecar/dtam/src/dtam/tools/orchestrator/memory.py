"""Working-state memory tools for the orchestrator."""

from __future__ import annotations

import json
from typing import Any

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import ok_result


def get_working_state(key: str) -> dict[str, Any]:
    """Read a value from DTAM working-state memory."""
    value = WORKING_STATE.get(key)
    return ok_result(
        "get_working_state",
        key=key,
        found=value is not None,
        value=value,
    )


def set_working_state(key: str, value: str) -> dict[str, Any]:
    """Store a JSON-serializable string value in working-state memory.

    Pass JSON-encoded objects as strings when needed. Prefer typed twin state
    repositories for authoritative scanner measurements.
    """
    try:
        parsed: Any = json.loads(value)
    except json.JSONDecodeError:
        parsed = value
    WORKING_STATE.set(key, parsed)
    return ok_result("set_working_state", key=key, value=parsed)


def list_working_state_keys(prefix: str = "") -> dict[str, Any]:
    """List working-state keys, optionally filtered by prefix."""
    keys = WORKING_STATE.keys(prefix or None)
    return ok_result("list_working_state_keys", prefix=prefix, keys=keys)
