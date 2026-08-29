"""Shared helpers for wiring DT skills + tools into ADK agents."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from google.adk.agents import LlmAgent

from dtam.skills import skill_toolset_for_agent

DEFAULT_MODEL = "gemini-2.5-flash"


def build_specialist_agent(
    *,
    name: str,
    description: str,
    instruction: str,
    skill_group: str,
    model: str = DEFAULT_MODEL,
    extra_tools: Sequence[Any] | None = None,
) -> LlmAgent:
    """Build a specialist with diagram skills/tools, plus optional assessment tools."""
    tools: list[Any] = [skill_toolset_for_agent(skill_group)]
    if extra_tools:
        tools.extend(extra_tools)
    return LlmAgent(
        name=name,
        model=model,
        description=description,
        instruction=instruction,
        tools=tools,
    )
