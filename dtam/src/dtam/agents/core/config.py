"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Non-secret runtime settings for the digital twin agents."""

    model: str = Field(default="gemini-2.5-flash", description="LLM model id")
    default_mode: str = Field(default="observe")
    log_level: str = Field(default="INFO")
    max_workflow_iterations: int = Field(default=3, ge=1, le=20)
    max_specialist_retries: int = Field(default=1, ge=0, le=5)
    min_action_confidence: float = Field(default=0.55, ge=0.0, le=1.0)
    enable_simulated_act_mode: bool = Field(default=False)
    tool_timeout_s: float = Field(default=10.0, gt=0)
    max_emi_samples: int = Field(default=50_000, ge=16)
    max_parallel_workers: int = Field(default=4, ge=1, le=16)

    # Domain thresholds (research defaults; not clinical limits)
    thermal_rate_warning_c_per_min: float = 0.15
    thermal_rate_critical_c_per_min: float = 0.4
    thermal_outlier_mad_z: float = 3.5
    thermal_prediction_horizon_min: float = 5.0
    magnet_drift_warning_hz_per_min: float = 2.0
    magnet_drift_critical_hz_per_min: float = 10.0
    magnet_abrupt_delta_hz: float = 50.0
    # Rough research coupling: ~Hz expected per °C of magnet temp change (placeholder).
    thermal_b0_coupling_hz_per_c: float = 15.0
    thermal_b0_consistency_tol_hz: float = 25.0
    emi_rms_warning: float = 0.05
    emi_peak_warning: float = 0.2
    rf_return_loss_warning_db: float = 10.0
    rf_vswr_warning: float = 2.0
    motion_translation_warning_mm: float = 2.0
    motion_translation_critical_mm: float = 5.0
    motion_rotation_warning_deg: float = 1.0
    motion_rotation_critical_deg: float = 3.0
    simulate_freq_correction_max_hz: float = 200.0


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings from process environment. Does not read secret values into logs."""
    return Settings(
        model=os.getenv("DT_MODEL", "gemini-2.5-flash"),
        default_mode=os.getenv("DT_DEFAULT_MODE", "observe"),
        log_level=os.getenv("DT_LOG_LEVEL", "INFO"),
        max_workflow_iterations=int(os.getenv("DT_MAX_WORKFLOW_ITERATIONS", "3")),
        max_specialist_retries=int(os.getenv("DT_MAX_SPECIALIST_RETRIES", "1")),
        min_action_confidence=float(os.getenv("DT_MIN_ACTION_CONFIDENCE", "0.55")),
        enable_simulated_act_mode=_env_bool("DT_ENABLE_SIMULATED_ACT_MODE", False),
        tool_timeout_s=float(os.getenv("DT_TOOL_TIMEOUT_S", "10")),
        max_emi_samples=int(os.getenv("DT_MAX_EMI_SAMPLES", "50000")),
        max_parallel_workers=int(os.getenv("DT_MAX_PARALLEL_WORKERS", "4")),
    )


def reset_settings_cache() -> None:
    """Clear cached settings (tests only)."""
    get_settings.cache_clear()
