"""Optional thermal forecast helpers (PINN or analytic fallback)."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from dtam.digital_twin.models.thermal.pinn.predictor import (
    ThermalPinnPredictor,
    try_load_predictor,
)
from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.thermal_state import ThermalState


class ThermalForecastService:
    """Attach a predicted mean magnet temperature onto a thermal state."""

    def __init__(
        self,
        *,
        model_dir: Path | None = None,
        default_tau_s: float = 60.0,
        predictor: ThermalPinnPredictor | None = None,
        load_artifact: bool = True,
    ) -> None:
        self.default_tau_s = default_tau_s
        if predictor is not None:
            self._predictor: ThermalPinnPredictor | None = predictor
        elif load_artifact:
            self._predictor = try_load_predictor(
                model_dir, default_tau_s=default_tau_s
            )
        else:
            self._predictor = None

    @property
    def pinn_available(self) -> bool:
        return self._predictor is not None and self._predictor.available

    def forecast(
        self,
        thermal: ThermalState,
        *,
        horizon_s: float,
        magnet_heating_rate_c_per_s: float = 0.0,
        magnet_setpoint_c: float | None = None,
        tau_s: float | None = None,
    ) -> ThermalState:
        """Return thermal state with ``predicted_mean_magnet_temperature_c`` set."""
        if thermal.mean_magnet_temperature_c is None:
            return thermal

        t0 = thermal.mean_magnet_temperature_c.value
        future_ts = thermal.timestamp + timedelta(seconds=horizon_s)
        tau = tau_s if tau_s is not None else self.default_tau_s

        if self.pinn_available and self._predictor is not None:
            pred = self._predictor.predict_mean_magnet_c(
                t0_c=t0,
                horizon_s=horizon_s,
                t_star_c=magnet_setpoint_c,
                tau_s=tau,
                magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            )
            quantity = TimestampedQuantity(
                value=pred.temperature_c,
                unit="degC",
                source=QuantitySource.PREDICTED,
                timestamp=future_ts,
                confidence=0.75,
                model_version=pred.model_version,
            )
        else:
            # Constant-rate fallback used when no PINN artifact is present.
            future_mean = t0 + magnet_heating_rate_c_per_s * horizon_s
            quantity = TimestampedQuantity(
                value=future_mean,
                unit="degC",
                source=QuantitySource.PREDICTED,
                timestamp=future_ts,
                confidence=0.55,
                model_version="thermal-linear-rate-v1",
            )
        return thermal.with_predicted_mean(quantity)
