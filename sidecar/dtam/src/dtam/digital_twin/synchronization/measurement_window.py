"""Measurement-window synchronization helpers for Phase 2."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from dtam.core.exceptions import SynchronizationError
from dtam.domain.measurements import Measurement, MeasurementBatch, QuantityKind


@dataclass(frozen=True)
class SynchronizedTemperatureWindow:
    """Temperature measurements aligned to a common twin time window."""

    scanner_id: str
    correlation_id: str
    window_start: datetime
    window_end: datetime
    measurements: list[Measurement]

    @property
    def channel_ids(self) -> list[str]:
        return [m.sensor_id for m in self.measurements]


def synchronize_temperature_batch(
    batch: MeasurementBatch,
    *,
    require_channels: list[str] | None = None,
) -> SynchronizedTemperatureWindow:
    """
    Extract and validate temperature channels from a measurement batch.

    Phase-2 synchronization treats the batch window itself as already aligned
    (adapter timestamps are coherent). It still enforces channel presence and
    usability so estimators receive a clean temperature window.
    """
    temps = [
        m
        for m in batch.usable()
        if m.quantity is QuantityKind.TEMPERATURE
    ]
    if not temps:
        raise SynchronizationError(
            "No usable temperature measurements available for synchronization.",
            scanner_id=batch.scanner_id,
            correlation_id=batch.correlation_id,
        )

    if require_channels:
        present = {m.sensor_id for m in temps}
        missing = [c for c in require_channels if c not in present]
        if missing:
            raise SynchronizationError(
                "Required temperature channels are missing from the batch.",
                scanner_id=batch.scanner_id,
                correlation_id=batch.correlation_id,
                context={"missing_channels": missing},
            )

    # Sort for deterministic estimator input order.
    temps_sorted = sorted(temps, key=lambda m: m.sensor_id)
    return SynchronizedTemperatureWindow(
        scanner_id=batch.scanner_id,
        correlation_id=batch.correlation_id,
        window_start=batch.window_start,
        window_end=batch.window_end,
        measurements=temps_sorted,
    )
