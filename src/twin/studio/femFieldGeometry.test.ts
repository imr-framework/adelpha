import { describe, expect, it } from "vitest";
import type { FemFields } from "../mri/api";
import { fieldTriangles, scalar, fieldColor } from "./femFieldGeometry";
const field = { name: "test", unit: "T", values: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
const data: FemFields = { units: "m", source: "test.vtu", points: field.values, fields: { B: field, H: field, A: field }, groups: [{ id: 2, name: "magnet", tetrahedra: [0, 1, 2, 3], triangles: [0, 1, 2] }] };
describe("FEM field sections", () => {
  it("interpolates an affine vector field exactly on a tetrahedron section", () => {
    const samples = fieldTriangles(data, "B", "slice", 2, .25, false);
    expect(samples).toHaveLength(3);
    for (const s of samples) { expect(s.point[2]).toBeCloseTo(.25); expect(s.vector).toEqual(s.point); }
    expect(samples.map(s => s.point).sort()).toEqual([[0, 0, .25], [.75, 0, .25], [0, .75, .25]].sort());
  });
  it("handles planes through vertices and outside the mesh", () => {
    expect(fieldTriangles(data, "B", "slice", 2, 0, false)).toHaveLength(3);
    expect(fieldTriangles(data, "B", "slice", 2, 1, false)).toHaveLength(0);
    expect(fieldTriangles(data, "B", "slice", 2, 2, false)).toHaveLength(0);
  });
  it("includes air only when requested", () => {
    const air = { ...data, groups: [{ ...data.groups[0], name: "air" }] };
    expect(fieldTriangles(air, "B", "surface", 0, 0, false)).toHaveLength(0);
    expect(fieldTriangles(air, "B", "slice", 2, .25, true)).toHaveLength(3);
  });
  it("preserves signed components and bounds color mapping", () => {
    expect(scalar([-3, 4, 0], "magnitude")).toBe(5);
    expect(scalar([-3, 4, 0], "x")).toBe(-3);
    expect(fieldColor(-10, 0, 1)).toEqual(fieldColor(0, 0, 1));
    expect(fieldColor(5, 5, 5).every(Number.isFinite)).toBe(true);
  });
});
