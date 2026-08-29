"""Thermal state estimator from temperature measurement batches."""

from __future__ import annotations

import math
from datetime import datetime, timezone

from dtam.core.exceptions import StateEstimationError
from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.thermal_state import ThermalState
from dtam.domain.measurements import MeasurementBatch, QuantityKind, ValidityStatus


class ThermalEstimator:
    """Rule-based thermal estimator for Phase 2.

    Distinguishes measured channel values from estimated aggregates
    (mean magnet temperature, gradient, ΔT vs reference).
    """

    def __init__(
        self,
        *,
        magnet_channel_prefix: str = "temp_magnet",
        room_channel_id: str = "temp_room_01",
        reference_magnet_temperature_c: float = 23.0,
        model_version: str = "thermal_estimator-v1",
    ) -> None:
        self.magnet_channel_prefix = magnet_channel_prefix
        self.room_channel_id = room_channel_id
        self.reference_magnet_temperature_c = reference_magnet_temperature_c
        self.model_version = model_version

    def estimate(self, batch: MeasurementBatch) -> ThermalState:
        temps = [
            m
            for m in batch.usable()
            if m.quantity is QuantityKind.TEMPERATURE
            and m.validity is not ValidityStatus.MISSING
        ]
        if not temps:
            raise StateEstimationError(
                "No usable temperature measurements in batch.",
                scanner_id=batch.scanner_id,
                correlation_id=batch.correlation_id,
            )

        now = batch.window_end or datetime.now(timezone.utc)
        channels: list[TimestampedQuantity] = []
        magnet_values: list[float] = []
        magnet_vars: list[float] = []
        room_value: float | None = None
        room_unc: float | None = None

        for m in temps:
            unc = m.uncertainty if m.uncertainty is not None else 0.05
            channels.append(
                TimestampedQuantity(
                    value=m.value,
                    unit=m.unit,
                    source=QuantitySource.MEASURED,
                    timestamp=m.timestamp,
                    confidence=m.acquisition_quality,
                    uncertainty_std=unc,
                    channel_id=m.sensor_id,
                )
            )
            if m.sensor_id.startswith(self.magnet_channel_prefix):
                magnet_values.append(m.value)
                magnet_vars.append(unc**2)
            if m.sensor_id == self.room_channel_id:
                room_value = m.value
                room_unc = unc

        if not magnet_values:
            raise StateEstimationError(
                "No magnet temperature channels found in batch.",
                scanner_id=batch.scanner_id,
                correlation_id=batch.correlation_id,
                context={"prefix": self.magnet_channel_prefix},
            )

        mean_magnet = sum(magnet_values) / len(magnet_values)
        mean_unc = math.sqrt(sum(magnet_vars) / (len(magnet_vars) ** 2))
        gradient = max(magnet_values) - min(magnet_values)
        delta_t = mean_magnet - self.reference_magnet_temperature_c

        mean_q = TimestampedQuantity(
            value=mean_magnet,
            unit="degC",
            source=QuantitySource.ESTIMATED,
            timestamp=now,
            confidence=0.9,
            uncertainty_std=mean_unc,
            model_version=self.model_version,
        )
        gradient_q = TimestampedQuantity(
            value=gradient,
            unit="degC",
            source=QuantitySource.ESTIMATED,
            timestamp=now,
            confidence=0.85,
            uncertainty_std=mean_unc,
            model_version=self.model_version,
        )
        delta_q = TimestampedQuantity(
            value=delta_t,
            unit="degC",
            source=QuantitySource.ESTIMATED,
            timestamp=now,
            confidence=0.9,
            uncertainty_std=mean_unc,
            model_version=self.model_version,
        )
        room_q = None
        if room_value is not None:
            room_q = TimestampedQuantity(
                value=room_value,
                unit="degC",
                source=QuantitySource.MEASURED,
                timestamp=now,
                confidence=0.9,
                uncertainty_std=room_unc,
                channel_id=self.room_channel_id,
            )

        return ThermalState(
            timestamp=now,
            scanner_id=batch.scanner_id,
            channels=channels,
            mean_magnet_temperature_c=mean_q,
            room_temperature_c=room_q,
            thermal_gradient_c=gradient_q,
            reference_magnet_temperature_c=self.reference_magnet_temperature_c,
            delta_magnet_temperature_c=delta_q,
            model_version=self.model_version,
            measurement_window_start=batch.window_start,
            measurement_window_end=batch.window_end,
            correlation_id=batch.correlation_id,
        )
