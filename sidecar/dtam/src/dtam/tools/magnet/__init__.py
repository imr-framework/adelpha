"""Magnet tools — public exports only."""

from dtam.tools.base import ToolFn
from dtam.tools.magnet.b0_maps import generate_b0_map_summary
from dtam.tools.magnet.designer import magnet_designer_status, run_halbach_designer
from dtam.tools.magnet.fem import generate_fem_mesh_files

MAGNET_TOOLS: list[ToolFn] = [
    magnet_designer_status,
    run_halbach_designer,
    generate_fem_mesh_files,
    generate_b0_map_summary,
]

__all__ = [
    "MAGNET_TOOLS",
    "generate_b0_map_summary",
    "generate_fem_mesh_files",
    "magnet_designer_status",
    "run_halbach_designer",
]
