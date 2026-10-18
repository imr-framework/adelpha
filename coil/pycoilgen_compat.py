"""Narrow compatibility fixes for the installed pyCoilGen interconnection code.

Keep these in Adelpha, rather than modifying the gitignored solver environment.
"""
from __future__ import annotations


def bounded_open_loop(function):
    """A cut must leave some conductor outside its sphere, including tiny loops."""
    def wrapped(curve, center, diameter):
        import numpy as np
        center = np.asarray(center, dtype=float).reshape(3, 1)
        distances = np.linalg.norm(curve.v - center, axis=0)
        if not np.isfinite(distances).all() or distances.max() <= 1e-12:
            raise ValueError("Cannot connect a degenerate winding contour.")
        # The upstream exception conflates no intersection with an engulfed loop.
        # Limit the cut, not the loop: retain and evaluate every winding.
        diameter = min(float(diameter), float(distances.max()))
        return function(curve, center, diameter)
    return wrapped


def planar_group_cuts(group, center, mesh, b0, definition):
    """Intersect planar loops without upstream's row/column deduplication bug.

    Return high/low cuts in pyCoilGen's CutPosition format. Every cut is on an
    actual segment, with the same interpolation in physical and UV coordinates.
    """
    import numpy as np
    from pyCoilGen.sub_functions.data_structures import CutPosition, CutPoint
    from pyCoilGen.sub_functions.calc_mean_loop_normal import calc_mean_loop_normal

    normal = calc_mean_loop_normal(group, mesh)
    normal = normal / np.linalg.norm(normal)
    center = np.asarray(center)
    outer = group.loops[0].v
    direction = outer[:, np.argmin(np.linalg.norm(outer - center[:, None], axis=0))] - center
    direction -= normal * np.dot(direction, normal)
    if np.linalg.norm(direction) < 1e-12:
        direction = outer[:, 0] - outer[:, outer.shape[1] // 2]
    direction /= np.linalg.norm(direction)
    plane_normal = np.cross(direction, normal)
    cuts = []
    for loop in group.loops:
        if getattr(loop, "v", None) is None:
            raise ValueError("A winding loop is missing 3D coordinates.")
        if getattr(loop, "uv", None) is None:
            raise ValueError("A winding loop is missing surface coordinates.")
        candidates = []
        for index in range(loop.v.shape[1] - 1):
            a, b = loop.v[:, index], loop.v[:, index + 1]
            da, db = np.dot(a - center, plane_normal), np.dot(b - center, plane_normal)
            if abs(da - db) < 1e-14:
                continue
            t = da / (da - db)
            if -1e-10 <= t <= 1 + 1e-10:
                t = np.clip(t, 0, 1)
                point = a + t * (b - a)
                uv = loop.uv[:, index] + t * (loop.uv[:, index + 1] - loop.uv[:, index])
                if not any(np.linalg.norm(point - item[0]) < 1e-10 for item in candidates):
                    candidates.append((point, uv, index))
        if len(candidates) < 2:
            # Off-center nested loops can miss the plane. Use their actual
            # extreme vertices along the same cut direction, never synthetic cuts.
            projection = direction @ loop.v
            candidates = [(loop.v[:, i], loop.uv[:, i], min(i, loop.v.shape[1] - 2))
                          for i in (int(np.argmin(projection)), int(np.argmax(projection)))]
        candidates.sort(key=lambda item: np.dot(item[0], direction))
        low, high = candidates[0], candidates[-1]
        if np.linalg.norm(high[0] - low[0]) < 1e-12:
            raise ValueError("Cannot find distinct connection points on a winding contour.")
        cuts.append(CutPosition(
            cut_point=CutPoint(v=np.array([c[0] for c in candidates]),
                               uv=np.array([c[1] for c in candidates]),
                               segment_ind=[c[2] for c in candidates]),
            high_cut=CutPoint(v=high[0], uv=high[1], segment_ind=high[2]),
            low_cut=CutPoint(v=low[0], uv=low[1], segment_ind=low[2]),
        ))
    return cuts


def install():
    import numpy as np
    import pyCoilGen.sub_functions.interconnect_within_groups as within
    import pyCoilGen.sub_functions.interconnect_among_groups as among
    if getattr(within, '_adelpha_connections', False):
        return
    original = within.find_group_cut_position
    def cuts(group, center, mesh, b0, definition):
        if np.min(np.ptp(mesh.v, axis=0)) < 1e-10:
            return planar_group_cuts(group, center, mesh, b0, definition)
        return original(group, center, mesh, b0, definition)
    within.find_group_cut_position = cuts
    within.open_loop_with_3d_sphere = bounded_open_loop(within.open_loop_with_3d_sphere)
    among.open_loop_with_3d_sphere = bounded_open_loop(among.open_loop_with_3d_sphere)
    within._adelpha_connections = True
