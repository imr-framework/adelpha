"""Application-facing twin session used by the HTTP API."""

from __future__ import annotations

from pathlib import Path

from dtam.bootstrap import DtamApp, bootstrap
from dtam.digital_twin.models.thermal import ThermalToB0Params
from dtam.digital_twin.service import ThermalMagneticTwin, TwinConfig
from dtam.digital_twin.state.system_state import SystemState
from dtam.domain.measurements import MeasurementBatch
from dtam.domain.modes import OperationalMode


class TwinApiSession:
    """Holds a bootstrapped adapter and runs twin updates for HTTP handlers."""

    def __init__(self, app: DtamApp) -> None:
        self._app = app
        if not app.adapter.is_connected:
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
                mode=OperationalMode.SIMULATION,
                config_root=config_root,
            )
        )

    @property
    def scanner_id(self) -> str:
        return self._app.adapter.scanner_id

    @property
    def mode(self) -> OperationalMode:
        return self._app.adapter.get_mode()

    @property
    def connected(self) -> bool:
        return self._app.adapter.is_connected

    def close(self) -> None:
        if self._app.adapter.is_connected:
            self._app.adapter.disconnect()

    def read_batch(self) -> MeasurementBatch:
        if not self._app.adapter.is_connected:
            self._app.adapter.connect()
        return self._app.adapter.read_measurements()

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
