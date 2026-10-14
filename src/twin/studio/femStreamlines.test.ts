import { expect, it } from "vitest";
import { makeFieldSampler, traceFieldLines } from "./femStreamlines";
import type { FemFields } from "../mri/api";
const field = { name: "B", unit: "T", values: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] };
const data: FemFields = { units: "m", source: "uniform.vtu", points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], fields: { B: field, H: field, A: field }, groups: [{ id: 2, name: "magnet", tetrahedra: [0, 1, 2, 3], triangles: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3] }] };
it("interpolates the solver vectors inside cells and stops outside the domain", () => {
  const sample = makeFieldSampler(data);
  expect(sample([.1, .2, .3])).toEqual([0, 0, 1]);
  expect(sample([.9, .9, .9])).toBeNull();
  const affine = { ...data, fields: { ...data.fields, B: { ...field, values: data.points } } };
  const v = makeFieldSampler(affine)([.1, .2, .3])!;
  expect(v[0]).toBeCloseTo(.1); expect(v[1]).toBeCloseTo(.2); expect(v[2]).toBeCloseTo(.3);
});
it("traces straight lines for a uniform B field without inventing out-of-domain points", () => {
  const lines = traceFieldLines(data);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) for (let i = 0; i < line.length; i += 3) {
    expect(line[i]).toBeCloseTo(line[0]); expect(line[i + 1]).toBeCloseTo(line[1]);
    expect(line[i + 2]).toBeGreaterThanOrEqual(0);
    expect(line[i] + line[i + 1] + line[i + 2]).toBeLessThanOrEqual(1.000001);
  }
});
