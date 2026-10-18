"""Tool registration and ADK FunctionTool helpers."""

from __future__ import annotations

from collections.abc import Sequence

from google.adk.tools.function_tool import FunctionTool

from dtam.tools.b1 import B1_TOOLS
from dtam.tools.base import ToolFn
from dtam.tools.emi import EMI_TOOLS
from dtam.tools.gradient import GRADIENT_TOOLS
from dtam.tools.magnet import MAGNET_TOOLS
from dtam.tools.orchestrator import ORCHESTRATOR_TOOLS
from dtam.tools.state_estimation import STATE_ESTIMATION_TOOLS
from dtam.tools.thermal import THERMAL_TOOLS

AGENT_TOOL_GROUPS: dict[str, list[ToolFn]] = {
    "orchestrator": [*ORCHESTRATOR_TOOLS, *STATE_ESTIMATION_TOOLS],
    "magnet": [*MAGNET_TOOLS, *STATE_ESTIMATION_TOOLS],
    "emi": [*EMI_TOOLS, *STATE_ESTIMATION_TOOLS],
    "thermal": [*THERMAL_TOOLS, *STATE_ESTIMATION_TOOLS],
    "b1": [*B1_TOOLS, *STATE_ESTIMATION_TOOLS],
    "gradient": list(GRADIENT_TOOLS),
}


def as_function_tools(fns: Sequence[ToolFn]) -> list[FunctionTool]:
    return [FunctionTool(fn) for fn in fns]


def tools_for_agent(agent_key: str) -> list[FunctionTool]:
    group = AGENT_TOOL_GROUPS.get(agent_key)
    if group is None:
        raise KeyError(
            f"Unknown agent tool group '{agent_key}'. "
            f"Known: {sorted(AGENT_TOOL_GROUPS)}"
        )
    return as_function_tools(group)


def all_tool_functions() -> list[ToolFn]:
    seen: set[int] = set()
    out: list[ToolFn] = []
    for group in AGENT_TOOL_GROUPS.values():
        for fn in group:
            identity = id(fn)
            if identity in seen:
                continue
            seen.add(identity)
            out.append(fn)
    return out
