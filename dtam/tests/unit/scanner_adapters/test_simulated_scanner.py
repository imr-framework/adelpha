"""Simulated scanner adapter tests."""

from __future__ import annotations

import pytest

from dtam.core.exceptions import (
    AcquisitionError,
    ConfigurationError,
    SensorUnavailableError,
)
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.halbach_48mt import Halbach48mTAdapter
from dtam.scanner_adapters.simulated_scanner import SimulatedScannerAdapter


def test_simulated_read_temperature_batch(
    simulated_adapter: SimulatedScannerAdapter,
) -> None:
    batch = simulated_adapter.read_measurements()
    assert batch.scanner_id == "simulated_scanner"
    assert len(batch.measurements) == len(simulated_adapter.list_sensors())
    kinds = {m.quantity.value for m in batch.measurements}
    assert "temperature" in kinds
    assert "emi_field_rms" in kinds
    assert "rf_noise_floor" in kinds
    assert all(m.validity.value == "valid" for m in batch.measurements)
    assert all(m.provenance is not None for m in batch.measurements)


def test_simulated_emi_and_rf_channels(
    simulated_adapter: SimulatedScannerAdapter,
) -> None:
    emi = simulated_adapter.read_measurements(["emi_probe_01"]).measurements[0]
    rf = simulated_adapter.read_measurements(["rf_noise_01"]).measurements[0]
    assert emi.quantity.value == "emi_field_rms"
    assert emi.unit == "V"
    assert "peak_frequency_hz" in emi.metadata
    assert rf.quantity.value == "rf_noise_floor"
    assert rf.unit == "dBm/Hz"
    assert "bandwidth_hz" in rf.metadata


def test_simulated_sensor_injection(simulated_adapter: SimulatedScannerAdapter) -> None:
    simulated_adapter.set_temperature_c("temp_magnet_01", 30.0)
    batch = simulated_adapter.read_measurements(["temp_magnet_01"])
    measurement = batch.measurements[0]
    assert measurement.metadata["true_value"] == pytest.approx(30.0)
    assert measurement.value == pytest.approx(30.0, abs=0.5)


def test_read_before_connect_fails(runtime_settings) -> None:
    adapter = SimulatedScannerAdapter(runtime_settings.scanner, seed=1)
    with pytest.raises(AcquisitionError):
        adapter.read_measurements()


def test_unknown_channel_raises(simulated_adapter: SimulatedScannerAdapter) -> None:
    with pytest.raises(SensorUnavailableError):
        simulated_adapter.read_measurements(["missing_channel"])


def test_supports_frequency_compensation(
    simulated_adapter: SimulatedScannerAdapter,
) -> None:
    assert simulated_adapter.supports_action("set_center_frequency")
    assert simulated_adapter.get_mode() is OperationalMode.SIMULATION


def test_halbach_adapter_blocks_physical_io() -> None:
    adapter = Halbach48mTAdapter()
    assert adapter.capabilities.temperature_monitoring is True
    with pytest.raises(ConfigurationError):
        adapter.connect()
    with pytest.raises(ConfigurationError):
        adapter.read_measurements()
