"""EMI signal feature tools."""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

from ._validate import as_finite_floats, require_non_empty


def rms(values: Sequence[float]) -> dict[str, float]:
    """Root-mean-square amplitude. Unit: same as samples."""
    data = require_non_empty(values)
    return {
        "rms": math.sqrt(sum(v * v for v in data) / len(data)),
        "n": float(len(data)),
    }


def peak_to_peak(values: Sequence[float]) -> dict[str, float]:
    data = require_non_empty(values)
    return {"peak_to_peak": max(data) - min(data), "min": min(data), "max": max(data)}


def dominant_frequencies(
    values: Sequence[float],
    sample_rate_hz: float,
    *,
    top_k: int = 3,
    max_samples: int = 50_000,
) -> dict[str, object]:
    """FFT-based dominant frequency extraction.

    ``sample_rate_hz`` in Hz. Returns peaks in Hz. Research baseline only.
    """
    data = as_finite_floats(values, name="samples")
    if len(data) < 4:
        raise ValueError("need at least 4 samples for FFT features")
    if len(data) > max_samples:
        raise ValueError(f"sample count {len(data)} exceeds max_samples={max_samples}")
    if not math.isfinite(sample_rate_hz) or sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be finite and > 0")
    if top_k < 1:
        raise ValueError("top_k must be >= 1")

    arr = np.asarray(data, dtype=float)
    arr = arr - np.mean(arr)
    spectrum = np.fft.rfft(arr)
    freqs = np.fft.rfftfreq(len(arr), d=1.0 / sample_rate_hz)
    power = np.abs(spectrum) ** 2
    # Exclude DC
    power[0] = 0.0
    order = np.argsort(power)[::-1]
    peaks: list[dict[str, float]] = []
    for idx in order:
        if len(peaks) >= top_k:
            break
        if power[idx] <= 0:
            continue
        peaks.append({"frequency_hz": float(freqs[idx]), "power": float(power[idx])})
    return {
        "peaks": peaks,
        "n": len(data),
        "sample_rate_hz": sample_rate_hz,
        "label": "fft_dominant_frequencies",
        "note": "Research baseline FFT peaks; not source attribution",
    }


def band_power(
    values: Sequence[float],
    sample_rate_hz: float,
    bands_hz: dict[str, tuple[float, float]],
    *,
    max_samples: int = 50_000,
) -> dict[str, float]:
    """Integrate spectral power in named bands. Band edges in Hz."""
    data = as_finite_floats(values, name="samples")
    if len(data) > max_samples:
        raise ValueError(f"sample count {len(data)} exceeds max_samples={max_samples}")
    if not math.isfinite(sample_rate_hz) or sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be finite and > 0")
    arr = np.asarray(data, dtype=float)
    arr = arr - np.mean(arr)
    spectrum = np.fft.rfft(arr)
    freqs = np.fft.rfftfreq(len(arr), d=1.0 / sample_rate_hz)
    power = np.abs(spectrum) ** 2
    out: dict[str, float] = {}
    for name, (lo, hi) in bands_hz.items():
        if lo > hi:
            raise ValueError(f"band {name}: low > high")
        mask = (freqs >= lo) & (freqs < hi)
        out[name] = float(np.sum(power[mask]))
    return out
