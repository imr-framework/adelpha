"""Resonant frequency model f0 = (γ/2π) · B0."""

from __future__ import annotations

from dtam.domain.value_objects.field_strength import FieldStrength
from dtam.domain.value_objects.frequency import (
    PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T,
    Frequency,
)


class ResonantFrequencyModel:
    """Maps static field strength to NMR resonant frequency."""

    def __init__(
        self,
        *,
        gamma_over_two_pi: float = PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T,
        model_version: str = "resonant_frequency-v1",
    ) -> None:
        self.gamma_over_two_pi = gamma_over_two_pi
        self.model_version = model_version

    def frequency_hz(self, b0_t: float) -> float:
        return self.gamma_over_two_pi * b0_t

    def frequency_mhz(self, b0_t: float) -> float:
        return self.frequency_hz(b0_t) / 1e6

    def frequency(self, field: FieldStrength) -> Frequency:
        return Frequency.from_field_strength(
            field,
            gamma_over_two_pi=self.gamma_over_two_pi,
        )
