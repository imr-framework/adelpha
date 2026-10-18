"""Conditional specialist activation routing."""

from __future__ import annotations

from dataclasses import dataclass

from .enums import AgentName
from .models import DigitalTwinObservation


@dataclass(frozen=True)
class ActivationDecision:
    agent: AgentName
    reason: str


@dataclass(frozen=True)
class RoutingPlan:
    activate: list[ActivationDecision]
    skipped: dict[str, str]


def plan_activations(observation: DigitalTwinObservation) -> RoutingPlan:
    """Decide which specialists to run based on available domains / requests."""
    activate: list[ActivationDecision] = []
    skipped: dict[str, str] = {}
    requested = set(observation.requested_agents)

    def maybe(agent: AgentName, present: bool, reason: str, absent_reason: str) -> None:
        if present or agent in requested:
            activate.append(
                ActivationDecision(
                    agent=agent,
                    reason=reason
                    if present
                    else f"explicitly requested ({agent.value})",
                )
            )
        else:
            skipped[agent.value] = absent_reason

    thermal_present = observation.thermal is not None and (
        bool(observation.thermal.sensors)
        or bool(observation.thermal.history_c)
        or observation.thermal.ambient_c is not None
        or observation.thermal.magnet_temperature_c is not None
    )
    magnet_present = observation.magnet is not None and (
        observation.magnet.center_frequency_hz is not None
        or observation.magnet.estimated_b0_drift_hz is not None
        or bool(observation.magnet.frequency_history_hz)
    )
    emi_present = observation.emi is not None and (
        observation.emi.rms is not None
        or observation.emi.peak_to_peak is not None
        or bool(observation.emi.samples)
        or bool(observation.emi.dominant_frequencies_hz)
        or bool(observation.emi.spectral_peaks_hz)
    )
    rf_present = observation.rf is not None and (
        observation.rf.forward_power_w is not None
        or observation.rf.reflected_power_w is not None
        or observation.rf.return_loss_db is not None
        or observation.rf.reflection_coefficient is not None
        or observation.rf.b1_ut is not None
        or observation.rf.coil_state is not None
    )
    motion_present = observation.motion is not None and (
        observation.motion.translation_mm is not None
        or bool(observation.motion.displacement_history_mm)
        or observation.motion.rotation_deg is not None
        or observation.motion.tracking_quality is not None
        or observation.motion.tracking_lost
    )

    maybe(
        AgentName.THERMAL,
        thermal_present,
        "temperature data present",
        "no temperature data",
    )
    maybe(
        AgentName.MAGNET,
        magnet_present,
        "center-frequency or B0 data present",
        "no magnet/B0 data",
    )
    maybe(AgentName.EMI, emi_present, "EMI data present", "no EMI data")
    maybe(AgentName.RF, rf_present, "RF data present", "no RF data")
    maybe(AgentName.MOTION, motion_present, "motion data present", "no motion data")

    return RoutingPlan(activate=activate, skipped=skipped)


def independent_agents(plan: RoutingPlan) -> list[ActivationDecision]:
    """Agents safe to run concurrently (all specialists are independent at analysis time)."""
    return list(plan.activate)
