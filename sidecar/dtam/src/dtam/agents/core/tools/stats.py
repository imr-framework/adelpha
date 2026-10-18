"""Statistical helpers with explicit units left to the caller."""

from __future__ import annotations

import math
from collections.abc import Sequence

from ._validate import as_finite_floats, require_non_empty


def robust_mean_median(values: Sequence[float]) -> dict[str, float]:
    """Return mean and median. Unit: same as inputs."""
    data = require_non_empty(values)
    mean = sum(data) / len(data)
    ordered = sorted(data)
    n = len(ordered)
    if n % 2 == 1:
        median = ordered[n // 2]
    else:
        median = 0.5 * (ordered[n // 2 - 1] + ordered[n // 2])
    return {"mean": mean, "median": median, "n": float(n)}


def linear_slope(
    y: Sequence[float],
    x: Sequence[float] | None = None,
) -> dict[str, float]:
    """Ordinary least-squares slope dy/dx.

    If ``x`` is omitted, uses 0..n-1 sample indices.
    Units: (unit of y) / (unit of x).
    """
    ys = require_non_empty(y, name="y")
    if x is None:
        xs = [float(i) for i in range(len(ys))]
    else:
        xs = as_finite_floats(x, name="x")
        if len(xs) != len(ys):
            raise ValueError("x and y must have the same length")
    n = len(ys)
    if n < 2:
        raise ValueError("at least 2 points required for slope")
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((xi - mean_x) ** 2 for xi in xs)
    if denom == 0:
        raise ValueError("x values have zero variance")
    numer = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(xs, ys, strict=True))
    slope = numer / denom
    intercept = mean_y - slope * mean_x
    # R^2 for transparency
    ss_tot = sum((yi - mean_y) ** 2 for yi in ys)
    ss_res = sum(
        (yi - (slope * xi + intercept)) ** 2 for xi, yi in zip(xs, ys, strict=True)
    )
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
    return {
        "slope": slope,
        "intercept": intercept,
        "r2": r2,
        "n": float(n),
    }


def temperature_rate_of_change(
    temperatures_c: Sequence[float],
    timestamps_s: Sequence[float] | None = None,
) -> dict[str, float | str]:
    """Estimate dT/dt in °C/s (also reports °C/min). Baseline linear fit."""
    result = linear_slope(temperatures_c, timestamps_s)
    slope_per_s = float(result["slope"])
    if timestamps_s is None:
        # x is sample index; caller must interpret carefully
        return {
            **result,
            "c_per_sample": slope_per_s,
            "c_per_s": math.nan,
            "c_per_min": math.nan,
            "note": "timestamps missing; slope is °C per sample index",
        }
    return {
        **result,
        "c_per_s": slope_per_s,
        "c_per_min": slope_per_s * 60.0,
    }
