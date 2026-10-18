"""Generate a grooved coil-former STL from a winding-table CSV."""

import csv
from pathlib import Path

import cadquery as cq


def read_groove_positions(csv_path):
    """Return Position (mm) values from a winding-table CSV."""
    positions = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get("Position (mm)") or "").strip()
            if not raw:
                continue
            positions.append(float(raw))
    if not positions:
        raise ValueError(f"No groove positions found in {csv_path}")
    return positions


def _circumferential_ring(z, outer_radius, groove_width, groove_depth, margin):
    """Rectangular hoop cutter centered at z."""
    return (
        cq.Workplane("XY")
        .workplane(offset=z - groove_width / 2)
        .circle(outer_radius + margin)
        .circle(outer_radius - groove_depth)
        .extrude(groove_width)
    )


def _axial_slot(angle_deg, length, outer_radius, groove_width, groove_depth, margin):
    """Axial slot cutter at angle_deg, full cylinder length."""
    radial_span = groove_depth + margin
    return (
        cq.Workplane("XY")
        .box(groove_width, radial_span, length + 2 * margin, centered=(True, False, True))
        .translate((0, outer_radius - groove_depth, 0))
        .rotate((0, 0, 0), (0, 0, 1), angle_deg)
    )


def _axial_ear(
    inner_radius,
    ear_length,
    ear_width,
    ear_thickness,
    hole_radius,
    hole_edge_clearance,
    z_end,
):
    """55 mm × 45 mm wall continuation along +Z; inner face is the ID arc."""
    half_w = ear_width / 2
    x_outer = inner_radius + ear_thickness

    ear = (
        cq.Workplane("XY")
        .box(x_outer, ear_width, ear_length, centered=(False, True, False))
        .translate((0, 0, z_end))
    )
    bore = (
        cq.Workplane("XY")
        .circle(inner_radius)
        .extrude(ear_length + 2)
        .translate((0, 0, z_end - 1))
    )
    ear = ear.cut(bore)

    inset = hole_edge_clearance + hole_radius
    z_hole = z_end + ear_length - inset
    for y in (half_w - inset, -half_w + inset):
        hole = (
            cq.Workplane("YZ")
            .workplane(offset=-1)
            .center(y, z_hole)
            .circle(hole_radius)
            .extrude(x_outer + 2)
        )
        ear = ear.cut(hole)
    return ear


def generate_cylinder_stl(
    csv_path,
    output_path="coil_former.stl",
    length=180.0,
    inner_radius=29.5,
    outer_radius=32.0,
    groove_width=1.75,
    groove_depth=1.75,
    ear_length=55.0,
    ear_width=45.0,
    ear_thickness=2.5,
    hole_radius=2.0,
    hole_edge_clearance=1.0,
    angular_tolerance=0.05,
):
    """Build a hollow cylinder with hoop and axial grooves and write an STL."""
    positions = read_groove_positions(csv_path)
    margin = 1.0

    tube = (
        cq.Workplane("XY")
        .circle(outer_radius)
        .circle(inner_radius)
        .extrude(length)
        .translate((0, 0, -length / 2))
    )

    cutters = []
    for z in positions:
        cutters.append(
            _circumferential_ring(z, outer_radius, groove_width, groove_depth, margin)
        )
    for angle in (0.0, 180.0):
        cutters.append(
            _axial_slot(angle, length, outer_radius, groove_width, groove_depth, margin)
        )

    former = tube
    for cutter in cutters:
        former = former.cut(cutter)

    ear = _axial_ear(
        inner_radius=inner_radius,
        ear_length=ear_length,
        ear_width=ear_width,
        ear_thickness=ear_thickness,
        hole_radius=hole_radius,
        hole_edge_clearance=hole_edge_clearance,
        z_end=length / 2,
    )
    former = former.union(ear)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cq.exporters.export(
        former,
        str(output_path),
        tolerance=angular_tolerance,
        angularTolerance=0.2,
    )
    return output_path, positions


if __name__ == "__main__":
    default_csv = Path(
        "/home/winding_table_v3.csv"
    )
    default_stl = default_csv.with_name("coil_former.stl")
    stl_path, positions = generate_cylinder_stl(default_csv, default_stl)
    print(f"Read {len(positions)} grooves from {default_csv}")
    print(f"Wrote {stl_path}")
