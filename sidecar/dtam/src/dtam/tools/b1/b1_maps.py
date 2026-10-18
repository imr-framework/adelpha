"""B1 map generation and interpretation tools."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import numpy as np

from dtam.memory.working import WORKING_STATE
from dtam.tools.base import ok_result
from dtam.tools.paths import artifacts_root


def generate_b1_map_summary(
    relative_transmit_efficiency: float = 1.0,
    grid_n: int = 21,
) -> dict[str, Any]:
    """Create a compact synthetic relative B1 map artifact."""
    out_dir = artifacts_root() / "b1_maps"
    out_dir.mkdir(parents=True, exist_ok=True)
    axis = np.linspace(-0.1, 0.1, grid_n)
    x, y, z = np.meshgrid(axis, axis, axis, indexing="ij")
    r2 = x**2 + y**2 + z**2
    b1 = relative_transmit_efficiency * np.exp(-r2 / (2 * 0.08**2))
    path = out_dir / f"b1_{uuid4().hex[:8]}.npz"
    np.savez_compressed(path, x=axis, y=axis, z=axis, b1_relative=b1)
    summary = {
        "path": str(path),
        "mean_relative_b1": float(np.mean(b1)),
        "min_relative_b1": float(np.min(b1)),
        "max_relative_b1": float(np.max(b1)),
        "shape": list(b1.shape),
    }
    WORKING_STATE.set("b1.last_map_summary", summary)
    return ok_result(
        "generate_b1_map_summary",
        **summary,
        note="Synthetic relative B1 map for advisory workflows.",
    )


def interpret_b1_map(
    mean_relative_b1: float,
    min_relative_b1: float,
    accept_min: float = 0.7,
) -> dict[str, Any]:
    """Interpret B1 homogeneity / efficiency summary metrics."""
    status = "acceptable" if min_relative_b1 >= accept_min else "degraded"
    if status == "degraded":
        recommendations = [
            "Inspect coil loading / patient positioning",
            "Recheck tuning and matching network state",
            "Compare with coil temperature and EMI conditions",
        ]
    else:
        recommendations = ["B1 metrics within advisory acceptance band"]
    return ok_result(
        "interpret_b1_map",
        status=status,
        mean_relative_b1=mean_relative_b1,
        min_relative_b1=min_relative_b1,
        accept_min=accept_min,
        recommendations=recommendations,
    )
