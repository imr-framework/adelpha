"""Virtual thermal plant used by simulation scenarios."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ThermalPlantState:
    """Internal temperatures for a simple multi-channel thermal plant (°C)."""

    temperatures_c: dict[str, float] = field(default_factory=dict)
    room_channel_id: str = "temp_room_01"
    ambient_c: float = 22.0


class ThermalPlantModel:
    """
    Minimal lumped thermal model for simulation-first development.

    Magnet channels drift toward a setpoint with first-order dynamics; the room
    channel slowly reverts to ambient.
    """

    def __init__(
        self,
        initial: dict[str, float],
        *,
        ambient_c: float = 22.0,
        room_channel_id: str = "temp_room_01",
        tau_s: float = 60.0,
    ) -> None:
        self.state = ThermalPlantState(
            temperatures_c=dict(initial),
            room_channel_id=room_channel_id,
            ambient_c=ambient_c,
        )
        self.tau_s = max(tau_s, 1e-6)
        self._setpoints = dict(initial)

    def set_setpoint(self, channel_id: str, temperature_c: float) -> None:
        if channel_id not in self.state.temperatures_c:
            raise KeyError(channel_id)
        self._setpoints[channel_id] = temperature_c

    def apply_uniform_magnet_drift(
        self,
        delta_c: float,
        *,
        magnet_prefix: str = "temp_magnet",
    ) -> None:
        for channel_id, value in list(self._setpoints.items()):
            if channel_id.startswith(magnet_prefix):
                self._setpoints[channel_id] = value + delta_c

    def step(self, dt_s: float) -> dict[str, float]:
        alpha = min(1.0, max(0.0, dt_s / self.tau_s))
        updated: dict[str, float] = {}
        for channel_id, current in self.state.temperatures_c.items():
            target = self._setpoints.get(channel_id, current)
            if channel_id == self.state.room_channel_id:
                target = (
                    0.8 * target + 0.2 * self.state.ambient_c
                )
            new_value = current + alpha * (target - current)
            updated[channel_id] = new_value
        self.state.temperatures_c = updated
        return dict(updated)
