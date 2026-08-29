"""Lumped thermal-flow simulation tools."""

from __future__ import annotations

from typing import Any

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import error_result, ok_result


def simulate_thermal_flow(
    magnet_temp_c: float,
    room_temp_c: float,
    steps: int = 10,
    coupling: float = 0.05,
) -> dict[str, Any]:
    """Simple lumped thermal mixing model for advisory forecasts."""
    if steps < 1:
        return error_result(
            "simulate_thermal_flow",
            "steps must be >= 1",
            error_code="INVALID_ARGUMENTS",
        )
    magnet = float(magnet_temp_c)
    room = float(room_temp_c)
    trajectory: list[dict[str, float]] = []
    for i in range(steps):
        magnet = magnet + coupling * (room - magnet)
        room = room + 0.1 * coupling * (22.0 - room)
        trajectory.append(
            {"step": float(i + 1), "magnet_c": magnet, "room_c": room}
        )
    WORKING_STATE.set("thermal.last_simulation", trajectory)
    return ok_result(
        "simulate_thermal_flow",
        steps=steps,
        coupling=coupling,
        final_magnet_c=magnet,
        final_room_c=room,
        trajectory=trajectory,
        delta_magnet_c=magnet - magnet_temp_c,
    )
