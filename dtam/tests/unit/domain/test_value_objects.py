"""Unit tests for domain value objects and measurements."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from dtam.domain.exceptions import DomainError, InvalidUnitError
from dtam.domain.measurements import (
    Measurement,
    MeasurementBatch,
    Provenance,
    QuantityKind,
    ValidityStatus,
)
from dtam.domain.modes import OperationalMode
from dtam.domain.value_objects import (
    FieldStrength,
    FieldStrengthUnit,
    Frequency,
    Temperature,
    TemperatureUnit,
    Uncertainty,
)


def test_temperature_conversions() -> None:
    t = Temperature(value=25.0, unit=TemperatureUnit.CELSIUS)
    assert t.to_kelvin() == pytest.approx(298.15)
    assert Temperature(value=298.15, unit=TemperatureUnit.KELVIN).to_celsius() == (
        pytest.approx(25.0)
    )


def test_temperature_rejects_below_absolute_zero() -> None:
    with pytest.raises(InvalidUnitError):
        Temperature(value=-1.0, unit=TemperatureUnit.KELVIN)


def test_field_strength_and_frequency() -> None:
    b0 = FieldStrength(value=48.0, unit=FieldStrengthUnit.MILLITESLA)
    assert b0.to_tesla() == pytest.approx(0.048)
    f0 = Frequency.from_field_strength(b0.as_tesla())
    assert f0.to_hertz() == pytest.approx(42_577_478.92 * 0.048)


def test_uncertainty_requires_signal() -> None:
    with pytest.raises(DomainError):
        Uncertainty()


def test_measurement_batch_filters_usable() -> None:
    now = datetime.now(timezone.utc)
    good = Measurement(
        sensor_id="temp_magnet_01",
        scanner_id="simulated_scanner",
        timestamp=now,
        quantity=QuantityKind.TEMPERATURE,
        value=23.0,
        unit="degC",
        validity=ValidityStatus.VALID,
        provenance=Provenance(source="test"),
    )
    bad = Measurement(
        sensor_id="temp_magnet_02",
        scanner_id="simulated_scanner",
        timestamp=now,
        quantity=QuantityKind.TEMPERATURE,
        value=0.0,
        unit="degC",
        validity=ValidityStatus.INVALID,
    )
    batch = MeasurementBatch(
        measurements=[good, bad],
        window_start=now,
        window_end=now,
        scanner_id="simulated_scanner",
    )
    assert len(batch.usable()) == 1
    assert batch.by_sensor("temp_magnet_01")[0].value == 23.0


def test_operational_mode_mutation_gates() -> None:
    assert not OperationalMode.ADVISORY.allows_physical_mutation()
    assert OperationalMode.SIMULATION.allows_simulated_mutation()
    assert OperationalMode.SUPERVISED_CONTROL.allows_physical_mutation()


def test_measurement_quality_bounds() -> None:
    now = datetime.now(timezone.utc)
    with pytest.raises(ValidationError):
        Measurement(
            sensor_id="x",
            scanner_id="y",
            timestamp=now,
            quantity=QuantityKind.TEMPERATURE,
            value=1.0,
            unit="degC",
            acquisition_quality=1.5,
        )
