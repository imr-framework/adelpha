"""Magnetic / B0 subsystem twin state."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from dtam.digital_twin.state.common import TimestampedQuantity


class MagneticState(BaseModel):
    """Magnetic twin state distinguishing nominal, estimated, and predicted field."""

    timestamp: datetime
    scanner_id: str
    nominal_b0_t: float
    b0_t: TimestampedQuantity | None = None
    delta_b0_t: TimestampedQuantity | None = None
    resonant_frequency_mhz: TimestampedQuantity | None = None
    predicted_b0_t: TimestampedQuantity | None = None
    predicted_delta_b0_t: TimestampedQuantity | None = None
    predicted_frequency_mhz: TimestampedQuantity | None = None
    model_version: str = "magnetic-v1"
    correlation_id: str | None = None

    model_config = {"frozen": True}
