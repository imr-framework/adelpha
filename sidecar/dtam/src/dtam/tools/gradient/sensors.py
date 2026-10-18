"""Gradient sensor summary tools."""

from __future__ import annotations

from typing import Any

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import ok_result


def read_gradient_sensor_summary(
    commanded_amplitude_mt_m: float = 10.0,
    measured_amplitude_mt_m: float = 9.7,
    delay_us: float = 20.0,
) -> dict[str, Any]:
    """Summarize commanded vs measured gradient behavior."""
    error = measured_amplitude_mt_m - commanded_amplitude_mt_m
    payload = {
        "commanded_amplitude_mt_m": commanded_amplitude_mt_m,
        "measured_amplitude_mt_m": measured_amplitude_mt_m,
        "amplitude_error_mt_m": error,
        "delay_us": delay_us,
        "relative_error": (
            error / commanded_amplitude_mt_m if commanded_amplitude_mt_m else None
        ),
    }
    WORKING_STATE.set("gradient.last_sensor", payload)
    return ok_result("read_gradient_sensor_summary", **payload)
