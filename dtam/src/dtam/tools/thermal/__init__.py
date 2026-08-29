"""Thermal tools — public exports only."""

from dtam.tools.base import ToolFn
from dtam.tools.thermal.analysis import analyze_thermal_gradient
from dtam.tools.thermal.knowledge import search_thermal_knowledge
from dtam.tools.thermal.sensors import read_temperature_channels
from dtam.tools.thermal.simulation import simulate_thermal_flow

THERMAL_TOOLS: list[ToolFn] = [
    read_temperature_channels,
    simulate_thermal_flow,
    analyze_thermal_gradient,
    search_thermal_knowledge,
]

__all__ = [
    "THERMAL_TOOLS",
    "analyze_thermal_gradient",
    "read_temperature_channels",
    "search_thermal_knowledge",
    "simulate_thermal_flow",
]
