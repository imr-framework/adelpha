"""Thermal subsystem twin state."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from dtam.digital_twin.state.common import TimestampedQuantity


class ThermalState(BaseModel):
    """Thermal twin state with measured channels and estimated aggregates."""

    timestamp: datetime
    scanner_id: str
    channels: list[TimestampedQuantity] = Field(default_factory=list)
    mean_magnet_temperature_c: TimestampedQuantity | None = None
    room_temperature_c: TimestampedQuantity | None = None
    thermal_gradient_c: TimestampedQuantity | None = None
    reference_magnet_temperature_c: float | None = None
    delta_magnet_temperature_c: TimestampedQuantity | None = None
    predicted_mean_magnet_temperature_c: TimestampedQuantity | None = None
    model_version: str = "thermal-v1"
    measurement_window_start: datetime | None = None
    measurement_window_end: datetime | None = None
    correlation_id: str | None = None

    model_config = {"frozen": True}

    def with_predicted_mean(
        self,
        quantity: TimestampedQuantity,
    ) -> ThermalState:
        """Return a copy carrying a predicted mean magnet temperature."""
        return self.model_copy(
            update={"predicted_mean_magnet_temperature_c": quantity}
        )
