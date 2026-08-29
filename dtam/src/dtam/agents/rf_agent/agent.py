"""RF match ADK agent wrapper (assessment tools; B1 skills live on b1_agent)."""

from __future__ import annotations

from google.adk.agents import Agent

from ..core.adk_tools import run_rf_analysis
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

rf_agent = Agent(
    name="rf_agent",
    model=get_settings().model,
    description=(
        "RF matching specialist: γ / return loss / VSWR analysis from observations. "
        "Coil/B1 map skills are on b1_agent."
    ),
    instruction=(
        prompt + "\nFor coil sensors and B1 maps, transfer to b1_agent. "
        "Do not tune hardware relays or transmit gain."
    ),
    tools=[run_rf_analysis],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = rf_agent
