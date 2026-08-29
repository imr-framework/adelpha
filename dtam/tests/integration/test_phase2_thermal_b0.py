"""Phase-2 end-to-end: simulated temps → twin → B0 drift detection."""

from __future__ import annotations

from pathlib import Path

from dtam.bootstrap import bootstrap
from dtam.digital_twin import ThermalMagneticTwin, TwinConfig
from dtam.simulation.scenarios import ThermalDriftScenario


def test_phase2_thermal_b0_closed_observation_loop(config_root: Path) -> None:
    app = bootstrap(
        scanner_id="simulated_scanner",
        environment="testing",
        config_root=config_root,
    )
    twin = ThermalMagneticTwin(
        TwinConfig(
            nominal_b0_t=app.adapter.identity.field_strength_t,
            require_channels=[
                "temp_magnet_01",
                "temp_magnet_02",
                "temp_room_01",
            ],
        )
    )

    baseline = twin.update(app.adapter.read_measurements())
    ThermalDriftScenario(delta_c_per_step=0.8, steps=4, dt_s=8.0).run(app.adapter)
    drifted = twin.update(
        app.adapter.read_measurements(),
        predict_horizon_s=120.0,
        magnet_heating_rate_c_per_s=0.005,
    )

    assert baseline.magnetic and drifted.magnetic
    assert baseline.magnetic.delta_b0_t and drifted.magnetic.delta_b0_t
    assert abs(drifted.magnetic.delta_b0_t.value) > abs(
        baseline.magnetic.delta_b0_t.value
    )
    assert drifted.magnetic.predicted_b0_t is not None
    assert drifted.correlation_id
    assert baseline.emi is not None and baseline.rf is not None
    assert drifted.emi is not None and drifted.rf is not None
