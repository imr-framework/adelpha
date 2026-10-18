"""EMI subsystem twin state."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from dtam.digital_twin.state.common import TimestampedQuantity


class EmiState(BaseModel):
    """EMI twin state with measured channels and estimated aggregates."""

    timestamp: datetime
    scanner_id: str
    channels: list[TimestampedQuantity] = Field(default_factory=list)
    rms_v: TimestampedQuantity | None = None
    peak_frequency_hz: TimestampedQuantity | None = None
    classification_label: str | None = None
    model_version: str = "emi-v1"
    measurement_window_start: datetime | None = None
    measurement_window_end: datetime | None = None
    correlation_id: str | None = None

    model_config = {"frozen": True}
