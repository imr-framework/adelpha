"""Motion magnitude and threshold tools. mm / degrees as labeled."""

from __future__ import annotations

import math
from collections.abc import Sequence

from ._validate import as_finite_floats


def motion_magnitude(translation_mm: Sequence[float] | None = None) -> dict[str, float]:
    """Euclidean translation magnitude in mm."""
    if translation_mm is None or len(translation_mm) == 0:
        raise ValueError("translation_mm must be a non-empty sequence")
    data = as_finite_floats(translation_mm, name="translation_mm")
    mag = math.sqrt(sum(v * v for v in data))
    return {"magnitude_mm": mag, "components": float(len(data))}


def threshold_compare(
    value: float,
    *,
    warning: float,
    critical: float,
    unit: str,
) -> dict[str, object]:
    """Compare a scalar against warning/critical thresholds."""
    if not _finite(value) or not _finite(warning) or not _finite(critical):
        raise ValueError("value and thresholds must be finite")
    if warning < 0 or critical < 0:
        raise ValueError("thresholds must be >= 0")
    if critical < warning:
        raise ValueError("critical must be >= warning")
    level = "normal"
    if abs(value) >= critical:
        level = "critical"
    elif abs(value) >= warning:
        level = "warning"
    return {
        "value": value,
        "unit": unit,
        "warning": warning,
        "critical": critical,
        "level": level,
    }


def _finite(v: float) -> bool:
    return (
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(float(v))
    )
