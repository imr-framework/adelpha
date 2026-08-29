"""Typed measurements with provenance, validity, and uncertainty."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class ValidityStatus(str, Enum):
    VALID = "valid"
    SUSPECT = "suspect"
    INVALID = "invalid"
    MISSING = "missing"


class QuantityKind(str, Enum):
    TEMPERATURE = "temperature"
    FIELD_STRENGTH = "field_strength"
    FREQUENCY = "frequency"
    VOLTAGE = "voltage"
    CURRENT = "current"
    POWER = "power"
    EMI_FIELD_RMS = "emi_field_rms"
    RF_NOISE_FLOOR = "rf_noise_floor"
    DIMENSIONLESS = "dimensionless"
    OTHER = "other"


class Provenance(BaseModel):
    """Traceable origin of a measurement or derived quantity."""

    source: str
    method: str | None = None
    version: str | None = None
    notes: str | None = None

    model_config = {"frozen": True}


class Measurement(BaseModel):
    """A single timestamped sensor or scanner measurement."""

    measurement_id: str = Field(default_factory=lambda: str(uuid4()))
    sensor_id: str
    scanner_id: str
    timestamp: datetime
    quantity: QuantityKind
    value: float
    unit: str
    calibration_version: str | None = None
    uncertainty: float | None = Field(default=None, ge=0.0)
    acquisition_quality: float | None = Field(default=None, ge=0.0, le=1.0)
    validity: ValidityStatus = ValidityStatus.VALID
    provenance: Provenance | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"frozen": True}

    @property
    def is_usable(self) -> bool:
        return self.validity in {ValidityStatus.VALID, ValidityStatus.SUSPECT}


class MeasurementBatch(BaseModel):
    """A synchronized window of measurements with a correlation identifier."""

    measurements: list[Measurement] = Field(default_factory=list)
    window_start: datetime
    window_end: datetime
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))
    scanner_id: str

    model_config = {"frozen": True}

    def by_sensor(self, sensor_id: str) -> list[Measurement]:
        return [m for m in self.measurements if m.sensor_id == sensor_id]

    def usable(self) -> list[Measurement]:
        return [m for m in self.measurements if m.is_usable]
