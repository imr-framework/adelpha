"""Smoke-import the DTAM specialist agents."""

from dtam.agents import (
    b1_agent,
    emi_agent,
    gradient_agent,
    magnet_agent,
    motion_agent,
    orchestrator_agent,
    rf_agent,
    root_agent,
    safety_agent,
    thermal_agent,
)


def test_specialist_agents_construct() -> None:
    assert root_agent.name == "dtam_supervisor"
    assert orchestrator_agent is root_agent
    assert magnet_agent.name == "magnet_agent"
    assert emi_agent.name == "emi_agent"
    assert thermal_agent.name == "thermal_agent"
    assert rf_agent.name == "rf_agent"
    assert b1_agent.name == "b1_agent"
    assert gradient_agent.name == "gradient_agent"
    assert motion_agent.name == "motion_tracking"
    assert safety_agent.name == "safety_agent"
    names = {a.name for a in root_agent.sub_agents}
    assert names == {
        "thermal_agent",
        "magnet_agent",
        "emi_agent",
        "rf_agent",
        "b1_agent",
        "gradient_agent",
        "motion_tracking",
        "safety_agent",
    }
