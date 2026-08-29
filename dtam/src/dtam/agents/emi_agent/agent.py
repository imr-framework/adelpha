"""EMI ADK agent wrapper (assessment tools + DTAM EMI skills)."""

from __future__ import annotations

from google.adk.agents import Agent

from dtam.skills import skill_toolset_for_agent

from ..core.adk_tools import run_emi_analysis
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

emi_agent = Agent(
    name="emi_agent",
    model=get_settings().model,
    description=(
        "EMI specialist: observation FFT/RMS analysis plus DTAM EMI classify/mitigate skills."
    ),
    instruction=(
        prompt + "\nAlso load DTAM EMI skills (noise classification, mitigation). "
        "Use adapter EMI tools and run_emi_analysis. "
        "Do not claim hardware changes were executed."
    ),
    tools=[skill_toolset_for_agent("emi"), run_emi_analysis],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = emi_agent
