"""Magnetic field strength value object."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

from dtam.domain.exceptions import InvalidUnitError


class FieldStrengthUnit(str, Enum):
    TESLA = "T"
    MILLITESLA = "mT"
    MICROTESLA = "uT"


class FieldStrength(BaseModel):
    """Static or estimated magnetic field magnitude."""

    value: float
    unit: FieldStrengthUnit = FieldStrengthUnit.TESLA

    model_config = {"frozen": True}

    def to_tesla(self) -> float:
        if self.unit is FieldStrengthUnit.TESLA:
            return self.value
        if self.unit is FieldStrengthUnit.MILLITESLA:
            return self.value * 1e-3
        if self.unit is FieldStrengthUnit.MICROTESLA:
            return self.value * 1e-6
        raise InvalidUnitError(f"Unsupported field strength unit: {self.unit}")

    def to_millitesla(self) -> float:
        return self.to_tesla() * 1e3

    def as_tesla(self) -> FieldStrength:
        return FieldStrength(value=self.to_tesla(), unit=FieldStrengthUnit.TESLA)
