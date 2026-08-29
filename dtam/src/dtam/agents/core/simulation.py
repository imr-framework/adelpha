"""Simulation / stub interface for future act-mode feedback.

No real scanner hardware control is implemented or reachable here.
"""

from __future__ import annotations

from typing import Any

from .enums import ActionType
from .models import ProposedAction


class SimulationStub:
    """Explicit stub for applying approved recommendations in simulation only."""

    def apply(self, action: ProposedAction) -> dict[str, Any]:
        if action.action_type in {
            ActionType.APPLY_FREQUENCY_CORRECTION,
            ActionType.TUNE_RF_HARDWARE,
            ActionType.EXECUTE_SCANNER_CONTROL,
        }:
            return {
                "applied": False,
                "reason": "hardware_control_forbidden",
                "action_type": action.action_type.value,
            }
        if not action.simulation_only:
            return {
                "applied": False,
                "reason": "non_simulation_actions_rejected",
                "action_type": action.action_type.value,
            }
        return {
            "applied": True,
            "mode": "simulation",
            "action_type": action.action_type.value,
            "parameters": action.parameters,
            "note": "Research stub only; no scanner interface invoked",
        }
