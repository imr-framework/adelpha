import { expect, it } from "vitest";
import type { FemFields } from "../mri/api";
import { dsvCsv, evaluateDsv, type DsvConfig } from "./femDsv";
const config: DsvConfig = { diameterMm: 10, centerMm: [0, 0, 0], component: "z", resolution: 17 };
function fixture(vector: (x: number, y: number, z: number) => number[] = () => [0, 0, 1]): FemFields {
  const nodes = Array.from({ length: 8 }, (_, i) => [i & 1 ? .01 : -.01, i & 2 ? .01 : -.01, i & 4 ? .01 : -.01]);
  const f = { name: "B", unit: "T", values: nodes.flatMap(p => vector(p[0], p[1], p[2])) };
  return { source: "fixture.vtu", units: "m", points: nodes.flat(), fields: { B: f, H: f, A: f }, groups: [{ id: 1, name: "air", tetrahedra: [0, 1, 3, 7, 0, 3, 2, 7, 0, 2, 6, 7, 0, 6, 4, 7, 0, 4, 5, 7, 0, 5, 1, 7], triangles: [] }] };
}
it("reports a uniform field and converts DSV millimetres exactly once", () => {
  const r = evaluateDsv(fixture(), config);
  expect(r.mean).toBeCloseTo(1, 12);
  expect(r.ppmPeakToPeak).toBeLessThan(1e-8);
  expect(r.ppmRms).toBeLessThan(1e-8);
  expect(Math.max(...r.samples.map(s => Math.hypot(...s.pointMm)))).toBeCloseTo(5, 10);
});
it("recovers affine-field extrema and volume RMS, with surface samples excluded from the mean", () => {
  const r = evaluateDsv(fixture((x, _, z) => [2 * z, 0, 1 + 2 * x]), config);
  expect(r.mean).toBeCloseTo(1, 12);
  expect(r.min).toBeCloseTo(.99, 10); expect(r.max).toBeCloseTo(1.01, 10);
  expect(r.ppmPeakToPeak).toBeCloseTo(20000, 6);
  expect(Math.abs(r.rms - .01 / Math.sqrt(5))).toBeLessThan(.0001);
});
it("interpolates vectors before computing magnitude and treats near-zero reference as undefined", () => {
  const model = fixture((x, y, z) => [x, y, z]);
  const r = evaluateDsv(model, { ...config, component: "magnitude" });
  expect(r.min).toBeCloseTo(0, 12); expect(r.max).toBeCloseTo(.005, 10);
  const zero = evaluateDsv(fixture(x => [0, 0, x]), config);
  expect(zero.ppmPeakToPeak).toBeNull(); expect(zero.ppmRms).toBeNull();
});
it("rejects invalid inputs, outside regions, missing coverage, and thin solid intersections", () => {
  for (const diameterMm of [0, -5, NaN, Infinity]) expect(() => evaluateDsv(fixture(), { ...config, diameterMm })).toThrow();
  expect(() => evaluateDsv(fixture(), { ...config, centerMm: [NaN, 0, 0] })).toThrow();
  expect(() => evaluateDsv(fixture(), { ...config, centerMm: [9, 0, 0] })).toThrow(/inside/);
  const sparse = fixture(); sparse.groups[0].tetrahedra = [0, 1, 3, 7];
  expect(() => evaluateDsv(sparse, config)).toThrow(/covered/);
  const solid = fixture(); solid.points.push(.001, -.001, -.001, .001, .001, -.001, .001, 0, .001);
  solid.groups.push({ id: 2, name: "magnet", tetrahedra: [], triangles: [8, 9, 10] });
  expect(() => evaluateDsv(solid, config)).toThrow(/intersects a solid/);
});
it("exports run, quantity, units, formulas' reference, and all sampled vectors", () => {
  const r = evaluateDsv(fixture(), config), csv = dsvCsv(r, config, "job-123", "fields.vtu");
  expect(csv).toContain('"jobId":"job-123"'); expect(csv).toContain('"diameterMm":10');
  expect(csv).toContain("region,x_mm,y_mm,z_mm,Bx_T,By_T,Bz_T,value_T");
  expect(csv.split('\n')).toHaveLength(r.samples.length + 2);
});
