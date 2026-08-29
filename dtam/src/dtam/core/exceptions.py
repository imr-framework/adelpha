"""Structured application-level exceptions for DTAM."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any


class ErrorSeverity(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class Recoverability(str, Enum):
    RECOVERABLE = "recoverable"
    RETRYABLE = "retryable"
    FATAL = "fatal"
    REQUIRES_HUMAN = "requires_human"


class DtamError(Exception):
    """Base DTAM error with structured context for logging and audit."""

    code: str = "DTAM_ERROR"
    severity: ErrorSeverity = ErrorSeverity.ERROR
    recoverability: Recoverability = Recoverability.REQUIRES_HUMAN

    def __init__(
        self,
        message: str,
        *,
        scanner_id: str | None = None,
        correlation_id: str | None = None,
        context: dict[str, Any] | None = None,
        recommended_response: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.scanner_id = scanner_id
        self.correlation_id = correlation_id
        self.context = context or {}
        self.recommended_response = recommended_response
        self.timestamp = datetime.now(timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "recoverability": self.recoverability.value,
            "scanner_id": self.scanner_id,
            "correlation_id": self.correlation_id,
            "timestamp": self.timestamp.isoformat(),
            "context": self.context,
            "recommended_response": self.recommended_response,
        }


class ConfigurationError(DtamError):
    code = "CONFIGURATION_ERROR"
    severity = ErrorSeverity.CRITICAL
    recoverability = Recoverability.FATAL


class AcquisitionError(DtamError):
    code = "ACQUISITION_ERROR"


class SensorUnavailableError(AcquisitionError):
    code = "SENSOR_UNAVAILABLE"
    recoverability = Recoverability.RETRYABLE


class CalibrationError(DtamError):
    code = "CALIBRATION_ERROR"


class SynchronizationError(DtamError):
    code = "SYNCHRONIZATION_ERROR"


class StateEstimationError(DtamError):
    code = "STATE_ESTIMATION_ERROR"


class ModelError(DtamError):
    code = "MODEL_ERROR"


class AgentExecutionError(DtamError):
    code = "AGENT_EXECUTION_ERROR"


class ToolExecutionError(DtamError):
    code = "TOOL_EXECUTION_ERROR"


class SafetyViolationError(DtamError):
    code = "SAFETY_VIOLATION"
    severity = ErrorSeverity.CRITICAL
    recoverability = Recoverability.FATAL


class ApprovalRequiredError(DtamError):
    code = "APPROVAL_REQUIRED"
    severity = ErrorSeverity.WARNING
    recoverability = Recoverability.REQUIRES_HUMAN


class ActuatorError(DtamError):
    code = "ACTUATOR_ERROR"


class InterlockError(DtamError):
    code = "INTERLOCK_ERROR"
    severity = ErrorSeverity.CRITICAL
    recoverability = Recoverability.FATAL


class CommunicationError(DtamError):
    code = "COMMUNICATION_ERROR"
    recoverability = Recoverability.RETRYABLE


class ArtifactError(DtamError):
    code = "ARTIFACT_ERROR"
