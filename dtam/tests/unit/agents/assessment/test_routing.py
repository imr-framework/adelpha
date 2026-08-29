"""Routing tests."""

from __future__ import annotations

from dtam.agents.core.enums import AgentName, OperatingMode
from dtam.agents.core.models import (
    DigitalTwinObservation,
    EMIObservation,
    MagnetObservation,
    MotionObservation,
    RFObservation,
    ThermalObservation,
)
from dtam.agents.core.routing import plan_activations


def test_thermal_only_activates_thermal():
    plan = plan_activations(
        DigitalTwinObservation(
            operating_mode=OperatingMode.OBSERVE,
            thermal=ThermalObservation(ambient_c=22.0),
        )
    )
    names = {d.agent for d in plan.activate}
    assert AgentName.THERMAL in names
    assert AgentName.EMI not in names
    assert "emi_agent" in plan.skipped


def test_multi_domain_activation():
    plan = plan_activations(
        DigitalTwinObservation(
            operating_mode=OperatingMode.RECOMMEND,
            thermal=ThermalObservation(ambient_c=22.0),
            magnet=MagnetObservation(center_frequency_hz=1e8),
            emi=EMIObservation(rms=0.1),
            rf=RFObservation(forward_power_w=10.0, reflected_power_w=1.0),
            motion=MotionObservation(translation_mm=[1.0, 0.0, 0.0]),
        )
    )
    assert len(plan.activate) == 5


def test_empty_observation_skips_all():
    plan = plan_activations(
        DigitalTwinObservation(operating_mode=OperatingMode.OBSERVE)
    )
    assert plan.activate == []
    assert len(plan.skipped) == 5


def test_explicit_request_overrides_absence():
    plan = plan_activations(
        DigitalTwinObservation(
            operating_mode=OperatingMode.OBSERVE,
            requested_agents=[AgentName.EMI],
        )
    )
    assert any(d.agent == AgentName.EMI for d in plan.activate)
