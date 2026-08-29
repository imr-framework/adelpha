"""B0 / magnetic state estimator driven by thermal estimates."""

from __future__ import annotations

import math
from datetime import timedelta

from dtam.core.exceptions import StateEstimationError
from dtam.digital_twin.models.magnetic_field import ResonantFrequencyModel
from dtam.digital_twin.models.thermal import ThermalToB0Model, ThermalToB0Params
from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.magnetic_state import MagneticState
from dtam.digital_twin.state.thermal_state import ThermalState


class B0Estimator:
    """Estimate and optionally predict B0 / f0 from thermal state."""

    def __init__(
        self,
        *,
        nominal_b0_t: float,
        thermal_to_b0: ThermalToB0Model | None = None,
        resonant_frequency: ResonantFrequencyModel | None = None,
        model_version: str = "b0_estimator-v1",
    ) -> None:
        if nominal_b0_t <= 0:
            raise ValueError("nominal_b0_t must be positive")
        self.nominal_b0_t = nominal_b0_t
        self.thermal_to_b0 = thermal_to_b0 or ThermalToB0Model()
        self.resonant_frequency = resonant_frequency or ResonantFrequencyModel()
        self.model_version = model_version

    def estimate(self, thermal: ThermalState) -> MagneticState:
        if thermal.delta_magnet_temperature_c is None:
            raise StateEstimationError(
                "Thermal state is missing delta_magnet_temperature_c.",
                scanner_id=thermal.scanner_id,
                correlation_id=thermal.correlation_id,
            )
        if thermal.mean_magnet_temperature_c is None:
            raise StateEstimationError(
                "Thermal state is missing mean_magnet_temperature_c.",
                scanner_id=thermal.scanner_id,
                correlation_id=thermal.correlation_id,
            )

        delta_t = thermal.delta_magnet_temperature_c.value
        mean_t = thermal.mean_magnet_temperature_c.value
        temp_unc = thermal.delta_magnet_temperature_c.uncertainty_std or 0.05
        now = thermal.timestamp

        delta_b0 = self.thermal_to_b0.delta_b0_tesla(delta_t)
        b0 = self.nominal_b0_t + delta_b0
        f0_mhz = self.resonant_frequency.frequency_mhz(b0)

        # Propagate temperature uncertainty through α_T.
        alpha = self.thermal_to_b0.params.alpha_t_tesla_per_c
        process = self.thermal_to_b0.params.process_noise_std_t
        b0_unc = math.sqrt((abs(alpha) * temp_unc) ** 2 + process**2)
        f0_unc_mhz = abs(self.resonant_frequency.gamma_over_two_pi) * b0_unc / 1e6

        in_range = self.thermal_to_b0.in_validity_range(mean_t)
        confidence = 0.9 if in_range else 0.55

        return MagneticState(
            timestamp=now,
            scanner_id=thermal.scanner_id,
            nominal_b0_t=self.nominal_b0_t,
            b0_t=TimestampedQuantity(
                value=b0,
                unit="T",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=confidence,
                uncertainty_std=b0_unc,
                model_version=self.model_version,
            ),
            delta_b0_t=TimestampedQuantity(
                value=delta_b0,
                unit="T",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=confidence,
                uncertainty_std=b0_unc,
                model_version=self.thermal_to_b0.version,
            ),
            resonant_frequency_mhz=TimestampedQuantity(
                value=f0_mhz,
                unit="MHz",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=confidence,
                uncertainty_std=f0_unc_mhz,
                model_version=self.resonant_frequency.model_version,
            ),
            model_version=self.model_version,
            correlation_id=thermal.correlation_id,
        )

    def predict(
        self,
        thermal: ThermalState,
        *,
        horizon_s: float,
        magnet_heating_rate_c_per_s: float = 0.0,
        future_mean_magnet_temperature_c: float | None = None,
    ) -> MagneticState:
        """Predict future B0 from a future magnet temperature.

        If ``future_mean_magnet_temperature_c`` is omitted, falls back to a
        constant heating-rate extrapolation:
        ``T(t+h) = T(t) + r * h``.
        """
        if thermal.mean_magnet_temperature_c is None:
            raise StateEstimationError(
                "Cannot predict B0 without mean magnet temperature.",
                scanner_id=thermal.scanner_id,
            )
        if future_mean_magnet_temperature_c is None:
            future_mean = (
                thermal.mean_magnet_temperature_c.value
                + magnet_heating_rate_c_per_s * horizon_s
            )
        else:
            future_mean = future_mean_magnet_temperature_c
        ref = (
            thermal.reference_magnet_temperature_c
            if thermal.reference_magnet_temperature_c is not None
            else self.thermal_to_b0.params.reference_temperature_c
        )
        future_delta_t = future_mean - ref
        future_delta_b0 = self.thermal_to_b0.delta_b0_tesla(future_delta_t)
        future_b0 = self.nominal_b0_t + future_delta_b0
        future_f0_mhz = self.resonant_frequency.frequency_mhz(future_b0)
        now = thermal.timestamp
        future_ts = now + timedelta(seconds=horizon_s)

        base = self.estimate(thermal)
        return MagneticState(
            timestamp=future_ts,
            scanner_id=thermal.scanner_id,
            nominal_b0_t=self.nominal_b0_t,
            b0_t=base.b0_t,
            delta_b0_t=base.delta_b0_t,
            resonant_frequency_mhz=base.resonant_frequency_mhz,
            predicted_b0_t=TimestampedQuantity(
                value=future_b0,
                unit="T",
                source=QuantitySource.PREDICTED,
                timestamp=future_ts,
                confidence=0.7,
                uncertainty_std=(base.b0_t.uncertainty_std or 0.0) * 1.5
                if base.b0_t
                else None,
                model_version=self.model_version,
            ),
            predicted_delta_b0_t=TimestampedQuantity(
                value=future_delta_b0,
                unit="T",
                source=QuantitySource.PREDICTED,
                timestamp=future_ts,
                confidence=0.7,
                model_version=self.thermal_to_b0.version,
            ),
            predicted_frequency_mhz=TimestampedQuantity(
                value=future_f0_mhz,
                unit="MHz",
                source=QuantitySource.PREDICTED,
                timestamp=future_ts,
                confidence=0.7,
                model_version=self.resonant_frequency.model_version,
            ),
            model_version=self.model_version,
            correlation_id=thermal.correlation_id,
        )


def default_b0_estimator(
    nominal_b0_t: float,
    params: ThermalToB0Params | None = None,
) -> B0Estimator:
    return B0Estimator(
        nominal_b0_t=nominal_b0_t,
        thermal_to_b0=ThermalToB0Model(params),
    )
