"""Shared enumerations for the MRI digital twin."""

from __future__ import annotations

from enum import Enum


class OperatingMode(str, Enum):
    """System operating mode. ``act`` is reserved and disabled by default."""

    OBSERVE = "observe"
    RECOMMEND = "recommend"
    ACT = "act"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ConfidenceLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AgentStatus(str, Enum):
    OK = "ok"
    DEGRADED = "degraded"
    SKIPPED = "skipped"
    ERROR = "error"


class OverallStatus(str, Enum):
    NORMAL = "normal"
    ABNORMAL = "abnormal"
    DEGRADED = "degraded"
    HUMAN_REVIEW = "human_review"
    ERROR = "error"


class SafetyVerdict(str, Enum):
    PASS = "pass"
    REJECT = "reject"
    HUMAN_REVIEW_REQUIRED = "human_review_required"


class ActionType(str, Enum):
    """Allowlisted recommendation types. No real hardware execution."""

    MONITOR_FREQUENCY = "monitor_frequency"
    MONITOR_TEMPERATURE = "monitor_temperature"
    REVIEW_THERMAL_SENSORS = "review_thermal_sensors"
    REVIEW_EMI_ENVIRONMENT = "review_emi_environment"
    CHECK_GROUNDING_SHIELDING = "check_grounding_shielding"
    INSPECT_RF_PATH = "inspect_rf_path"
    REVIEW_COIL_CONNECTION = "review_coil_connection"
    OPERATOR_REVIEW_MOTION = "operator_review_motion"
    CONSIDER_REACQUISITION = "consider_reacquisition"
    HUMAN_REVIEW = "human_review"
    SIMULATE_FREQUENCY_CORRECTION = "simulate_frequency_correction"
    # Explicitly unsupported / rejected by policy when requested:
    APPLY_FREQUENCY_CORRECTION = "apply_frequency_correction"
    TUNE_RF_HARDWARE = "tune_rf_hardware"
    EXECUTE_SCANNER_CONTROL = "execute_scanner_control"


class SafetyReasonCode(str, Enum):
    ALLOWED = "allowed"
    UNSUPPORTED_ACTION = "unsupported_action"
    MISSING_UNITS = "missing_units"
    OUT_OF_BOUNDS = "out_of_bounds"
    LOW_CONFIDENCE = "low_confidence"
    MISSING_EVIDENCE = "missing_evidence"
    HARDWARE_CONTROL_FORBIDDEN = "hardware_control_forbidden"
    ACT_MODE_DISABLED = "act_mode_disabled"
    INVALID_MODE = "invalid_mode"
    SAFETY_VALIDATOR_FAILURE = "safety_validator_failure"
    INSUFFICIENT_SUPPORT = "insufficient_support"


class AgentName(str, Enum):
    THERMAL = "thermal_agent"
    MAGNET = "magnet_agent"
    EMI = "emi_agent"
    RF = "rf_agent"
    MOTION = "motion_tracking"
    SAFETY = "safety_agent"
    ORCHESTRATOR = "orchestrator"
