import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PassiveShimStudio } from "./PassiveShimStudio";

const simulateShim = vi.fn();
const inspectShimFieldMap = vi.fn();
const exportShimTrays = vi.fn();
const pickFieldMapFile = vi.fn();
const pickExportDirectory = vi.fn();
const saveBlob = vi.fn();

vi.mock("../mri/api", () => ({
  simulateShim: (...args: unknown[]) => simulateShim(...args),
  inspectShimFieldMap: (...args: unknown[]) => inspectShimFieldMap(...args),
  exportShimTrays: (...args: unknown[]) => exportShimTrays(...args),
}));

vi.mock("../../desktop/pickFieldMapFile", () => ({
  pickFieldMapFile: () => pickFieldMapFile(),
}));

vi.mock("../../desktop/pickExportDirectory", () => ({
  pickExportDirectory: () => pickExportDirectory(),
}));

vi.mock("../../desktop/runtime", () => ({
  isTauri: () => true,
}));

vi.mock("../../desktop/saveFile", () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args),
}));

const NPY_MAGIC = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="shim-canvas" />,
  useThree: () => ({ camera: { position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} } }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

const field = {
  source: "Exp_1044_2026831.npy",
  samples: 3071,
  mean_mt: 251.6617,
  p2p_mt: 3.5242,
  p2p_khz: 150.052,
  std_ppm: 2336.4,
  extent_mm: { x: [-36, 36], y: [-36, 36], z: [-36, 36] },
  points: [
    [0, 0, 0],
    [0.01, 0, 0],
  ],
  before_mt: [250, 253],
};

const trays = {
  diameter_mm: 203.3,
  bottom_mm: -48.5,
  top_mm: 48.5,
  magnet_mm: 6.35,
  thickness_mm: 3.18,
  polarization_t: 1.2,
  radial_spacing: 1,
  azimuthal_spacing: 1.25,
};

function simulation(source: string) {
  return {
    ok: true,
    title: "Passive shim trays",
    summary: `Iterated-greedy passive shim on two circular trays. The bore field is ${source}.`,
    field: { ...field, source, after_mt: [251, 251.5] },
    ...trays,
    pre_std_ppm: 2336.4,
    post_std_ppm: 1069.6,
    pre_p2p_mt: 3.524,
    post_p2p_mt: 4.394,
    n_positive: 13,
    n_negative: 44,
    magnet_size_mm: [6.35, 6.35, 3.18],
    states: [1, 0, -1],
    magnets: [{ position: [0.01, 0, 0.0485], polarity: 1 }],
    elapsed_s: 11.6,
  };
}

describe("PassiveShimStudio", () => {
  beforeEach(() => {
    simulateShim.mockReset();
    inspectShimFieldMap.mockReset();
    exportShimTrays.mockReset();
    pickFieldMapFile.mockReset();
    pickExportDirectory.mockReset();
    saveBlob.mockReset();
  });

  it("runs the synthetic field when no map is loaded", async () => {
    simulateShim.mockResolvedValue(simulation("synthetic"));

    render(<PassiveShimStudio projectName="Shim trays" />);
    expect(screen.getByLabelText("Diameter (mm)")).toHaveValue(203.3);
    expect(screen.getByLabelText("Bottom (mm)")).toHaveValue(-48.5);
    expect(screen.getByLabelText("Polarization (T)")).toHaveValue(1.2);
    expect(screen.getByText(/No field map loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));

    expect(simulateShim).toHaveBeenCalledWith(expect.objectContaining({ ...trays, center_map: true }));
    expect(simulateShim.mock.calls[0][0]).not.toHaveProperty("field_map");
    expect(await screen.findByRole("region", { name: "Passive shim trays" })).toBeInTheDocument();
    expect(screen.getByText(/57 magnets/)).toBeInTheDocument();
    expect(screen.getByText(/13 positive/)).toBeInTheDocument();
    expect(screen.getByText(/1070 ppm after, was 2336/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save trays" })).toBeInTheDocument();
  });

  it("saves the trays to a chosen folder", async () => {
    simulateShim.mockResolvedValue(simulation("synthetic"));
    pickExportDirectory.mockResolvedValue("/Users/me/shim-trays");
    exportShimTrays.mockResolvedValue({
      ok: true,
      title: "Shim tray export",
      folder: "/Users/me/shim-trays",
      files: [{ name: "shim_tray_top.stl" }, { name: "shim_tray_bottom.stl" }],
    });

    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));
    await userEvent.click(screen.getByRole("button", { name: "Save trays" }));

    expect(exportShimTrays).toHaveBeenCalledWith(
      expect.objectContaining({
        ...trays,
        center_map: true,
        states: [1, 0, -1],
        destination: "/Users/me/shim-trays",
      }),
    );
    const toast = await screen.findByLabelText("Saved to shim-trays");
    expect(toast).toHaveClass("shim-toast");
    expect(toast).toHaveAttribute("title", "/Users/me/shim-trays");
  });

  it("keeps the current trays when the save dialog is cancelled", async () => {
    simulateShim.mockResolvedValue(simulation("synthetic"));
    pickExportDirectory.mockResolvedValue(null);
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));
    await userEvent.click(screen.getByRole("button", { name: "Save trays" }));
    expect(exportShimTrays).not.toHaveBeenCalled();
  });

  it("loads a field map, inspects it, then shims it", async () => {
    inspectShimFieldMap.mockResolvedValue({ ok: true, title: "Field map", field });
    simulateShim.mockResolvedValue(simulation("Exp_1044_2026831.npy"));

    pickFieldMapFile.mockResolvedValue(new File([NPY_MAGIC], "Exp_1044_2026831.npy"));

    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Load field map" }));

    const stats = await screen.findByLabelText("Field map summary");
    expect(screen.getByRole("button", { name: "Replace field map" })).toBeInTheDocument();
    expect(inspectShimFieldMap).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Exp_1044_2026831.npy", data_b64: "k05VTVBZ" }),
      true,
    );
    expect(stats).toHaveTextContent("3,071");
    expect(stats).toHaveTextContent("251.662 mT");
    expect(stats).toHaveTextContent("3.524 mT · 150.1 kHz");
    expect(stats).toHaveTextContent("2,336 ppm");
    expect(stats).toHaveTextContent("-36.0 to 36.0 mm");
    expect(screen.getByRole("region", { name: "Passive shim trays" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Field view" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));
    expect(simulateShim).toHaveBeenCalledWith(
      expect.objectContaining({
        ...trays,
        center_map: true,
        field_map: expect.objectContaining({ name: "Exp_1044_2026831.npy" }),
      }),
    );
    expect(await screen.findByText(/57 magnets/)).toBeInTheDocument();
    const views = screen.getByRole("group", { name: "Field view" });
    expect(views).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shimmed" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Measured" }));
    expect(screen.getByRole("button", { name: "Measured" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Remove field map" }));
    expect(screen.getByText(/No field map loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load field map" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Passive shim trays" })).not.toBeInTheDocument();
  });

  it("keeps the current map when the dialog is cancelled", async () => {
    pickFieldMapFile.mockResolvedValue(null);
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Load field map" }));
    expect(inspectShimFieldMap).not.toHaveBeenCalled();
    expect(screen.getByText(/No field map loaded/)).toBeInTheDocument();
  });

  it("re-inspects when centering changes", async () => {
    inspectShimFieldMap.mockResolvedValue({ ok: true, title: "Field map", field });
    pickFieldMapFile.mockResolvedValue(new File([NPY_MAGIC], "map.npy"));
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Load field map" }));
    await screen.findByLabelText("Field map summary");
    await userEvent.click(screen.getByLabelText("Center the map between the trays"));
    expect(inspectShimFieldMap).toHaveBeenLastCalledWith(expect.objectContaining({ name: "map.npy" }), false);
  });

  it("shows a failure when the field map cannot be read", async () => {
    inspectShimFieldMap.mockRejectedValue(new Error("The field map must be a NumPy .npy file."));
    pickFieldMapFile.mockResolvedValue(new File(["hello"], "notes.npy"));
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Load field map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("must be a NumPy .npy file");
  });

  it("shows a failure when passive shimming cannot run", async () => {
    simulateShim.mockRejectedValue(new Error("Passive shimming is not installed."));
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Passive shimming is not installed");
  });
});
