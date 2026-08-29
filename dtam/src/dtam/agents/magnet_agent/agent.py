"""Magnet ADK agent wrapper (assessment tools + DTAM magnet skills)."""

from __future__ import annotations

from google.adk.agents import Agent

from dtam.skills import skill_toolset_for_agent

from ..core.adk_tools import run_magnet_analysis
from ..core.config import get_settings
from ..core.observability import after_agent_callback, before_agent_callback
from .instruction import prompt

magnet_agent = Agent(
    name="magnet_agent",
    model=get_settings().model,
    description=(
        "Magnet / B0 specialist: frequency drift analysis plus Halbach/FEM/B0 map skills."
    ),
    instruction=(
        prompt + "\nAlso use DTAM magnet skills (designer, FEM prep, B0 maps) and "
        "estimate_twin_state for thermal→B0 snapshots. "
        "Do not apply shim or frequency corrections to hardware."
    ),
    tools=[skill_toolset_for_agent("magnet"), run_magnet_analysis],
    before_agent_callback=before_agent_callback,
    after_agent_callback=after_agent_callback,
)

agent = magnet_agent

# Compatibility alias used by older docs/tests.
magnetic_field_agent = magnet_agent
