import { describe, expect, it } from "vitest";

import { closedConductorPoints, fabricableLoop, wireTubeMesh } from "./coilTube";

function dist(a: number[], b: number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function arc(from: number, to: number, count = 24, radius = 0.06) {
  return Array.from({ length: count }, (_, index) => {
    const t = from + ((to - from) * index) / (count - 1);
    return [radius * Math.cos(t), radius * Math.sin(t), 0];
  });
}

describe("closedConductorPoints", () => {
  it("keeps an already-closed square as a ring", () => {
    const square = [
      [0, 0, 0],
      [0.05, 0, 0],
      [0.05, 0.05, 0],
      [0, 0.05, 0],
      [0, 0, 0],
    ];
    const ring = closedConductorPoints(square, true);
    expect(ring).toHaveLength(4);
    expect(dist(ring[0], ring[ring.length - 1])).toBeGreaterThan(0.04);
  });

  it("fills a coplanar C-shaped isoline so the winding is one loop", () => {
    const open = arc(0.6, Math.PI * 2 - 0.6);
    const ring = closedConductorPoints(open, true);
    expect(ring.length).toBeGreaterThan(open.length);
    expect(dist(ring[0], ring[ring.length - 1])).toBeLessThan(dist(open[0], open[open.length - 1]) * 0.45);
    expect(ring.some((point) => point[0] > 0.045 && Math.abs(point[1]) < 0.03)).toBe(true);
  });

  it("does not invent a chord across a non-planar gap", () => {
    const helix = Array.from({ length: 16 }, (_, index) => [
      0.05 * Math.cos(index * 0.35),
      0.05 * Math.sin(index * 0.35),
      index * 0.01,
    ]);
    expect(closedConductorPoints(helix, true)).toHaveLength(helix.length);
  });
});

describe("fabricableLoop", () => {
  it("rejects specks that would render as disconnected dots", () => {
    const speck = [
      [0, 0, 0],
      [0.002, 0, 0],
      [0.002, 0.002, 0],
      [0, 0.002, 0],
    ];
    expect(fabricableLoop(speck)).toBe(false);
    expect(fabricableLoop(arc(0, Math.PI * 2, 16, 0.05))).toBe(true);
  });
});

describe("wireTubeMesh", () => {
  it("wraps the last ring onto the first for a closed loop", () => {
    const square = [
      [0, 0, 0],
      [0.05, 0, 0],
      [0.05, 0.05, 0],
      [0, 0.05, 0],
    ];
    const mesh = wireTubeMesh(square, 0.002, true, 8);
    expect(mesh).not.toBeNull();
    expect(mesh!.positions.length).toBe(4 * 8 * 3);
    expect(mesh!.indices.length).toBe(4 * 8 * 6);
    const lastQuad = mesh!.indices.slice(-6);
    expect(lastQuad).toContain(0);
  });
});
