"""RF matching conversion tools. Powers in watts unless noted."""

from __future__ import annotations

import math


def reflection_from_powers(forward_w: float, reflected_w: float) -> dict[str, float]:
    """Magnitude of reflection coefficient from forward/reflected power (W)."""
    if not _finite_nonneg(forward_w) or not _finite_nonneg(reflected_w):
        raise ValueError("powers must be finite and >= 0 (watts)")
    if forward_w == 0:
        raise ValueError("forward_power_w must be > 0")
    if reflected_w > forward_w:
        raise ValueError("reflected power cannot exceed forward power")
    gamma = math.sqrt(reflected_w / forward_w)
    return {
        "reflection_coefficient": gamma,
        "forward_w": forward_w,
        "reflected_w": reflected_w,
    }


def return_loss_db(gamma: float) -> dict[str, float]:
    """Return loss in dB from reflection coefficient magnitude."""
    if not _finite(gamma) or gamma < 0:
        raise ValueError("gamma must be finite and >= 0")
    if gamma == 0:
        return {"return_loss_db": math.inf, "reflection_coefficient": gamma}
    if gamma > 1:
        raise ValueError("reflection coefficient magnitude should be <= 1")
    rl = -20.0 * math.log10(gamma)
    return {"return_loss_db": rl, "reflection_coefficient": gamma}


def vswr_from_gamma(gamma: float) -> dict[str, float]:
    """VSWR from reflection coefficient magnitude."""
    if not _finite(gamma) or gamma < 0 or gamma > 1:
        raise ValueError("gamma must be in [0, 1]")
    if gamma == 1:
        return {"vswr": math.inf, "reflection_coefficient": gamma}
    vswr = (1.0 + gamma) / (1.0 - gamma)
    return {"vswr": vswr, "reflection_coefficient": gamma}


def _finite(v: float) -> bool:
    return (
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(float(v))
    )


def _finite_nonneg(v: float) -> bool:
    return _finite(v) and float(v) >= 0
