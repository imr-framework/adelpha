"""Root DTAM orchestrator agent (Google ADK entry)."""

from __future__ import annotations

from google.adk.agents import Agent

from dtam.agents.core.adk_tools import (
    assess_digital_twin,
    assess_from_twin_scanner,
    plot_twin_forecast_for_chat,
)
from dtam.agents.core.config import get_settings
from dtam.agents.core.observability import after_agent_callback, before_agent_callback
from dtam.agents.emi_agent.agent import emi_agent
from dtam.agents.gradient.agent import gradient_agent
from dtam.agents.instruction import prompt
from dtam.agents.magnet_agent.agent import magnet_agent
from dtam.agents.motion_tracking.agent import motion_agent
from dtam.agents.rf_agent.agent import rf_agent
from dtam.agents.rf_tuning.agent import b1_agent
from dtam.agents.safety_agent.agent import safety_agent
from dtam.agents.thermal_agent.agent import thermal_agent
from dtam.skills import skill_toolset_for_agent

_ROOT_INSTRUCTION = (
    prompt + "\n\nDTAM integration:\n"
    "- Prefer assess_from_twin_scanner for live simulated/adapter twin snapshots.\n"
    "- Prefer assess_digital_twin when the user supplies observation JSON.\n"
    "- Use estimate_twin_state / PINN tools via orchestrator skills for physics truth.\n"
    "- For forecast / prediction / \"what will happen\" questions, call "
    "plot_twin_forecast_for_chat, explain the thermal and f0 curves, and clearly "
    "label predicted vs measured/estimated. Do not paste plot_png_base64 into text.\n"
    "- Delegate to specialists for domain depth (thermal, magnet, EMI, RF, B1, "
    "gradient, motion, safety).\n"
    "- Closed-loop hardware control remains off by default; safety policy is final."
)

root_agent = Agent(
    name="dtam_supervisor",
    model=get_settings().model,
    description=(
        "DTAM orchestrator: twin state estimation, multi-agent assessment, "
        "specialist coordination, and deterministic safety gating."
    ),
    instruction=_ROOT_INSTRUCTION,
    tools=[
        skill_toolset_for_agent("orchestrator"),
        assess_digital_twin,
        assess_from_twin_scanner,
        plot_twin_forecast_for_chat,
    ],
    sub_agents=[
        thermal_agent,
        magnet_agent,
        emi_agent,
        rf_agent,
        b1_agent,
        gradient_agent,
        motion_agent,
        safety_agent,
    ],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

# ADK / package aliases.
orchestrator_agent = root_agent
