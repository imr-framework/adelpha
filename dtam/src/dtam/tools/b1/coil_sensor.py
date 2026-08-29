"""RF coil sensor tools for B1 workflows."""

from __future__ import annotations

from typing import Any

import numpy as np

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import error_result, ok_result


def read_coil_sensor(
    reflected_power_fraction: float = 0.05,
    forward_power_w: float = 10.0,
    resonant_frequency_hz: float = 2_043_719.0,
) -> dict[str, Any]:
    """Summarize coil matching / loading observables for B1 reasoning."""
    if forward_power_w <= 0:
        return error_result(
            "read_coil_sensor",
            "forward_power_w must be positive",
            error_code="INVALID_ARGUMENTS",
        )
    reflected = max(0.0, min(1.0, reflected_power_fraction))
    return_loss_db = (
        -np.inf if reflected <= 0 else float(20.0 * np.log10(reflected))
    )
    payload = {
        "forward_power_w": forward_power_w,
        "reflected_power_fraction": reflected,
        "return_loss_db": return_loss_db,
        "resonant_frequency_hz": resonant_frequency_hz,
        "tuning_ok": reflected < 0.1,
    }
    WORKING_STATE.set("b1.last_coil_sensor", payload)
    return ok_result("read_coil_sensor", **payload)
