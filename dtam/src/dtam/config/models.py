"""Pydantic models for layered DTAM configuration."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from dtam.domain.entities.scanner import (
    ActuatorKind,
    ScannerCapabilities,
    SensorKind,
)
from dtam.domain.modes import OperationalMode


class LoggingConfig(BaseModel):
    level: str = "INFO"
    json_logs: bool = False
    correlation_header: str = "x-correlation-id"


class AppConfig(BaseModel):
    name: str = "dtam"
    environment: str = "development"
    default_scanner_id: str = "simulated_scanner"
    default_mode: OperationalMode = OperationalMode.SIMULATION
    logging: LoggingConfig = Field(default_factory=LoggingConfig)


class SensorChannelConfig(BaseModel):
    sensor_id: str
    kind: SensorKind
    unit: str
    description: str | None = None
    sampling_rate_hz: float | None = Field(default=None, gt=0.0)
    location: str | None = None
    noise_std: float = Field(default=0.0, ge=0.0)
    nominal_value: float | None = None


class ActuatorChannelConfig(BaseModel):
    actuator_id: str
    kind: ActuatorKind
    description: str | None = None
    reversible: bool = True


class SimulationSensorState(BaseModel):
    """Initial virtual-sensor values for the simulated scanner."""

    temperatures_c: dict[str, float] = Field(default_factory=dict)
    ambient_temperature_c: float = 22.0
    temperature_noise_std_c: float = 0.05


class ScannerProfile(BaseModel):
    """Validated scanner profile loaded from YAML."""

    id: str
    field_strength_t: float = Field(gt=0.0)
    architecture: str
    display_name: str | None = None
    capabilities: ScannerCapabilities = Field(default_factory=ScannerCapabilities)
    sensors: list[SensorChannelConfig] = Field(default_factory=list)
    actuators: list[ActuatorChannelConfig] = Field(default_factory=list)
    supported_actions: list[str] = Field(default_factory=list)
    simulation: SimulationSensorState = Field(default_factory=SimulationSensorState)
    metadata: dict[str, str] = Field(default_factory=dict)

    @field_validator("id")
    @classmethod
    def _non_empty_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("scanner id must be non-empty")
        return cleaned


class EnvironmentConfig(BaseModel):
    environment: str
    mode: OperationalMode | None = None
    logging: LoggingConfig | None = None
    default_scanner_id: str | None = None


class RuntimeSettings(BaseModel):
    """Fully merged runtime settings after layered config loading."""

    app: AppConfig
    scanner: ScannerProfile
    mode: OperationalMode
    config_root: str
