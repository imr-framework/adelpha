"""Request / response models for the twin HTTP API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    """POST /twin/forecast body; horizon defaults to 60 s."""

    predict_horizon_s: float = Field(default=60.0, gt=0.0)
    magnet_heating_rate_c_per_s: float = 0.0
    magnet_setpoint_c: float | None = None
    alpha_t_tesla_per_c: float = -5.0e-5
    use_thermal_pinn: bool = True


class HealthResponse(BaseModel):
    status: str
    scanner_id: str
    mode: str
    connected: bool


class AssessFromTwinRequest(BaseModel):
    """POST /assess/from-twin options."""

    mode: str = Field(
        default="observe",
        description="observe | recommend (act requires simulation flag)",
    )
    predict_horizon_s: float = Field(default=0.0, ge=0.0)
    magnet_heating_rate_c_per_s: float = 0.0
    magnet_setpoint_c: float | None = None
    alpha_t_tesla_per_c: float = -5.0e-5
    use_thermal_pinn: bool = True
