"""In-memory working-state store for agents and tools."""

from __future__ import annotations

from threading import RLock
from typing import Any


class WorkingStateStore:
    """Process-local key/value store used by memory tools.

    This is not the authoritative scanner twin. LLM/session memory must not
    become the source of truth for physical scanner state.
    """

    def __init__(self) -> None:
        self._lock = RLock()
        self._data: dict[str, Any] = {}

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value

    def delete(self, key: str) -> bool:
        with self._lock:
            return self._data.pop(key, None) is not None

    def keys(self, prefix: str | None = None) -> list[str]:
        with self._lock:
            keys = list(self._data.keys())
        if prefix:
            keys = [k for k in keys if k.startswith(prefix)]
        return sorted(keys)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._data)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


# Module singleton used by orchestrator / subsystem memory tools.
WORKING_STATE = WorkingStateStore()
