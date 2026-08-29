"""Phase-2b thermal + EMI + RF + B0 digital-twin update service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from dtam.digital_twin.estimators.b0_estimator import B0Estimator
from dtam.digital_twin.estimators.emi_estimator import EmiEstimator
from dtam.digital_twin.estimators.rf_estimator import RfNoiseEstimator
from dtam.digital_twin.estimators.thermal_estimator import ThermalEstimator
from dtam.digital_twin.estimators.thermal_forecast import ThermalForecastService
from dtam.digital_twin.models.thermal import ThermalToB0Model, ThermalToB0Params
from dtam.digital_twin.state.system_state import SystemState
from dtam.digital_twin.synchronization import synchronize_temperature_batch
from dtam.domain.measurements import MeasurementBatch, QuantityKind
from dtam.domain.modes import OperationalMode


@dataclass
class TwinConfig:
    """Runtime configuration for the thermal–EMI–RF–B0 twin slice."""

    nominal_b0_t: float = 0.048
    reference_magnet_temperature_c: float = 23.0
    thermal_to_b0: ThermalToB0Params = field(default_factory=ThermalToB0Params)
    require_channels: list[str] | None = None
    mode: OperationalMode = OperationalMode.SIMULATION
    pinn_model_dir: Path | None = None
    default_tau_s: float = 60.0
    use_thermal_pinn: bool = True


class ThermalMagneticTwin:
    """Twin update: sync temps → thermal/B0 (+PINN) → EMI → RF noise."""

    def __init__(self, config: TwinConfig) -> None:
        self.config = config
        params = config.thermal_to_b0.model_copy(
            update={
                "reference_temperature_c": config.reference_magnet_temperature_c,
            }
        )
        self.thermal_estimator = ThermalEstimator(
            reference_magnet_temperature_c=config.reference_magnet_temperature_c,
        )
        self.b0_estimator = B0Estimator(
            nominal_b0_t=config.nominal_b0_t,
            thermal_to_b0=ThermalToB0Model(params),
        )
        self.thermal_forecast = ThermalForecastService(
            model_dir=config.pinn_model_dir,
            default_tau_s=config.default_tau_s,
            load_artifact=config.use_thermal_pinn,
        )
        self.emi_estimator = EmiEstimator()
        self.rf_estimator = RfNoiseEstimator()
        self._latest: SystemState | None = None

    @property
    def latest(self) -> SystemState | None:
        return self._latest

    def update(
        self,
        batch: MeasurementBatch,
        *,
        predict_horizon_s: float | None = None,
        magnet_heating_rate_c_per_s: float = 0.0,
        magnet_setpoint_c: float | None = None,
    ) -> SystemState:
        window = synchronize_temperature_batch(
            batch,
            require_channels=self.config.require_channels,
        )
        synced_temps = MeasurementBatch(
            measurements=window.measurements,
            window_start=window.window_start,
            window_end=window.window_end,
            correlation_id=window.correlation_id,
            scanner_id=window.scanner_id,
        )
        thermal = self.thermal_estimator.estimate(synced_temps)
        notes: list[str] = []
        if predict_horizon_s is not None and predict_horizon_s > 0:
            thermal = self.thermal_forecast.forecast(
                thermal,
                horizon_s=predict_horizon_s,
                magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
                magnet_setpoint_c=magnet_setpoint_c,
                tau_s=self.config.default_tau_s,
            )
            future_mean = (
                thermal.predicted_mean_magnet_temperature_c.value
                if thermal.predicted_mean_magnet_temperature_c is not None
                else None
            )
            magnetic = self.b0_estimator.predict(
                thermal,
                horizon_s=predict_horizon_s,
                magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
                future_mean_magnet_temperature_c=future_mean,
            )
            backend = (
                "pinn"
                if self.thermal_forecast.pinn_available
                else "linear_rate"
            )
            notes.extend(
                [
                    f"Predicted B0 horizon_s={predict_horizon_s}",
                    f"thermal_forecast={backend}",
                    f"heating_rate_c_per_s={magnet_heating_rate_c_per_s}",
                ]
            )
        else:
            magnetic = self.b0_estimator.estimate(thermal)
            notes.append("Estimated B0 from thermal state (no prediction horizon).")

        emi = self.emi_estimator.estimate(batch)
        rf = self.rf_estimator.estimate(batch)
        if emi is not None:
            notes.append(
                f"EMI label={emi.classification_label} "
                f"rms={emi.rms_v.value if emi.rms_v else None}"
            )
        else:
            notes.append("No EMI channels in batch.")
        if rf is not None:
            rf_val = (
                rf.noise_floor_dbm_per_hz.value
                if rf.noise_floor_dbm_per_hz
                else None
            )
            notes.append(f"RF noise_floor_dbm_per_hz={rf_val}")
        else:
            notes.append("No RF noise channels in batch.")

        n_emi = sum(
            1 for m in batch.measurements if m.quantity is QuantityKind.EMI_FIELD_RMS
        )
        n_rf = sum(
            1 for m in batch.measurements if m.quantity is QuantityKind.RF_NOISE_FLOOR
        )
        notes.append(
            f"batch_channels temp={len(window.measurements)} "
            f"emi={n_emi} rf={n_rf}"
        )
        state = SystemState(
            timestamp=datetime.now(timezone.utc),
            scanner_id=batch.scanner_id,
            mode=self.config.mode,
            thermal=thermal,
            magnetic=magnetic,
            emi=emi,
            rf=rf,
            correlation_id=batch.correlation_id,
            notes=notes,
        )
        self._latest = state
        return state
