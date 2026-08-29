"""Thermal ADK agent wrapper (assessment tools + DTAM thermal skills)."""

from __future__ import annotations

from google.adk.agents import Agent

from dtam.skills import skill_toolset_for_agent

from ..core.adk_tools import run_thermal_analysis
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

thermal_agent = Agent(
    name="thermal_agent",
    model=get_settings().model,
    description=(
        "Thermal specialist: twin observation analysis, temperature channels, "
        "thermal flow skills, and knowledge retrieval."
    ),
    instruction=(
        prompt + "\nAlso load DTAM thermal skills/tools for adapter reads, "
        "gradient analysis, and short advisory simulations. "
        "Prefer estimate_twin_state / run_thermal_analysis over speculation. "
        "Do not actuate cooling hardware."
    ),
    tools=[skill_toolset_for_agent("thermal"), run_thermal_analysis],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = thermal_agent
