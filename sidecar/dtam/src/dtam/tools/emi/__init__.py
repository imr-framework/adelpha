"""EMI tools — public exports only."""

from dtam.tools.base import ToolFn
from dtam.tools.emi.classification import classify_emi_noise
from dtam.tools.emi.knowledge import search_emi_knowledge
from dtam.tools.emi.mitigation import propose_emi_mitigation
from dtam.tools.emi.sensors import read_emi_sensor_summary

EMI_TOOLS: list[ToolFn] = [
    read_emi_sensor_summary,
    classify_emi_noise,
    search_emi_knowledge,
    propose_emi_mitigation,
]

__all__ = [
    "EMI_TOOLS",
    "classify_emi_noise",
    "propose_emi_mitigation",
    "read_emi_sensor_summary",
    "search_emi_knowledge",
]
