"""Synthetic thermal trajectories from ThermalPlantModel for PINN training."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from dtam.simulation.thermal.model import ThermalPlantModel


@dataclass(frozen=True)
class ThermalRolloutBatch:
    """Flat arrays of shape ``(N,)`` for PINN supervision."""

    t_s: NDArray[np.float64]
    t0_c: NDArray[np.float64]
    t_star_c: NDArray[np.float64]
    tau_s: NDArray[np.float64]
    t_obs_c: NDArray[np.float64]


def analytic_first_order(
    t_s: NDArray[np.float64],
    t0_c: float,
    t_star_c: float,
    tau_s: float,
) -> NDArray[np.float64]:
    """Closed-form solution of dT/dt = (T* - T)/tau."""
    return t_star_c + (t0_c - t_star_c) * np.exp(-t_s / max(tau_s, 1e-6))


def generate_plant_rollouts(
    *,
    n_rollouts: int = 64,
    n_steps: int = 40,
    dt_s: float = 2.0,
    tau_range_s: tuple[float, float] = (30.0, 120.0),
    t0_range_c: tuple[float, float] = (20.0, 28.0),
    delta_setpoint_range_c: tuple[float, float] = (-2.0, 6.0),
    seed: int = 0,
) -> ThermalRolloutBatch:
    """Roll the lumped plant and flatten (rollout, time) into feature rows."""
    rng = np.random.default_rng(seed)
    t_list: list[float] = []
    t0_list: list[float] = []
    t_star_list: list[float] = []
    tau_list: list[float] = []
    obs_list: list[float] = []

    channel = "temp_magnet_01"
    for _ in range(n_rollouts):
        t0 = float(rng.uniform(*t0_range_c))
        delta = float(rng.uniform(*delta_setpoint_range_c))
        t_star = t0 + delta
        tau = float(rng.uniform(*tau_range_s))
        # Magnet-only plant: room id unused so setpoint is pure first-order.
        plant = ThermalPlantModel(
            {channel: t0},
            ambient_c=22.0,
            room_channel_id="__none__",
            tau_s=tau,
        )
        plant.set_setpoint(channel, t_star)

        t_elapsed = 0.0
        temps = dict(plant.state.temperatures_c)
        for _step in range(n_steps):
            t_list.append(t_elapsed)
            t0_list.append(t0)
            t_star_list.append(t_star)
            tau_list.append(tau)
            obs_list.append(float(temps[channel]))
            temps = plant.step(dt_s)
            t_elapsed += dt_s

    return ThermalRolloutBatch(
        t_s=np.asarray(t_list, dtype=np.float64),
        t0_c=np.asarray(t0_list, dtype=np.float64),
        t_star_c=np.asarray(t_star_list, dtype=np.float64),
        tau_s=np.asarray(tau_list, dtype=np.float64),
        t_obs_c=np.asarray(obs_list, dtype=np.float64),
    )


def sample_collocation(
    batch: ThermalRolloutBatch,
    *,
    n_points: int,
    seed: int = 1,
) -> tuple[
    NDArray[np.float64],
    NDArray[np.float64],
    NDArray[np.float64],
    NDArray[np.float64],
]:
    """Uniform-in-time collocation drawn from rollout parameter ranges."""
    rng = np.random.default_rng(seed)
    t_max = float(batch.t_s.max()) if batch.t_s.size else 80.0
    idx = rng.integers(0, len(batch.t0_c), size=n_points)
    t_s = rng.uniform(0.0, t_max, size=n_points)
    return (
        t_s.astype(np.float64),
        batch.t0_c[idx],
        batch.t_star_c[idx],
        batch.tau_s[idx],
    )
