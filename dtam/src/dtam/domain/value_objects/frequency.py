"""Frequency value object."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

from dtam.domain.exceptions import InvalidUnitError
from dtam.domain.value_objects.field_strength import FieldStrength

# Proton gyromagnetic ratio / 2π (Hz/T). Kept explicit for later B0→f0 models.
PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T = 42_577_478.92


class FrequencyUnit(str, Enum):
    HERTZ = "Hz"
    KILOHERTZ = "kHz"
    MEGAHERTZ = "MHz"


class Frequency(BaseModel):
    """An RF or NMR frequency with an explicit unit."""

    value: float
    unit: FrequencyUnit = FrequencyUnit.HERTZ

    model_config = {"frozen": True}

    def to_hertz(self) -> float:
        if self.unit is FrequencyUnit.HERTZ:
            return self.value
        if self.unit is FrequencyUnit.KILOHERTZ:
            return self.value * 1e3
        if self.unit is FrequencyUnit.MEGAHERTZ:
            return self.value * 1e6
        raise InvalidUnitError(f"Unsupported frequency unit: {self.unit}")

    def as_hertz(self) -> Frequency:
        return Frequency(value=self.to_hertz(), unit=FrequencyUnit.HERTZ)

    @classmethod
    def from_field_strength(
        cls,
        field: FieldStrength,
        *,
        gamma_over_two_pi: float = PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T,
    ) -> Frequency:
        """Compute resonant frequency f0 = (γ/2π) · B0 for protons by default."""
        return cls(
            value=gamma_over_two_pi * field.to_tesla(),
            unit=FrequencyUnit.HERTZ,
        )
