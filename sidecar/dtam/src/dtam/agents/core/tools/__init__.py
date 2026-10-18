"""Deterministic numerical tools for specialist agents."""

from .confidence import adjust_confidence, confidence_level_from_score
from .emi import band_power, dominant_frequencies, peak_to_peak, rms
from .magnet import drift_rate_hz_per_s, field_to_frequency_hz, frequency_to_field_t
from .motion import motion_magnitude, threshold_compare
from .rf import reflection_from_powers, return_loss_db, vswr_from_gamma
from .stats import linear_slope, robust_mean_median, temperature_rate_of_change
from .thermal import detect_outliers_mad, predict_linear_temperature

__all__ = [
    "adjust_confidence",
    "band_power",
    "confidence_level_from_score",
    "detect_outliers_mad",
    "dominant_frequencies",
    "drift_rate_hz_per_s",
    "field_to_frequency_hz",
    "frequency_to_field_t",
    "linear_slope",
    "motion_magnitude",
    "peak_to_peak",
    "predict_linear_temperature",
    "reflection_from_powers",
    "return_loss_db",
    "rms",
    "robust_mean_median",
    "temperature_rate_of_change",
    "threshold_compare",
    "vswr_from_gamma",
]
