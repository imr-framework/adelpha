"""B0 map summary artifacts for magnet / field workflows."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import numpy as np

from dtam.tools.base import ok_result
from dtam.tools.paths import artifacts_root


def generate_b0_map_summary(
    field_strength_t: float = 0.048,
    homogeneity_ppm: float = 500.0,
    grid_n: int = 21,
) -> dict[str, Any]:
    """Create a lightweight synthetic B0 map summary for twin workflows.

    Full physics B0 maps come from HalbachMRIDesigner / FEM. This helper stores a
    compact numpy artifact agents can reference while design runs are offline.
    """
    out_dir = artifacts_root() / "b0_maps"
    out_dir.mkdir(parents=True, exist_ok=True)
    axis = np.linspace(-0.1, 0.1, grid_n)
    x, y, z = np.meshgrid(axis, axis, axis, indexing="ij")
    delta = (homogeneity_ppm * 1e-6) * field_strength_t
    b0 = field_strength_t + delta * (x**2 + y**2 - 2 * z**2)
    path = out_dir / f"b0_{uuid4().hex[:8]}.npz"
    np.savez_compressed(
        path,
        x=axis,
        y=axis,
        z=axis,
        b0=b0,
        field_strength_t=np.array(field_strength_t),
        homogeneity_ppm=np.array(homogeneity_ppm),
    )
    return ok_result(
        "generate_b0_map_summary",
        path=str(path),
        field_strength_t=field_strength_t,
        homogeneity_ppm=homogeneity_ppm,
        shape=list(b0.shape),
        b0_mean_t=float(np.mean(b0)),
        b0_std_t=float(np.std(b0)),
        note=(
            "Synthetic summary map — replace with Halbach/FEM-derived "
            "maps when available."
        ),
    )
