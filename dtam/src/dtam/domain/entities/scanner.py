"""Scanner capability and channel identity entities."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class SensorKind(str, Enum):
    TEMPERATURE = "temperature"
    MAGNETIC_FIELD = "magnetic_field"
    EMI = "emi"
    RF = "rf"
    GRADIENT = "gradient"
    IMAGE_QUALITY = "image_quality"
    ENVIRONMENTAL = "environmental"
    OTHER = "other"


class ActuatorKind(str, Enum):
    FREQUENCY_COMPENSATION = "frequency_compensation"
    RF_TUNING = "rf_tuning"
    RF_MATCHING = "rf_matching"
    GRADIENT_PREEMPHASIS = "gradient_preemphasis"
    SEQUENCE_ADAPTATION = "sequence_adaptation"
    SHIMMING = "shimming"
    OTHER = "other"


class ScannerCapabilities(BaseModel):
    """Machine-readable capability profile for a scanner adapter."""

    temperature_monitoring: bool = False
    b0_monitoring: bool = False
    emi_monitoring: bool = False
    gradient_monitoring: bool = False
    rf_tuning_control: bool = False
    active_shimming: bool = False
    frequency_compensation: bool = False
    sequence_adaptation: bool = False
    automatic_control: bool = False

    model_config = {"frozen": True}

    def supports(self, capability: str) -> bool:
        if not hasattr(self, capability):
            return False
        return bool(getattr(self, capability))


class SensorDescriptor(BaseModel):
    """Scanner-facing description of an available sensor channel."""

    sensor_id: str
    kind: SensorKind
    unit: str
    description: str | None = None
    sampling_rate_hz: float | None = Field(default=None, gt=0.0)
    location: str | None = None

    model_config = {"frozen": True}


class ActuatorDescriptor(BaseModel):
    """Scanner-facing description of an available actuator."""

    actuator_id: str
    kind: ActuatorKind
    description: str | None = None
    reversible: bool = True

    model_config = {"frozen": True}


class ScannerIdentity(BaseModel):
    """Stable identity and architecture metadata for a scanner."""

    scanner_id: str
    field_strength_t: float = Field(gt=0.0)
    architecture: str
    display_name: str | None = None

    model_config = {"frozen": True}
