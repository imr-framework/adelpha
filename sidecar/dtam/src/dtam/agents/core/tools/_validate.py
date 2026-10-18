"""Shared numeric validation helpers."""

from __future__ import annotations

import math
from collections.abc import Sequence


def as_finite_floats(values: Sequence[float], *, name: str = "values") -> list[float]:
    out: list[float] = []
    for i, v in enumerate(values):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError(f"{name}[{i}] must be numeric")
        fv = float(v)
        if not math.isfinite(fv):
            raise ValueError(f"{name}[{i}] must be finite (no NaN/Inf)")
        out.append(fv)
    return out


def require_non_empty(values: Sequence[float], *, name: str = "values") -> list[float]:
    data = as_finite_floats(values, name=name)
    if not data:
        raise ValueError(f"{name} must be non-empty")
    return data
