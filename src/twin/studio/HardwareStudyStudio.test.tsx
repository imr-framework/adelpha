import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEngineeringStore } from "../engineeringStore";
import { usePartInspectorStore } from "../partInspectorStore";
import { useAssemblyGeometryStore } from "./assemblyGeometryStore";
import { emptyEngineering } from "./engineering";
import { HardwareStudyStudio } from "./HardwareStudyStudio";
import { useHardwareStudyStore } from "./hardwareStudyStore";

const instance = {
  instanceId: "magnet",
  partId: "magnet",
  cadName: "Magnet",
  sourceAssetId: "halbach-48",
  geometryRevision: "rev-test",
  worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  translationM: [0, 0, 0] as [number, number, number],
  sizeM: [0.02, 0.02, 0.02] as [number, number, number],
  units: "m" as const,
  triangleCount: 12,
  vertexCount: 8,
  closed: true,
  degenerateFaces: 0,
  boundaryEdges: 0,
};

const simulateMagnetStudy = vi.fn();

vi.mock("../mri/api", () => ({
  simulateMagnetStudy: (...args: unknown[]) => simulateMagnetStudy(...args),
  validateMagnetStudy: vi.fn(),
}));

describe("HardwareStudyStudio", () => {
  beforeEach(() => {
    simulateMagnetStudy.mockReset();
    useHardwareStudyStore.setState({ projects: {} });
    useAssemblyGeometryStore.setState({ instances: { "halbach-48": [instance] } });
    useEngineeringStore.setState({ hardwareView: "magnet" });
    usePartInspectorStore.setState({
      catalog: { "halbach-48": [{ partId: "magnet", cadName: "Magnet" }] },
      bindings: {
        "halbach-48": {
          magnet: {
            displayName: "Ring magnet",
            sensorId: null,
            inSimulation: false,
            colorHex: null,
            groupId: null,
            engineering: emptyEngineering(),
          },
        },
      },
      hidden: {},
      selected: null,
      selection: [],
    });
  });

  it("keeps run disabled until a magnet is added and assigned, then submits included parts", async () => {
    simulateMagnetStudy.mockResolvedValue({
      ok: true,
      completed: true,
      title: "Magnet field",
      summary: "cuboid superposition",
      solver: "analytical-cuboid",
      approximations: ["Uniform magnetization inside each oriented bounding box."],
      diagnostics: [],
      limitation: "",
      included: ["magnet"],
      included_part_ids: ["magnet"],
      model_key: "k",
      field: { points: [[0, 0, 0]], bx: [0], by: [0], bz: [0.05], magnitude: [0.05], units: "T" },
      slice: { axis: "z", index: 0, width: 1, height: 1, values: [0.05], quantity: "|B|", units: "T" },
      vectors: { points: [[0, 0, 0]], components: [[0, 0, 0.05]], scale: 0.05 },
      probes: [{ position: [0, 0, 0], bT: [0, 0, 0.05], magnitudeT: 0.05 }],
      homogeneity: {
        roi: { centerM: [0, 0, 0], sizeM: [0.08, 0.08, 0.08], samples: [17, 17, 17] },
        referenceT: 0.05,
        metric: "ppm",
        meanT: 0.05,
        peakToPeakT: 0,
        stdT: 0,
        ppmPeakToPeak: 0,
        ppmRms: 0,
      },
      mesh: null,
      elapsed_s: 0.2,
    });

    render(<HardwareStudyStudio projectId="proj-1" projectName="Halbach 0.5 T" study="magnet" />);
    expect(screen.getByRole("button", { name: "Run study" })).toBeDisabled();
    expect(screen.getByText(/Nothing is added to simulation/)).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Add to simulation"));
    expect(usePartInspectorStore.getState().bindings["halbach-48"]?.magnet.inSimulation).toBe(true);
    expect(screen.getByRole("button", { name: "Run study" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Ring magnet/ }));
    await userEvent.selectOptions(screen.getByLabelText("Engineering role"), "permanent_magnet");
    await userEvent.clear(screen.getByLabelText("Remanence (T)"));
    await userEvent.type(screen.getByLabelText("Remanence (T)"), "1.2");
    await userEvent.clear(screen.getByLabelText("Magnetization direction z"));
    await userEvent.type(screen.getByLabelText("Magnetization direction z"), "1");

    expect(screen.getByRole("button", { name: "Run study" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Run study" }));
    expect(simulateMagnetStudy).toHaveBeenCalledWith(
      expect.objectContaining({
        study: "magnet",
        parts: expect.arrayContaining([expect.objectContaining({ partId: "magnet", remanenceT: 1.2 })]),
      }),
    );
    expect(await screen.findByText(/Mean \|B\|/)).toBeInTheDocument();
    expect(screen.getAllByText(/50.000 mT/).length).toBeGreaterThan(0);
  });

  it("does not remove a hidden part from the submitted model", async () => {
    usePartInspectorStore.setState({
      bindings: {
        "halbach-48": {
          magnet: {
            displayName: "Ring magnet",
            sensorId: null,
            inSimulation: true,
            colorHex: null,
            groupId: null,
            engineering: { ...emptyEngineering(), role: "permanent_magnet", remanenceT: 1.2, magnetizationLocal: [0, 0, 1] },
          },
        },
      },
    });
    simulateMagnetStudy.mockResolvedValue({
      ok: true,
      completed: true,
      title: "Magnet field",
      summary: "ok",
      solver: "analytical-cuboid",
      approximations: [],
      diagnostics: [],
      limitation: "",
      included: ["magnet"],
      included_part_ids: ["magnet"],
      model_key: "k",
      field: null,
      slice: null,
      vectors: null,
      probes: [],
      homogeneity: null,
      mesh: null,
      elapsed_s: 0.1,
    });
    render(<HardwareStudyStudio projectId="proj-1" projectName="Halbach 0.5 T" study="magnet" />);
    await userEvent.click(screen.getByTitle("Hide in viewport"));
    expect(usePartInspectorStore.getState().hidden["halbach-48"]).toContain("magnet");
    await userEvent.click(screen.getByRole("button", { name: "Run study" }));
    expect(simulateMagnetStudy).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([expect.objectContaining({ partId: "magnet" })]),
      }),
    );
  });
});
