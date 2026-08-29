"""Thermal-to-B0 drift model.

ΔB₀(t) = α_T · ΔT(t) + ε

where ΔT is the magnet temperature deviation from a reference.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ThermalToB0Params(BaseModel):
    """Configurable coefficients for the thermal→B0 coupling model."""

    alpha_t_tesla_per_c: float = Field(
        default=-5.0e-5,
        description=(
            "Field change per °C of magnet temperature rise. "
            "Negative for typical NdFeB remanence temperature coefficients."
        ),
    )
    reference_temperature_c: float = 23.0
    model_version: str = "thermal_to_b0-v1"
    validity_min_c: float = 5.0
    validity_max_c: float = 40.0
    process_noise_std_t: float = Field(default=1.0e-6, ge=0.0)


class ThermalToB0Model:
    """Deterministic physics mapping from temperature deviation to ΔB₀."""

    def __init__(self, params: ThermalToB0Params | None = None) -> None:
        self.params = params or ThermalToB0Params()

    @property
    def version(self) -> str:
        return self.params.model_version

    def delta_b0_tesla(self, delta_temperature_c: float) -> float:
        return self.params.alpha_t_tesla_per_c * delta_temperature_c

    def b0_tesla(self, nominal_b0_t: float, delta_temperature_c: float) -> float:
        return nominal_b0_t + self.delta_b0_tesla(delta_temperature_c)

    def in_validity_range(self, temperature_c: float) -> bool:
        return (
            self.params.validity_min_c
            <= temperature_c
            <= self.params.validity_max_c
        )
