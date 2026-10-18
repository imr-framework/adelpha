"""Application-facing twin session used by the HTTP API."""

from __future__ import annotations

from pathlib import Path
from threading import RLock
from functools import wraps
from datetime import datetime, timezone
from dtam.scanner_adapters.halbach_48mt import Halbach48mTAdapter

from dtam.bootstrap import DtamApp, bootstrap
from dtam.digital_twin.models.thermal import ThermalToB0Params
from dtam.digital_twin.service import ThermalMagneticTwin, TwinConfig
from dtam.digital_twin.state.system_state import SystemState
from dtam.domain.measurements import MeasurementBatch
from dtam.domain.modes import OperationalMode


def _session_locked(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return wrapped


class TwinApiSession:
    """Holds a bootstrapped adapter and runs twin updates for HTTP handlers."""

    def __init__(self, app: DtamApp) -> None:
        self._lock = RLock()
        self.device_hub = None
        self._app = app
        if not app.adapter.is_connected and not isinstance(app.adapter, Halbach48mTAdapter):
            app.adapter.connect()

    @classmethod
    def create(
        cls,
        *,
        scanner_id: str = "simulated_scanner",
        environment: str = "development",
        config_root: Path | str | None = None,
    ) -> TwinApiSession:
        return cls(
            bootstrap(
                scanner_id=scanner_id,
                environment=environment,
                mode=OperationalMode.SIMULATION if scanner_id == "simulated_scanner" else OperationalMode.READ_ONLY,
                config_root=config_root,
            )
        )

    @_session_locked
    def reconfigure(self, *, scanner_id: str, environment: str, config_root=None) -> None:
        # Construct and validate first so a bad profile leaves the live session intact.
        replacement = self.create(scanner_id=scanner_id, environment=environment, config_root=config_root)
        self.close()
        self._app = replacement._app
        if self.device_hub:
            self.device_hub.reset()

    @property
    def scanner_id(self) -> str:
        return self._app.adapter.scanner_id

    @property
    def mode(self) -> OperationalMode:
        return self._app.adapter.get_mode()

    @property
    def connected(self) -> bool:
        return self._app.adapter.is_connected or bool(self.device_hub and self.device_hub.connected(self.scanner_id))

    @_session_locked
    def close(self) -> None:
        if self._app.adapter.is_connected:
            self._app.adapter.disconnect()

    @_session_locked
    def read_batch(self) -> MeasurementBatch:
        if self.mode != OperationalMode.SIMULATION and self.device_hub:
            return self.device_hub.batch(self.scanner_id)
        if isinstance(self._app.adapter, Halbach48mTAdapter):
            now = datetime.now(timezone.utc)
            return MeasurementBatch(scanner_id=self.scanner_id, window_start=now, window_end=now)
        if not self._app.adapter.is_connected:
            self._app.adapter.connect()
        return self._app.adapter.read_measurements()

    @_session_locked
    def update_twin(
        self,
        *,
        predict_horizon_s: float = 0.0,
        magnet_heating_rate_c_per_s: float = 0.0,
        magnet_setpoint_c: float | None = None,
        alpha_t_tesla_per_c: float = -5.0e-5,
        use_thermal_pinn: bool = True,
    ) -> SystemState:
        batch = self.read_batch()
        if not batch.measurements:
            return SystemState(
                timestamp=batch.window_end,
                scanner_id=self.scanner_id,
                mode=self.mode,
                notes=["No recent usable sensor measurements received.", *self._connection_notes()],
            )
        if self.mode != OperationalMode.SIMULATION:
            return self._hardware_state(batch)
        twin = ThermalMagneticTwin(
            TwinConfig(
                nominal_b0_t=self._app.adapter.identity.field_strength_t,
                thermal_to_b0=ThermalToB0Params(
                    alpha_t_tesla_per_c=alpha_t_tesla_per_c,
                ),
                mode=self._app.adapter.get_mode(),
                use_thermal_pinn=use_thermal_pinn,
            )
        )
        horizon = predict_horizon_s if predict_horizon_s > 0 else None
        return twin.update(
            batch,
            predict_horizon_s=horizon,
            magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            magnet_setpoint_c=magnet_setpoint_c,
        )

    def _connection_notes(self) -> list[str]:
        if not self.device_hub:
            return []
        labels = {
            "magnet_temperature": "Magnet temperature",
            "room_temperature": "Room temperature",
            "emi_rms": "EMI RMS",
            "rf_noise": "RF noise",
            "custom": "Custom sensors",
        }
        messages = {
            "received": "{label} received.",
            "missing": "{label} reported missing.",
            "invalid": "{label} reported invalid and was not plotted.",
            "stale": "{label} is older than 30 seconds.",
            "not_connected": "{label} not connected.",
        }
        notes = []
        coverage = self.device_hub.coverage(self.scanner_id)
        for key in ("magnet_temperature", "room_temperature", "emi_rms"):
            notes.append(messages[coverage[key]].format(label=labels[key]))
        for key in ("rf_noise", "custom"):
            if coverage[key] != "not_connected":
                notes.append(messages[coverage[key]].format(label=labels[key]))
        notes.append("EMI spectrum arrays are not published by this protocol.")
        return notes

    def _hardware_state(self, batch):
        """Keep partial hardware data useful without inventing thermal/B0 inputs."""
        from dtam.core.exceptions import StateEstimationError
        from dtam.digital_twin.estimators.thermal_estimator import ThermalEstimator
        from dtam.digital_twin.estimators.emi_estimator import EmiEstimator
        from dtam.digital_twin.estimators.rf_estimator import RfNoiseEstimator
        from dtam.digital_twin.estimators.b0_estimator import B0Estimator
        from dtam.digital_twin.models.thermal import ThermalToB0Model
        from dtam.digital_twin.state.thermal_state import ThermalState
        from dtam.digital_twin.state.common import TimestampedQuantity, QuantitySource
        from dtam.domain.measurements import QuantityKind
        thermal = magnetic = None
        temperatures = [m for m in batch.usable() if m.quantity == QuantityKind.TEMPERATURE]
        if temperatures:
            try:
                thermal = ThermalEstimator().estimate(batch)
                magnetic = B0Estimator(nominal_b0_t=self._app.adapter.identity.field_strength_t,
                                       thermal_to_b0=ThermalToB0Model(ThermalToB0Params())).estimate(thermal)
            except StateEstimationError:
                thermal = ThermalState(timestamp=batch.window_end, scanner_id=self.scanner_id,
                    channels=[TimestampedQuantity(value=m.value, unit=m.unit, timestamp=m.timestamp,
                        source=QuantitySource.MEASURED, channel_id=m.sensor_id) for m in temperatures])
            rooms = [m for m in temperatures if m.metadata.get('role') == 'room']
            if len(rooms) == 1:
                m = rooms[0]
                thermal = thermal.model_copy(update={'room_temperature_c': TimestampedQuantity(
                    value=m.value, unit=m.unit, timestamp=m.timestamp,
                    source=QuantitySource.MEASURED, channel_id=m.sensor_id)})
        return SystemState(timestamp=batch.window_end, scanner_id=self.scanner_id, mode=self.mode,
            thermal=thermal, magnetic=magnetic, emi=EmiEstimator().estimate(batch),
            rf=RfNoiseEstimator().estimate(batch),
            notes=['Hardware measurements; sample timestamps are reception-time estimates.',
                   *self._connection_notes()],
            correlation_id=batch.correlation_id)
