import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcquisitionStudio, sliceSourceIndex } from "./StudioApplication";
import { requestUseAcquisitionParameters } from "../acquisitionHandoff";

const simulateMr0 = vi.fn();

vi.mock("../mri/api", () => ({
  fetchSequences: () => Promise.reject(new Error("offline")),
  simulateMr0: (...args: unknown[]) => simulateMr0(...args),
}));

vi.mock("../acquisitionHandoff", () => ({
  requestUseAcquisitionParameters: vi.fn(),
}));

describe("AcquisitionStudio MRZero suite", () => {
  beforeEach(() => {
    simulateMr0.mockReset();
    vi.mocked(requestUseAcquisitionParameters).mockReset();
  });

  it("runs the 2D spin echo through MRZero and shows the image", async () => {
    simulateMr0.mockResolvedValue({
      ok: true,
      suite: "low-field",
      title: "Spin echo",
      summary: "Low-field Bloch simulation",
      phantom: "brain2D_axial",
      spins: 6506,
      profiles: 28,
      samples_per_profile: 28,
      scanner_b0_t: 0.5,
      gmax_mt_m: 15,
      inhomogeneity_ppm: 20,
      sequence: "Spin echo",
      sequence_id: "se",
      tr_ms: 80,
      te_ms: 16,
      flip_deg: 90,
      averages: 1,
      voxel_mm: 7.9,
      fov_mm: 220,
      matrix: 28,
      bandwidth_hz: 160,
      scan_time_s: 2.2,
      snr: 12,
      elapsed_s: 4.2,
      echo: [0, 0.4, 1, 0.2],
      image: { width: 2, height: 2, values: [0, 0.5, 1, 0.25] },
      noisy_image: { width: 2, height: 2, values: [0.1, 0.4, 0.9, 0.3] },
      inhomogeneous_image: { width: 2, height: 2, values: [0, 0.2, 0.7, 0.1] },
      reconstruction_error: "",
    });

    render(<AcquisitionStudio projectName="Brain EPI" />);
    expect(screen.getByRole("combobox", { name: "Sequence" })).toHaveValue("se_2D");
    expect(screen.getByRole("option", { name: "2D Spin-Echo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3D Turbo Spin-Echo" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "On this scanner" })).not.toBeInTheDocument();
    expect(screen.getByText(/simulate one brain slice with MRZero/)).toBeInTheDocument();
    expect(screen.getByLabelText("TE (ms)")).toHaveValue(5);
    expect(screen.getByLabelText("FOV (mm)")).toHaveValue(64);
    expect(screen.queryByLabelText("ETL")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(simulateMr0).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: "se_2D", tr_ms: 100, te_ms: 5, averages: 1 }),
    );
    expect(await screen.findByLabelText("Uniform")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Center echo magnitude" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Uniform")).toBeInTheDocument();
    expect(screen.queryByLabelText("Noise")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Noise" }));
    expect(screen.getByLabelText("Noise")).toBeInTheDocument();
    expect(screen.queryByLabelText("Uniform")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Field error" }));
    expect(screen.getByLabelText("Field error")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sequence" }), "tse_3D");
    expect(screen.getByLabelText("ETL")).toHaveValue(8);
    expect(screen.getByLabelText("Slices")).toHaveValue(8);
    expect(screen.queryByLabelText("PE Ordering")).not.toBeInTheDocument();
  });

  it("places numpy row 0 at the bottom of the slice canvas", () => {
    expect(sliceSourceIndex(0, 0, 2, 2)).toBe(2);
    expect(sliceSourceIndex(1, 0, 2, 2)).toBe(3);
    expect(sliceSourceIndex(0, 1, 2, 2)).toBe(0);
    expect(sliceSourceIndex(1, 1, 2, 2)).toBe(1);
  });

  it("sends the simulated sequence to Imaging Console", async () => {
    render(<AcquisitionStudio projectName="Ace_demo" />);
    await userEvent.click(screen.getByRole("button", { name: "Use parameters" }));
    expect(requestUseAcquisitionParameters).toHaveBeenCalledWith({
      sequence: "se_2D",
      protocol_name: "Ace_demo",
      parameters: expect.objectContaining({ TE: 5, TR: 100, FOV: 64, Orientation: "Axial" }),
    });
  });

  it("shows a failure when MRZero cannot run", async () => {
    simulateMr0.mockRejectedValue(new Error("MRZero simulation failed."));
    render(<AcquisitionStudio projectName="Brain EPI" />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MRZero simulation failed");
  });
});
