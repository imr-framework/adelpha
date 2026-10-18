"""Load ADK skills for DTAM agents."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

from google.adk.skills import Skill, list_skills_in_dir, load_skill_from_dir
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset
from google.adk.tools.skill_toolset import SkillToolset

from dtam.tools.paths import skills_root
from dtam.tools.registry import tools_for_agent

ToolUnion = Callable[..., Any] | BaseTool | BaseToolset

# Diagram skill names owned by each agent role.
AGENT_SKILL_NAMES: dict[str, list[str]] = {
    "orchestrator": [
        "task-decomposition",
        "state-management",
        "knowledge-retrieval",
    ],
    "magnet": [
        "magnet-design",
        "fem-simulation",
        "b0-map-generation",
    ],
    "emi": [
        "noise-classification",
        "emi-mitigation-strategies",
    ],
    "thermal": [
        "temp-measurement",
        "thermal-flow-analysis",
        "knowledge-retrieval",
    ],
    "b1": [
        "coil-sensor-measurement",
        "b1-map-interpretation",
    ],
    "gradient": [
        "gradient-sensors-measurement",
        "eddy-currents-interpretation",
    ],
}


def load_all_skills(root: Path | None = None) -> list[Skill]:
    base = root or skills_root()
    skills: list[Skill] = []
    for path in list_skills_in_dir(base):
        skills.append(load_skill_from_dir(path))
    return skills


def load_skills_for_agent(agent_key: str, root: Path | None = None) -> list[Skill]:
    names = AGENT_SKILL_NAMES.get(agent_key)
    if names is None:
        raise KeyError(f"Unknown agent skill group '{agent_key}'")
    base = root or skills_root()
    skills: list[Skill] = []
    for name in names:
        skill_dir = base / name
        if not skill_dir.is_dir():
            raise FileNotFoundError(f"Missing skill directory: {skill_dir}")
        skills.append(load_skill_from_dir(skill_dir))
    return skills


def skill_toolset_for_agent(agent_key: str) -> SkillToolset:
    """Build an ADK SkillToolset with diagram skills + matching DT tools."""
    # list is invariant; FunctionTool is a BaseTool but mypy needs an explicit widen.
    additional = cast(list[ToolUnion], tools_for_agent(agent_key))
    return SkillToolset(
        skills=load_skills_for_agent(agent_key),
        additional_tools=additional,
    )
