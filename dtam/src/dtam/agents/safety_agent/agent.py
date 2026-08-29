"""Safety ADK agent wrapper around deterministic policy."""

from __future__ import annotations

from google.adk.agents import Agent

from ..core.adk_tools import run_safety_validation
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

safety_agent = Agent(
    name="safety_agent",
    model=get_settings().model,
    description="Explains deterministic safety validation outcomes for proposed actions.",
    instruction=prompt,
    tools=[run_safety_validation],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = safety_agent
