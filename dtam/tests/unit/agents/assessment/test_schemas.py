"""Schema validation tests."""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from dtam.agents.core.enums import ActionType, OperatingMode
from dtam.agents.core.models import (
    DigitalTwinObservation,
    ProposedAction,
    SensorReading,
    ThermalObservation,
)


def test_valid_observation_roundtrip():
    obs = DigitalTwinObservation(
        operating_mode=OperatingMode.OBSERVE,
        thermal=ThermalObservation(
            sensors=[SensorReading(channel="t1", value=22.0, unit="°C")],
            ambient_c=21.0,
        ),
    )
    data = obs.model_dump(mode="json")
    again = DigitalTwinObservation.model_validate(data)
    assert again.correlation_id
    assert again.thermal.ambient_c == 21.0


def test_missing_optional_data_ok():
    obs = DigitalTwinObservation(operating_mode=OperatingMode.OBSERVE)
    assert obs.thermal is None
    assert obs.magnet is None


def test_nan_rejected():
    with pytest.raises(ValidationError):
        SensorReading(channel="t1", value=math.nan, unit="°C")


def test_inf_rejected():
    with pytest.raises(ValidationError):
        ThermalObservation(ambient_c=math.inf)


def test_confidence_bounds_on_action():
    with pytest.raises(ValidationError):
        ProposedAction(
            action_type=ActionType.MONITOR_TEMPERATURE,
            description="x",
            confidence=1.5,
        )
