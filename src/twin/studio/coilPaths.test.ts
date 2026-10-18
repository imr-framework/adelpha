import { describe, expect, it } from "vitest";

import { coilBounds, displayWireRadius, packFaces, packTriplets, splitWirePoints, windingColor } from "./coilPaths";

describe("splitWirePoints", () => {
  it("keeps a dense closed loop intact", () => {
    const points = [
      [0, 0, 0],
      [0.01, 0, 0],
      [0.02, 0, 0],
      [0.02, 0.01, 0],
      [0, 0.01, 0],
    ];
    expect(splitWirePoints(points, true)).toEqual([{ points, closed: true }]);
  });

  it("preserves long solver interconnections despite nonuniform sampling", () => {
    const points = [
      [0, 0, 0],
      [0.01, 0, 0],
      [0.02, 0, 0],
      [0.4, 0, 0.3],
      [0.41, 0, 0.3],
    ];
    const parts = splitWirePoints(points, false);
    expect(parts).toEqual([{ points, closed: false }]);
  });
});

describe("packTriplets", () => {
  it("writes xyz values into one typed buffer", () => {
    expect(Array.from(packTriplets([[1, 2, 3], [4, 5, 6]]))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(packFaces([[0, 1, 2], [2, 3, 0]]))).toEqual([0, 1, 2, 2, 3, 0]);
  });
});

describe("coilBounds", () => {
  it("includes winding points that sit outside the mesh", () => {
    const bounds = coilBounds({
      vertices: [
        [0, 0, 0],
        [0.1, 0, 0],
        [0, 0.1, 0],
      ],
      faces: [[0, 1, 2]],
      colors: [],
      wires: [{ group: 0, closed: false, points: [[0, 0, 0], [0, 0, 0.4]] }],
      wire_radius: 0.002,
      stream_min: 0,
      stream_max: 1,
    });
    expect(bounds.center[2]).toBeCloseTo(0.2);
    expect(bounds.size).toBeGreaterThan(0.39);
  });
});

describe("windingColor", () => {
  it("uses opposite colours for neighbouring current groups", () => {
    expect(windingColor(0)).not.toBe(windingColor(1));
    expect(windingColor(5)).toBe(windingColor(0));
  });
});

describe("displayWireRadius", () => {
  it("uses a finer stroke than the solver display radius", () => {
    expect(displayWireRadius(0.002)).toBeLessThan(0.002);
    expect(displayWireRadius(0.002, true)).toBeGreaterThan(displayWireRadius(0.002));
  });
});
