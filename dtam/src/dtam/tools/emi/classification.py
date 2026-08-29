"""EMI noise classification tools."""

from __future__ import annotations

from typing import Any

from dtam.tools.base import ok_result


def classify_emi_noise(
    peak_frequency_hz: float,
    rms: float,
    narrowband_threshold_hz: float = 1_000.0,
) -> dict[str, Any]:
    """Heuristic EMI classification used until a trained model is available."""
    label = "broadband"
    mitigation = [
        "Check shielding integrity",
        "Inspect nearby switching electronics",
        "Consider adaptive noise cancellation if persistent",
    ]
    if peak_frequency_hz > narrowband_threshold_hz and rms > 0.005:
        label = "narrowband"
        mitigation = [
            "Identify candidate continuous-wave interferer near peak frequency",
            "Recommend environmental intervention or notch filtering",
            "Correlate with image ghosting / striping artifacts",
        ]
    elif rms < 0.002:
        label = "nominal"
        mitigation = ["No EMI mitigation required"]
    return ok_result(
        "classify_emi_noise",
        label=label,
        peak_frequency_hz=peak_frequency_hz,
        rms=rms,
        mitigation_strategies=mitigation,
    )
