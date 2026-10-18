"""Thermal analysis tools. Temperatures in °C."""

from __future__ import annotations

from collections.abc import Sequence

from ._validate import as_finite_floats, require_non_empty
from .stats import linear_slope


def detect_outliers_mad(
    values: Sequence[float],
    *,
    z_thresh: float = 3.5,
) -> dict[str, object]:
    """Robust outlier detection via median absolute deviation (MAD).

    Returns indices and values flagged as outliers. Unit: same as inputs (°C typical).
    """
    data = require_non_empty(values)
    if z_thresh <= 0:
        raise ValueError("z_thresh must be > 0")
    ordered = sorted(data)
    n = len(ordered)
    median = (
        ordered[n // 2] if n % 2 == 1 else 0.5 * (ordered[n // 2 - 1] + ordered[n // 2])
    )
    abs_dev = [abs(v - median) for v in data]
    abs_ordered = sorted(abs_dev)
    mad = (
        abs_ordered[n // 2]
        if n % 2 == 1
        else 0.5 * (abs_ordered[n // 2 - 1] + abs_ordered[n // 2])
    )
    # Consistent with normal distribution scaling
    if mad == 0:
        return {
            "median": median,
            "mad": 0.0,
            "outlier_indices": [],
            "outlier_values": [],
            "scores": [0.0] * n,
        }
    scores = [0.6745 * (v - median) / mad for v in data]
    idxs = [i for i, s in enumerate(scores) if abs(s) >= z_thresh]
    return {
        "median": median,
        "mad": mad,
        "outlier_indices": idxs,
        "outlier_values": [data[i] for i in idxs],
        "scores": scores,
    }


def predict_linear_temperature(
    temperatures_c: Sequence[float],
    timestamps_s: Sequence[float] | None,
    horizon_s: float,
) -> dict[str, float | str]:
    """Short-horizon linear baseline prediction. Not a validated physical model."""
    temps = require_non_empty(temperatures_c, name="temperatures_c")
    if not math_isfinite(horizon_s) or horizon_s < 0:
        raise ValueError("horizon_s must be a finite non-negative number")
    if timestamps_s is None:
        xs = [float(i) for i in range(len(temps))]
        fit = linear_slope(temps, xs)
        x_end = xs[-1]
        # Interpret horizon as number of samples ahead when timestamps missing
        pred = fit["slope"] * (x_end + horizon_s) + fit["intercept"]
        return {
            "predicted_c": pred,
            "slope": fit["slope"],
            "label": "baseline_linear_prediction_per_sample",
            "note": "Research baseline only; timestamps missing",
        }
    ts = as_finite_floats(timestamps_s, name="timestamps_s")
    if len(ts) != len(temps):
        raise ValueError("timestamps_s and temperatures_c length mismatch")
    fit = linear_slope(temps, ts)
    t_end = ts[-1]
    pred = fit["slope"] * (t_end + horizon_s) + fit["intercept"]
    return {
        "predicted_c": pred,
        "slope_c_per_s": fit["slope"],
        "horizon_s": horizon_s,
        "label": "baseline_linear_prediction",
        "note": "Research baseline only; not a validated thermal model",
    }


def math_isfinite(v: float) -> bool:
    import math

    return (
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(float(v))
    )
