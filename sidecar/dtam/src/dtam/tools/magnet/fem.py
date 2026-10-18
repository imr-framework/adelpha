"""FEM mesh/file preparation via HalbachMRIDesigner --fem."""

from __future__ import annotations

from typing import Any

from dtam.tools.magnet.designer import run_halbach_designer


def generate_fem_mesh_files(
    geometry_json: str,
    output_stem: str | None = None,
) -> dict[str, Any]:
    """Generate Gmsh/GetDP FEM preparation files via HalbachMRIDesigner --fem."""
    return run_halbach_designer(
        geometry_json,
        scad=False,
        fem=True,
        output_stem=output_stem or "fem_prep",
    )
