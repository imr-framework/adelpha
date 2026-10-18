"""Composite twin state for thermal, magnetic, EMI, and RF noise."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from dtam.digital_twin.state.emi_state import EmiState
from dtam.digital_twin.state.magnetic_state import MagneticState
from dtam.digital_twin.state.rf_state import RfState
from dtam.digital_twin.state.thermal_state import ThermalState
from dtam.domain.modes import OperationalMode


class SystemState(BaseModel):
    """Versioned twin snapshot across thermal / EMI / RF / magnetic subsystems."""

    timestamp: datetime
    scanner_id: str
    mode: OperationalMode = OperationalMode.SIMULATION
    thermal: ThermalState | None = None
    magnetic: MagneticState | None = None
    emi: EmiState | None = None
    rf: RfState | None = None
    correlation_id: str | None = None
    twin_version: str = "phase2b-thermal-emi-rf-v1"
    notes: list[str] = Field(default_factory=list)

    model_config = {"frozen": True}
