import { expect, it } from "vitest";
import { fieldLineSeeds, makeFieldSampler, traceDirection, traceFieldLines } from "./femStreamlines";
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

function cube(vector = [0, 0, 1]): FemFields {
  const points = Array.from({ length: 8 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]).flat();
  return { ...data, points, fields: { ...data.fields, B: { ...field, values: Array.from({ length: 8 }, () => vector).flat() } },
    groups: [{ id: 2, name: "magnet", tetrahedra: [0, 1, 3, 7, 0, 3, 2, 7, 0, 2, 6, 7, 0, 6, 4, 7, 0, 4, 5, 7, 0, 5, 1, 7],
      triangles: [0, 1, 3, 0, 3, 2, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 3, 7, 1, 7, 5] }] };
}

it("uses balanced physical seed positions independent of triangle numbering", () => {
  const model = cube(), seeds = fieldLineSeeds(model);
  expect(seeds).toHaveLength(9);
  for (const [x, y, z] of seeds) {
    expect(z).toBe(0);
    expect(seeds.some(p => p[0] === -x && p[1] === y)).toBe(true);
    expect(seeds.some(p => p[0] === x && p[1] === -y)).toBe(true);
  }
  const shuffled = { ...model, groups: model.groups.map(g => ({ ...g, triangles: [...g.triangles].reverse() })) };
  expect(fieldLineSeeds(shuffled)).toEqual(seeds);
  expect(traceFieldLines(shuffled)).toEqual(traceFieldLines(model));
});

it("retains genuine field tilt rather than forcing mirrored trajectories", () => {
  const lines = traceFieldLines(cube([.2, .1, 1]));
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) for (let i = 3; i < line.length; i += 3) {
    const dz = line[i + 2] - line[2];
    expect(line[i] - line[0]).toBeCloseTo(.2 * dz, 8);
    expect(line[i + 1] - line[1]).toBeCloseTo(.1 * dz, 8);
  }
});

it("resolves a circular field without spiraling or drawing repeated loops", () => {
  const model = cube();
  model.fields.B.values = model.points.flatMap((_, i) => i % 3 === 0 ? [-model.points[i + 1], model.points[i], 0] : []);
  const points = traceDirection(makeFieldSampler(model), [.25, 0, 0], 1, .2);
  expect(points.length).toBeGreaterThan(20);
  expect(points.length).toBeLessThan(200);
  expect(points.some(p => p[0] < -.24)).toBe(true);
  for (const p of points) {
    expect(Math.abs(Math.hypot(p[0], p[1]) - .25)).toBeLessThan(.002);
    expect(p[2]).toBeCloseTo(0, 8);
  }
});

it("stops at zero fields and respects discontinuous body values", () => {
  expect(traceDirection(() => [0, 0, 0], [0, 0, 0], 1, .1)).toHaveLength(1);
  const model = cube();
  expect(makeFieldSampler(model)([0, 0, 0], 99)).toBeNull();
  expect(makeFieldSampler(model)([0, 0, 0], 2)).toEqual([0, 0, 1]);
  expect(fieldLineSeeds(cube([0, 0, 0])).length).toBeLessThanOrEqual(24);
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
