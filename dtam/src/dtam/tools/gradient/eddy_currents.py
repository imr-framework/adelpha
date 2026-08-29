"""Eddy-current model evaluation and interpretation tools."""

from __future__ import annotations

from typing import Any

import numpy as np

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import error_result, ok_result


def evaluate_eddy_current_model(
    tau_ms: float = 1.5,
    amplitude_fraction: float = 0.05,
    times_ms_csv: str = "0,1,2,3,4,5",
) -> dict[str, Any]:
    """Evaluate a simple multi-exponential eddy-current residual waveform."""
    try:
        times = np.array(
            [float(x) for x in times_ms_csv.split(",") if x.strip()]
        )
    except ValueError as exc:
        return error_result(
            "evaluate_eddy_current_model",
            f"Invalid times_ms_csv: {exc}",
            error_code="INVALID_ARGUMENTS",
        )
    if times.size == 0:
        return error_result(
            "evaluate_eddy_current_model",
            "times_ms_csv produced an empty array",
            error_code="INVALID_ARGUMENTS",
        )
    residual = amplitude_fraction * np.exp(-times / max(tau_ms, 1e-6))
    payload = {
        "tau_ms": tau_ms,
        "amplitude_fraction": amplitude_fraction,
        "times_ms": times.tolist(),
        "residual": residual.tolist(),
        "peak_residual": float(np.max(np.abs(residual))),
    }
    WORKING_STATE.set("gradient.last_eddy_model", payload)
    return ok_result("evaluate_eddy_current_model", **payload)


def interpret_eddy_current_results(
    peak_residual: float,
    warn_at: float = 0.02,
) -> dict[str, Any]:
    """Interpret eddy-current residual magnitude for pre-emphasis advice."""
    status = "ok" if peak_residual < warn_at else "elevated"
    recommendations = (
        ["Continue monitoring"]
        if status == "ok"
        else [
            "Consider updating pre-emphasis coefficients",
            "Inspect gradient amplifier thermal state",
            "Validate GIRF estimate against recent measurements",
        ]
    )
    return ok_result(
        "interpret_eddy_current_results",
        status=status,
        peak_residual=peak_residual,
        warn_at=warn_at,
        recommendations=recommendations,
    )
