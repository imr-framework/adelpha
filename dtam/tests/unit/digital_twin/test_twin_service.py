"""Estimator and twin-service tests."""

from __future__ import annotations

import pytest

from dtam.config.loader import load_runtime_settings
from dtam.digital_twin import (
    QuantitySource,
    ThermalMagneticTwin,
    TwinConfig,
)
from dtam.digital_twin.state.common import QuantitySource as QS
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.simulated_scanner import SimulatedScannerAdapter
from dtam.simulation.scenarios import ThermalDriftScenario


@pytest.fixture
def adapter(config_root) -> SimulatedScannerAdapter:
    settings = load_runtime_settings(
        scanner_id="simulated_scanner",
        environment="testing",
        config_root=config_root,
    )
    sim = SimulatedScannerAdapter(
        settings.scanner,
        mode=OperationalMode.SIMULATION,
        seed=0,
    )
    sim.connect()
    # Deterministic: zero noise via exact setpoints already present.
    return sim


def test_twin_update_separates_measured_and_estimated(adapter) -> None:
    twin = ThermalMagneticTwin(
        TwinConfig(nominal_b0_t=adapter.identity.field_strength_t)
    )
    batch = adapter.read_measurements()
    state = twin.update(batch)

    assert state.thermal is not None
    assert state.magnetic is not None
    assert state.emi is not None
    assert state.rf is not None
    assert state.thermal.mean_magnet_temperature_c is not None
    assert (
        state.thermal.mean_magnet_temperature_c.source is QuantitySource.ESTIMATED
    )
    assert any(c.source is QS.MEASURED for c in state.thermal.channels)
    assert state.magnetic.b0_t is not None
    assert state.magnetic.b0_t.source is QuantitySource.ESTIMATED
    assert state.magnetic.resonant_frequency_mhz is not None
    assert state.magnetic.resonant_frequency_mhz.unit == "MHz"
    assert state.emi.rms_v is not None
    assert state.rf.noise_floor_dbm_per_hz is not None
    assert state.twin_version.startswith("phase2b")


def test_thermal_drift_scenario_shifts_b0(adapter) -> None:
    twin = ThermalMagneticTwin(
        TwinConfig(nominal_b0_t=adapter.identity.field_strength_t)
    )
    before = twin.update(adapter.read_measurements())
    assert before.magnetic and before.magnetic.b0_t

    ThermalDriftScenario(delta_c_per_step=1.0, steps=3, dt_s=5.0).run(adapter)
    after = twin.update(adapter.read_measurements())
    assert after.magnetic and after.magnetic.b0_t
    assert after.thermal and after.thermal.mean_magnet_temperature_c
    assert before.thermal and before.thermal.mean_magnet_temperature_c

    assert (
        after.thermal.mean_magnet_temperature_c.value
        > before.thermal.mean_magnet_temperature_c.value
    )
    # Heating NdFeB-like coupling (negative alpha) lowers B0.
    assert after.magnetic.b0_t.value < before.magnetic.b0_t.value


def test_b0_prediction_horizon(adapter) -> None:
    twin = ThermalMagneticTwin(
        TwinConfig(
            nominal_b0_t=adapter.identity.field_strength_t,
            use_thermal_pinn=False,
        )
    )
    state = twin.update(
        adapter.read_measurements(),
        predict_horizon_s=60.0,
        magnet_heating_rate_c_per_s=0.01,
    )
    assert state.magnetic is not None
    assert state.magnetic.predicted_b0_t is not None
    assert state.magnetic.predicted_b0_t.source is QuantitySource.PREDICTED
    assert state.magnetic.predicted_frequency_mhz is not None
    assert state.magnetic.predicted_frequency_mhz.unit == "MHz"
    assert state.thermal is not None
    assert state.thermal.predicted_mean_magnet_temperature_c is not None
    assert (
        state.thermal.predicted_mean_magnet_temperature_c.source
        is QuantitySource.PREDICTED
    )
    assert any("linear_rate" in n for n in state.notes)
