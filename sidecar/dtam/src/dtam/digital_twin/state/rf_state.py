"""RF noise subsystem twin state."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from dtam.digital_twin.state.common import TimestampedQuantity


class RfState(BaseModel):
    """RF noise-floor twin state (distinct from B1 matching tools)."""

    timestamp: datetime
    scanner_id: str
    channels: list[TimestampedQuantity] = Field(default_factory=list)
    noise_floor_dbm_per_hz: TimestampedQuantity | None = None
    snr_estimate_db: TimestampedQuantity | None = None
    noise_bandwidth_hz: float | None = None
    model_version: str = "rf-noise-v1"
    measurement_window_start: datetime | None = None
    measurement_window_end: datetime | None = None
    correlation_id: str | None = None

    model_config = {"frozen": True}
