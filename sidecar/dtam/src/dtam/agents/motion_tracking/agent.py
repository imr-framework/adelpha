"""Motion-tracking ADK agent wrapper."""

from __future__ import annotations

from google.adk.agents import Agent

from ..core.adk_tools import run_motion_analysis
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

motion_agent = Agent(
    name="motion_tracking",
    model=get_settings().model,
    description="Analyzes phantom/research motion measurements for the MRI digital twin.",
    instruction=prompt,
    tools=[run_motion_analysis],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = motion_agent
