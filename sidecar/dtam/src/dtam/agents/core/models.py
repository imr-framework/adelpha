"""Pydantic schemas for observations, findings, and assessments."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from .enums import (
    ActionType,
    AgentName,
    AgentStatus,
    ConfidenceLevel,
    OperatingMode,
    OverallStatus,
    SafetyReasonCode,
    SafetyVerdict,
    Severity,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _reject_non_finite(value: float, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a finite number")
    if not math.isfinite(float(value)):
        raise ValueError(f"{field_name} must be finite (no NaN/Inf)")
    return float(value)


class SensorReading(BaseModel):
    """Single sensor sample with explicit unit."""

    channel: str
    value: float
    unit: str
    timestamp: datetime | None = None
    quality: float | None = Field(default=None, ge=0.0, le=1.0)

    @field_validator("value")
    @classmethod
    def _finite_value(cls, v: float) -> float:
        return _reject_non_finite(v, "value")


class ThermalObservation(BaseModel):
    """Temperature-related measurements. Temperatures are in °C unless noted."""

    sensors: list[SensorReading] = Field(default_factory=list)
    ambient_c: float | None = None
    magnet_temperature_c: float | None = None
    history_c: list[float] = Field(default_factory=list)
    history_timestamps_s: list[float] = Field(
        default_factory=list,
        description="Optional epoch seconds aligned with history_c",
    )

    @field_validator("ambient_c", "magnet_temperature_c")
    @classmethod
    def _finite_optional(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _reject_non_finite(v, "temperature")

    @field_validator("history_c")
    @classmethod
    def _finite_history(cls, values: list[float]) -> list[float]:
        return [_reject_non_finite(v, "history_c") for v in values]


class MagnetObservation(BaseModel):
    """B0 / center-frequency measurements. Frequency in Hz unless noted."""

    center_frequency_hz: float | None = None
    estimated_b0_drift_hz: float | None = None
    frequency_history_hz: list[float] = Field(default_factory=list)
    frequency_timestamps_s: list[float] = Field(default_factory=list)
    nominal_field_t: float | None = Field(
        default=None, description="Nominal B0 in tesla when known"
    )
    nucleus: str = Field(
        default="1H", description="Nucleus for gyromagnetic conversions"
    )

    @field_validator("center_frequency_hz", "estimated_b0_drift_hz", "nominal_field_t")
    @classmethod
    def _finite_optional(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _reject_non_finite(v, "magnet_value")

    @field_validator("frequency_history_hz")
    @classmethod
    def _finite_history(cls, values: list[float]) -> list[float]:
        return [_reject_non_finite(v, "frequency_history_hz") for v in values]


class EMIObservation(BaseModel):
    """EMI features and optional bounded time-domain samples."""

    rms: float | None = None
    peak_to_peak: float | None = None
    dominant_frequencies_hz: list[float] = Field(default_factory=list)
    band_power: dict[str, float] | None = None
    samples: list[float] = Field(default_factory=list)
    sample_rate_hz: float | None = None
    spectral_peaks_hz: list[float] = Field(default_factory=list)

    @field_validator("rms", "peak_to_peak", "sample_rate_hz")
    @classmethod
    def _finite_optional(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _reject_non_finite(v, "emi_value")

    @field_validator("samples")
    @classmethod
    def _finite_samples(cls, values: list[float]) -> list[float]:
        return [_reject_non_finite(v, "samples") for v in values]


class RFObservation(BaseModel):
    """RF power / matching related measurements."""

    forward_power_w: float | None = None
    reflected_power_w: float | None = None
    return_loss_db: float | None = None
    reflection_coefficient: float | None = None
    b1_ut: float | None = Field(default=None, description="B1 amplitude in microtesla")
    coil_state: str | None = None

    @field_validator(
        "forward_power_w",
        "reflected_power_w",
        "return_loss_db",
        "reflection_coefficient",
        "b1_ut",
    )
    @classmethod
    def _finite_optional(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _reject_non_finite(v, "rf_value")


class MotionObservation(BaseModel):
    """Patient/phantom motion measurements. Translations in mm, rotations in degrees."""

    translation_mm: list[float] | None = None
    rotation_deg: list[float] | None = None
    velocity_mm_s: float | None = None
    displacement_history_mm: list[float] = Field(default_factory=list)
    tracking_quality: float | None = Field(default=None, ge=0.0, le=1.0)
    tracking_lost: bool = False
    subject_type: str = Field(default="phantom", description="phantom|research|unknown")

    @field_validator("velocity_mm_s")
    @classmethod
    def _finite_optional(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return _reject_non_finite(v, "velocity_mm_s")

    @field_validator("translation_mm", "rotation_deg", "displacement_history_mm")
    @classmethod
    def _finite_lists(cls, values: list[float] | None) -> list[float] | None:
        if values is None:
            return values
        return [_reject_non_finite(v, "motion_value") for v in values]


class SequenceMetadata(BaseModel):
    name: str | None = None
    tr_s: float | None = None
    te_s: float | None = None
    flip_angle_deg: float | None = None
    notes: str | None = None


class DigitalTwinObservation(BaseModel):
    """Structured MRI digital-twin observation package."""

    timestamp: datetime = Field(default_factory=utc_now)
    operating_mode: OperatingMode = OperatingMode.OBSERVE
    scanner_state: str | None = None
    thermal: ThermalObservation | None = None
    magnet: MagnetObservation | None = None
    emi: EMIObservation | None = None
    rf: RFObservation | None = None
    motion: MotionObservation | None = None
    sequence: SequenceMetadata | None = None
    previous_state_summary: str | None = None
    requested_agents: list[AgentName] = Field(
        default_factory=list,
        description="Optional explicit specialist activation requests",
    )
    correlation_id: str | None = None
    synthetic: bool = Field(
        default=True, description="Examples are synthetic by default"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _assign_correlation_id(self) -> DigitalTwinObservation:
        if not self.correlation_id:
            self.correlation_id = str(uuid4())
        return self


class EvidenceItem(BaseModel):
    source: str
    description: str
    value: Any | None = None
    unit: str | None = None
    kind: str = Field(
        default="measurement",
        description="measurement|calculation|hypothesis|recommendation",
    )


class Finding(BaseModel):
    code: str
    summary: str
    severity: Severity = Severity.INFO
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_ids: list[str] = Field(default_factory=list)
    domain: str | None = None


class ProposedAction(BaseModel):
    action_type: ActionType
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    parameters: dict[str, Any] = Field(default_factory=dict)
    units: dict[str, str] = Field(default_factory=dict)
    evidence_ids: list[str] = Field(default_factory=list)
    requires_human_review: bool = False
    simulation_only: bool = True


class SafetyDecision(BaseModel):
    action: ProposedAction
    verdict: SafetyVerdict
    reason_codes: list[SafetyReasonCode]
    explanation: str
    decided_by: str = "deterministic_safety_policy"


class AgentAssessment(BaseModel):
    agent_name: AgentName
    activation_reason: str
    status: AgentStatus
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    proposed_actions: list[ProposedAction] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    confidence_level: ConfidenceLevel = ConfidenceLevel.LOW
    assumptions: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=utc_now)
    ended_at: datetime | None = None
    duration_ms: float | None = None
    error: str | None = None


class CrossDomainRelationship(BaseModel):
    domains: list[str]
    summary: str
    consistent: bool | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)


class ConflictItem(BaseModel):
    summary: str
    agents: list[str] = Field(default_factory=list)
    severity: Severity = Severity.WARNING


class ProvenanceEvent(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    component: str
    event_type: str
    detail: dict[str, Any] = Field(default_factory=dict)


class DigitalTwinAssessment(BaseModel):
    correlation_id: str
    timestamp: datetime = Field(default_factory=utc_now)
    operating_mode: OperatingMode
    overall_status: OverallStatus
    activated_agents: list[str] = Field(default_factory=list)
    skipped_agents: dict[str, str] = Field(default_factory=dict)
    state_summary: str = ""
    findings: list[Finding] = Field(default_factory=list)
    cross_domain_relationships: list[CrossDomainRelationship] = Field(
        default_factory=list
    )
    conflicts: list[ConflictItem] = Field(default_factory=list)
    approved_recommendations: list[ProposedAction] = Field(default_factory=list)
    rejected_recommendations: list[ProposedAction] = Field(default_factory=list)
    human_review_items: list[str] = Field(default_factory=list)
    safety_decisions: list[SafetyDecision] = Field(default_factory=list)
    data_quality_warnings: list[str] = Field(default_factory=list)
    provenance: list[ProvenanceEvent] = Field(default_factory=list)
    overall_confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    explanation: str = ""
    agent_assessments: list[AgentAssessment] = Field(default_factory=list)
