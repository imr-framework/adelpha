"""Lightweight provenance recording for deterministic runs."""

from __future__ import annotations

from typing import Any

from .models import ProvenanceEvent, utc_now


class ProvenanceRecorder:
    """Collects structured provenance events without secrets or raw arrays."""

    def __init__(self) -> None:
        self._events: list[ProvenanceEvent] = []

    def record(self, component: str, event_type: str, **detail: Any) -> None:
        safe = {
            k: v for k, v in detail.items() if k not in {"api_key", "token", "secret"}
        }
        self._events.append(
            ProvenanceEvent(
                timestamp=utc_now(),
                component=component,
                event_type=event_type,
                detail=safe,
            )
        )

    @property
    def events(self) -> list[ProvenanceEvent]:
        return list(self._events)
