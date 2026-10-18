"""Shared helpers for wiring DT skills + tools into ADK agents."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from google.adk.agents import LlmAgent

from dtam.agents.core.config import get_settings
from dtam.skills import skill_toolset_for_agent


def build_specialist_agent(
    *,
    name: str,
    description: str,
    instruction: str,
    skill_group: str,
    model: str | None = None,
    extra_tools: Sequence[Any] | None = None,
) -> LlmAgent:
    """Build a specialist with diagram skills/tools, plus optional assessment tools."""
    tools: list[Any] = [skill_toolset_for_agent(skill_group)]
    if extra_tools:
        tools.extend(extra_tools)
    return LlmAgent(
        name=name,
        model=model or get_settings().model,
        description=description,
        instruction=instruction,
        tools=tools,
    )
