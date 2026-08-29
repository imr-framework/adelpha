"""Temperature value object with explicit units."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, model_validator

from dtam.domain.exceptions import InvalidUnitError


class TemperatureUnit(str, Enum):
    CELSIUS = "degC"
    KELVIN = "K"
    FAHRENHEIT = "degF"


class Temperature(BaseModel):
    """A temperature quantity with an explicit unit."""

    value: float
    unit: TemperatureUnit = TemperatureUnit.CELSIUS

    model_config = {"frozen": True}

    @model_validator(mode="after")
    def _reject_below_absolute_zero(self) -> Temperature:
        if self.to_kelvin() < 0.0:
            raise InvalidUnitError(
                "Temperature is below absolute zero.",
                context={"value": self.value, "unit": self.unit.value},
            )
        return self

    def to_celsius(self) -> float:
        if self.unit is TemperatureUnit.CELSIUS:
            return self.value
        if self.unit is TemperatureUnit.KELVIN:
            return self.value - 273.15
        if self.unit is TemperatureUnit.FAHRENHEIT:
            return (self.value - 32.0) * 5.0 / 9.0
        raise InvalidUnitError(f"Unsupported temperature unit: {self.unit}")

    def to_kelvin(self) -> float:
        return self.to_celsius() + 273.15

    def as_celsius(self) -> Temperature:
        return Temperature(value=self.to_celsius(), unit=TemperatureUnit.CELSIUS)
