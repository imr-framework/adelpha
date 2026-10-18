import { beforeEach, describe, expect, it } from "vitest";

import { emptyEngineering } from "./engineering";
import type { AssemblyInstance, PhysicalPart } from "./geometryPrep";
import { exampleHalbachParts, freezeParts, makeSnapshot, useHardwareStudyStore } from "./hardwareStudyStore";
import { usePartInspectorStore } from "../partInspectorStore";

const instance: AssemblyInstance = {
  instanceId: "magnet::0",
  partId: "magnet",
  cadName: "Magnet",
  sourceAssetId: "imported-1",
  geometryRevision: "rev-a",
  worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  translationM: [0, 0, 0],
  sizeM: [0.02, 0.02, 0.02],
  units: "m",
  triangleCount: 12,
  vertexCount: 8,
  closed: true,
  degenerateFaces: 0,
  boundaryEdges: 0,
};

describe("hardware study snapshots", () => {
  beforeEach(() => {
    useHardwareStudyStore.setState({ projects: {} });
    usePartInspectorStore.setState({
      bindings: {},
      catalog: {},
      groups: {},
      hidden: {},
      selected: null,
      selection: [],
    });
  });

  it("freezes included parts and keeps an older run when membership changes", () => {
    const parts: PhysicalPart[] = [
      {
        ...instance,
        visible: false,
        inSimulation: true,
        selected: false,
        engineering: { ...emptyEngineering(), role: "permanent_magnet", remanenceT: 1.2, magnetizationLocal: [0, 0, 1] },
      },
    ];
    expect(parts[0]?.visible).toBe(false);
    expect(parts[0]?.inSimulation).toBe(true);
    const snapshot = makeSnapshot("magnet", parts, useHardwareStudyStore.getState().record("p1", "magnet").settings, ["cuboid"], {
      numpy: "2",
    });
    expect(snapshot.includedInstanceIds).toEqual(["magnet::0"]);
    expect(freezeParts(parts)[0]?.remanenceT).toBe(1.2);
    useHardwareStudyStore.getState().addRun("p1", "magnet", {
      id: "run-1",
      study: "magnet",
      status: "completed",
      stale: false,
      createdAt: 1,
      error: null,
      snapshot,
      result: null,
    });
    usePartInspectorStore.getState().setPartsInSimulation("imported-1", ["magnet"], false);
    useHardwareStudyStore.getState().markStale("p1", "magnet", "changed");
    const record = useHardwareStudyStore.getState().record("p1", "magnet");
    expect(record.runs[0]?.snapshot.includedInstanceIds).toEqual(["magnet::0"]);
    expect(record.runs[0]?.stale).toBe(true);
  });

  it("reloads engineering properties from older bindings without inventing remanence", () => {
    localStorage.setItem(
      "adelpha.partBindings.v1",
      JSON.stringify({
        "imported-1": {
          magnet: { displayName: "Magnet", sensorId: null, inSimulation: true, colorHex: null, groupId: null },
        },
      }),
    );
    usePartInspectorStore.setState({ bindings: {} });
    const bindings = JSON.parse(localStorage.getItem("adelpha.partBindings.v1") ?? "{}");
    expect(bindings["imported-1"].magnet.engineering).toBeUndefined();
    usePartInspectorStore.setState({
      bindings: {
        "imported-1": {
          magnet: {
            ...bindings["imported-1"].magnet,
            engineering: emptyEngineering(),
          },
        },
      },
    });
    const saved = usePartInspectorStore.getState().bindings["imported-1"]?.magnet;
    expect(saved?.inSimulation).toBe(true);
    expect(saved?.engineering.remanenceT).toBeNull();
    expect(saved?.engineering.role).toBeNull();
  });

  it("freezes the eight example Halbach cubes", () => {
    const snapshot = makeSnapshot(
      "magnet",
      exampleHalbachParts(),
      useHardwareStudyStore.getState().record("p1", "magnet").settings,
      ["example"],
      {},
    );
    expect(snapshot.includedInstanceIds).toHaveLength(8);
    expect(snapshot.parts[0]?.remanenceT).toBe(1.2);
  });

  it("persists membership and remanence through a save/reload cycle", () => {
    usePartInspectorStore.getState().setPartCatalog("imported-1", [{ partId: "magnet", cadName: "Magnet" }]);
    usePartInspectorStore.getState().setPartsInSimulation("imported-1", ["magnet"], true);
    usePartInspectorStore.getState().patchEngineering("imported-1", "magnet", {
      role: "permanent_magnet",
      remanenceT: 1.2,
      magnetizationLocal: [0, 0, 1],
    });
    const raw = JSON.parse(localStorage.getItem("adelpha.partBindings.v1") ?? "{}");
    expect(raw["imported-1"].magnet.inSimulation).toBe(true);
    expect(raw["imported-1"].magnet.engineering.remanenceT).toBe(1.2);
    usePartInspectorStore.setState({
      bindings: {
        "imported-1": {
          magnet: {
            displayName: raw["imported-1"].magnet.displayName,
            sensorId: null,
            inSimulation: Boolean(raw["imported-1"].magnet.inSimulation),
            colorHex: null,
            groupId: null,
            engineering: {
              role: raw["imported-1"].magnet.engineering.role,
              remanenceT: raw["imported-1"].magnet.engineering.remanenceT,
              magnetizationLocal: raw["imported-1"].magnet.engineering.magnetizationLocal,
              magnetizationFrame: raw["imported-1"].magnet.engineering.magnetizationFrame,
              relativePermeability: raw["imported-1"].magnet.engineering.relativePermeability,
              conductivitySPerM: raw["imported-1"].magnet.engineering.conductivitySPerM,
            },
          },
        },
      },
    });
    const reloaded = usePartInspectorStore.getState().bindings["imported-1"]?.magnet;
    expect(reloaded?.inSimulation).toBe(true);
    expect(reloaded?.engineering.role).toBe("permanent_magnet");
    expect(reloaded?.engineering.remanenceT).toBe(1.2);
  });
});
