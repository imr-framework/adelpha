"""Gradient tools — public exports only."""

from dtam.tools.base import ToolFn
from dtam.tools.gradient.eddy_currents import (
    evaluate_eddy_current_model,
    interpret_eddy_current_results,
)
from dtam.tools.gradient.sensors import read_gradient_sensor_summary

GRADIENT_TOOLS: list[ToolFn] = [
    read_gradient_sensor_summary,
    evaluate_eddy_current_model,
    interpret_eddy_current_results,
]

__all__ = [
    "GRADIENT_TOOLS",
    "evaluate_eddy_current_model",
    "interpret_eddy_current_results",
    "read_gradient_sensor_summary",
]
