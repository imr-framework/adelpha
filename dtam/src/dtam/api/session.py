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

    @property
    def scanner_id(self) -> str:
        return self._app.adapter.scanner_id

    @property
    def mode(self) -> OperationalMode:
        return self._app.adapter.get_mode()

    @property
    def connected(self) -> bool:
        return self._app.adapter.is_connected

    @_session_locked
    def close(self) -> None:
        if self._app.adapter.is_connected:
            self._app.adapter.disconnect()

    @_session_locked
    def read_batch(self) -> MeasurementBatch:
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
            return SystemState(timestamp=batch.window_end, scanner_id=self.scanner_id, mode=self.mode,
                               notes=["No sensor measurements received. Hardware transport is not configured."])
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
