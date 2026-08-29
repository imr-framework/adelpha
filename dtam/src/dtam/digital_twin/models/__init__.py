"""Physics-informed models used by the digital twin."""

from dtam.digital_twin.models.magnetic_field import ResonantFrequencyModel
from dtam.digital_twin.models.thermal import ThermalToB0Model, ThermalToB0Params

__all__ = [
    "ResonantFrequencyModel",
    "ThermalToB0Model",
    "ThermalToB0Params",
]
