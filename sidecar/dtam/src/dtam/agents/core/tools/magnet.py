"""Magnet / B0 frequency tools. Frequencies in Hz, field in tesla."""

from __future__ import annotations

from collections.abc import Sequence

from ._validate import as_finite_floats, require_non_empty
from .stats import linear_slope

# Proton gyromagnetic ratio / 2π ≈ 42.577478518 MHz/T (CODATA-derived conventional value).
# Research placeholder — confirm against site calibration before any operational use.
GYROMAGNETIC_RATIO_MHZ_PER_T: dict[str, float] = {
    "1H": 42.577478518,
    "13C": 10.7084,
    "19F": 40.078,
    "23Na": 11.268,
    "31P": 17.235,
}


def field_to_frequency_hz(
    field_t: float, nucleus: str = "1H"
) -> dict[str, float | str]:
    """Convert magnetic field (T) to Larmor frequency (Hz)."""
    if nucleus not in GYROMAGNETIC_RATIO_MHZ_PER_T:
        raise ValueError(f"Unsupported nucleus '{nucleus}'")
    if not _finite(field_t) or field_t <= 0:
        raise ValueError("field_t must be a finite positive number in tesla")
    mhz_per_t = GYROMAGNETIC_RATIO_MHZ_PER_T[nucleus]
    freq_hz = field_t * mhz_per_t * 1e6
    return {
        "frequency_hz": freq_hz,
        "field_t": field_t,
        "nucleus": nucleus,
        "gamma_mhz_per_t": mhz_per_t,
        "note": "Conversion uses tabulated gyromagnetic ratio; verify units/calibration",
    }


def frequency_to_field_t(
    frequency_hz: float, nucleus: str = "1H"
) -> dict[str, float | str]:
    """Convert Larmor frequency (Hz) to field (T)."""
    if nucleus not in GYROMAGNETIC_RATIO_MHZ_PER_T:
        raise ValueError(f"Unsupported nucleus '{nucleus}'")
    if not _finite(frequency_hz) or frequency_hz <= 0:
        raise ValueError("frequency_hz must be a finite positive number")
    mhz_per_t = GYROMAGNETIC_RATIO_MHZ_PER_T[nucleus]
    field_t = (frequency_hz / 1e6) / mhz_per_t
    return {
        "field_t": field_t,
        "frequency_hz": frequency_hz,
        "nucleus": nucleus,
        "gamma_mhz_per_t": mhz_per_t,
        "note": "Conversion uses tabulated gyromagnetic ratio; verify units/calibration",
    }


def drift_rate_hz_per_s(
    frequencies_hz: Sequence[float],
    timestamps_s: Sequence[float] | None = None,
) -> dict[str, float | str]:
    """Estimate frequency drift rate. Returns Hz/s and Hz/min."""
    freqs = require_non_empty(frequencies_hz, name="frequencies_hz")
    if timestamps_s is None:
        fit = linear_slope(freqs)
        return {
            **fit,
            "hz_per_sample": fit["slope"],
            "note": "timestamps missing; slope is Hz per sample index",
        }
    ts = as_finite_floats(timestamps_s, name="timestamps_s")
    if len(ts) != len(freqs):
        raise ValueError("timestamps_s and frequencies_hz length mismatch")
    fit = linear_slope(freqs, ts)
    return {
        **fit,
        "hz_per_s": fit["slope"],
        "hz_per_min": fit["slope"] * 60.0,
    }


def _finite(v: float) -> bool:
    import math

    return (
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(float(v))
    )
