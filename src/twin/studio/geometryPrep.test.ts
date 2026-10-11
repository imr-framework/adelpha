import { describe, expect, it } from "vitest";

import { emptyEngineering } from "./engineering";
import {
  applyWorldOnce,
  convertSize,
  includedParts,
  physicalModelKey,
  rotateLocalVector,
  surfaceTopology,
  toMeters,
  validateForFem,
  validateForMagnet,
  visibilityDoesNotChangeModel,
  worldMagnetization,
  type PhysicalPart,
} from "./geometryPrep";

function part(overrides: Partial<PhysicalPart> = {}): PhysicalPart {
  return {
    instanceId: "magnet::0",
    partId: "magnet",
    cadName: "Magnet",
    sourceAssetId: "imported-1",
    geometryRevision: "abc",
    worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    translationM: [0, 0, 0],
    sizeM: [0.02, 0.02, 0.02],
    units: "m",
    triangleCount: 12,
    vertexCount: 8,
    closed: true,
    degenerateFaces: 0,
    boundaryEdges: 0,
    visible: true,
    inSimulation: true,
    selected: false,
    engineering: {
      ...emptyEngineering(),
      role: "permanent_magnet",
      remanenceT: 1.2,
      magnetizationLocal: [0, 0, 1],
    },
    ...overrides,
  };
}

describe("geometry preparation", () => {
  it("applies nested transforms once", () => {
    const parent = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0, 0, 1];
    const local = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.02, 0, 0, 1];
    const world = applyWorldOnce(local, parent);
    expect(world[12]).toBeCloseTo(0.12);
    expect(world[13]).toBeCloseTo(0);
  });

  it("rotates local magnetization with the part", () => {
    const rotated = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const world = rotateLocalVector([1, 0, 0], rotated);
    expect(world[0]).toBeCloseTo(0);
    expect(world[1]).toBeCloseTo(1);
    expect(world[2]).toBeCloseTo(0);
    expect(worldMagnetization([1, 0, 0], rotated, "local")?.[1]).toBeCloseTo(1);
    expect(worldMagnetization([1, 0, 0], rotated, "world")?.[0]).toBeCloseTo(1);
  });

  it("keeps hidden parts in the physical model and drops excluded parts", () => {
    const included = part();
    const hidden = part({ instanceId: "yoke::0", partId: "yoke", visible: false });
    const excluded = part({ instanceId: "cover", partId: "cover", inSimulation: false });
    expect(visibilityDoesNotChangeModel([included, hidden, excluded])).toBe(true);
    expect(includedParts([included, hidden, excluded]).map((row) => row.instanceId)).toEqual(["magnet::0", "yoke::0"]);
    expect(physicalModelKey([included, hidden])).not.toBe(physicalModelKey([included]));
  });

  it("does not invent remanence and reports missing FEM volumes", () => {
    const bare = part({ engineering: emptyEngineering() });
    const magnetIssues = validateForMagnet([bare]);
    expect(validateForMagnet([part({ inSimulation: false })]).some((issue) => issue.code === "NO_INCLUDED_PARTS")).toBe(true);
    expect(magnetIssues.some((issue) => issue.code === "MISSING_ROLE")).toBe(true);
    expect(magnetIssues.every((issue) => issue.correction.length > 0)).toBe(true);
    const open = part({ closed: false, boundaryEdges: 8 });
    const femIssues = validateForFem([open], "imported_mesh");
    expect(femIssues.some((issue) => issue.code === "OPEN_SURFACE")).toBe(true);
  });

  it("converts millimetre sizes to metres once", () => {
    expect(toMeters(20, "mm")).toBeCloseTo(0.02);
    expect(convertSize([20, 10, 5], "mm")).toEqual([0.02, 0.01, 0.005]);
    expect(convertSize([0.02, 0.01, 0.005], "m")).toEqual([0.02, 0.01, 0.005]);
  });

  it("detects an open triangle pair as not closed", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
    const indices = [0, 1, 2, 1, 3, 2];
    const topology = surfaceTopology(positions, indices);
    expect(topology.closed).toBe(false);
    expect(topology.boundaryEdges).toBeGreaterThan(0);
  });
});
