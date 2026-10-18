"""EMI mitigation recommendation tools."""

from __future__ import annotations

from typing import Any

from dtam.tools.base import ok_result
from dtam.tools.paths import artifacts_root


def propose_emi_mitigation(label: str) -> dict[str, Any]:
    """Return EMI mitigation recommendations for a classified interference label."""
    catalog = {
        "narrowband": [
            "Locate and power-cycle candidate CW sources",
            "Apply spectral notch if acquisition timing cannot change",
            "Flag affected measurements as SUSPECT",
        ],
        "broadband": [
            "Improve grounding/shielding",
            "Increase averaging if SNR critical",
            "Delay acquisition until environment stabilizes",
        ],
        "nominal": ["Continue monitoring"],
    }
    strategies = catalog.get(label.lower(), catalog["broadband"])
    out = artifacts_root() / "emi"
    out.mkdir(parents=True, exist_ok=True)
    return ok_result(
        "propose_emi_mitigation",
        label=label,
        mitigation_strategies=strategies,
    )
