"""Acquisition facade and twin multi-state tests."""

from __future__ import annotations

from dtam.acquisition.emi import read_emi_batch
from dtam.acquisition.rf import read_rf_noise_batch
from dtam.acquisition.temperature import read_temperature_batch
from dtam.digital_twin import ThermalMagneticTwin, TwinConfig
from dtam.tools.state_estimation import estimate_twin_state


def test_acquisition_facades_filter_kinds(simulated_adapter) -> None:
    temps = read_temperature_batch(simulated_adapter)
    emi = read_emi_batch(simulated_adapter)
    rf = read_rf_noise_batch(simulated_adapter)
    assert temps.measurements
    assert all(m.quantity.value == "temperature" for m in temps.measurements)
    assert emi.measurements
    assert all(m.quantity.value == "emi_field_rms" for m in emi.measurements)
    assert rf.measurements
    assert all(m.quantity.value == "rf_noise_floor" for m in rf.measurements)


def test_estimate_twin_state_tool() -> None:
    result = estimate_twin_state("simulated_scanner")
    assert result["ok"] is True
    data = result["data"]
    assert data["mean_magnet_temperature_c"] is not None
    assert data["b0_t"] is not None
    assert data["emi_rms_v"] is not None
    assert data["rf_noise_floor_dbm_per_hz"] is not None
    assert data["twin_version"].startswith("phase2b")


def test_integration_twin_populates_emi_rf(simulated_adapter) -> None:
    twin = ThermalMagneticTwin(
        TwinConfig(nominal_b0_t=simulated_adapter.identity.field_strength_t)
    )
    state = twin.update(simulated_adapter.read_measurements())
    assert state.emi is not None and state.emi.classification_label
    assert state.rf is not None and state.rf.noise_floor_dbm_per_hz is not None
