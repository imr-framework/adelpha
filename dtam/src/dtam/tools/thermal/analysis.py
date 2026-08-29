"""Thermal gradient analysis tools."""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import error_result, ok_result


def analyze_thermal_gradient(channels_json: str = "[]") -> dict[str, Any]:
    """Compute basic thermal gradient statistics across channel values."""
    try:
        channels = json.loads(channels_json) if channels_json else []
    except json.JSONDecodeError as exc:
        return error_result(
            "analyze_thermal_gradient",
            f"Invalid channels_json: {exc}",
            error_code="INVALID_PAYLOAD",
        )
    if not channels:
        cached = WORKING_STATE.get("thermal.last_channels") or []
        channels = cached
    values = [float(c["value"]) for c in channels if "value" in c]
    if not values:
        return error_result(
            "analyze_thermal_gradient",
            "No temperature values available.",
            error_code="NO_TEMPERATURE_DATA",
        )
    arr = np.asarray(values, dtype=float)
    return ok_result(
        "analyze_thermal_gradient",
        n=len(arr),
        mean_c=float(arr.mean()),
        min_c=float(arr.min()),
        max_c=float(arr.max()),
        span_c=float(arr.max() - arr.min()),
        std_c=float(arr.std()),
    )
