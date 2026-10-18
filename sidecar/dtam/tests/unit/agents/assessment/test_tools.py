"""Deterministic tool tests."""

from __future__ import annotations

import math

import numpy as np
import pytest

from dtam.agents.core.tools import (
    detect_outliers_mad,
    dominant_frequencies,
    drift_rate_hz_per_s,
    linear_slope,
    motion_magnitude,
    reflection_from_powers,
    return_loss_db,
    temperature_rate_of_change,
    vswr_from_gamma,
)


def test_temperature_slope():
    # 0.1 °C/min => 0.1/60 °C/s
    temps = [20.0, 20.1, 20.2, 20.3]
    ts = [0.0, 60.0, 120.0, 180.0]
    rate = temperature_rate_of_change(temps, ts)
    assert abs(rate["c_per_min"] - 0.1) < 1e-9


def test_outliers_mad():
    values = [20.0, 20.1, 20.0, 20.05, 35.0]
    out = detect_outliers_mad(values, z_thresh=3.5)
    assert 4 in out["outlier_indices"]


def test_frequency_drift():
    freqs = [100.0, 110.0, 120.0]
    ts = [0.0, 60.0, 120.0]
    drift = drift_rate_hz_per_s(freqs, ts)
    assert abs(drift["hz_per_min"] - 10.0) < 1e-9


def test_fft_dominant_frequency_sinusoid():
    sr = 1000.0
    f0 = 50.0
    t = np.arange(0, 1.0, 1 / sr)
    samples = np.sin(2 * np.pi * f0 * t).tolist()
    peaks = dominant_frequencies(samples, sr, top_k=1)
    assert abs(peaks["peaks"][0]["frequency_hz"] - f0) < 1.0


def test_rf_conversions():
    gamma = reflection_from_powers(100.0, 25.0)["reflection_coefficient"]
    assert abs(gamma - 0.5) < 1e-12
    rl = return_loss_db(gamma)["return_loss_db"]
    assert abs(rl - 6.020599913) < 1e-6
    vswr = vswr_from_gamma(gamma)["vswr"]
    assert abs(vswr - 3.0) < 1e-12


def test_motion_magnitude():
    assert abs(motion_magnitude([3.0, 4.0])["magnitude_mm"] - 5.0) < 1e-12


def test_malformed_arrays_rejected():
    with pytest.raises(ValueError):
        linear_slope([1.0, math.nan])
    with pytest.raises(ValueError):
        dominant_frequencies([1.0, 2.0], 100.0)  # too short
