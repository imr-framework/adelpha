import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcquisitionStudio } from "./StudioApplication";

const simulateKoma = vi.fn();

vi.mock("../mri/api", () => ({
  fetchSequences: () => Promise.reject(new Error("offline")),
  simulateKoma: (...args: unknown[]) => simulateKoma(...args),
}));

describe("AcquisitionStudio KomaMRI suite", () => {
  beforeEach(() => {
    simulateKoma.mockReset();
  });

  it("runs the first brain EPI suite and shows the echo", async () => {
    simulateKoma.mockResolvedValue({
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
    expect(screen.getByRole("button", { name: /Balanced SSFP/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Field (T)")).toHaveValue(0.5);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(simulateKoma).toHaveBeenCalledWith(expect.objectContaining({ sequence: "se", b0_t: 0.5, inhomogeneity_ppm: 20 }));
    expect(await screen.findByText(/brain2D_axial/)).toBeInTheDocument();
    expect(screen.getByText(/6,506 spins/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Center echo magnitude" })).toBeInTheDocument();
    expect(screen.getByLabelText("Uniform")).toBeInTheDocument();
    expect(screen.queryByLabelText("Noise")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Noise" }));
    expect(screen.getByLabelText("Noise")).toBeInTheDocument();
    expect(screen.queryByLabelText("Uniform")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Field error" }));
    expect(screen.getByLabelText("Field error")).toBeInTheDocument();
  });

  it("shows a failure when KomaMRI cannot run", async () => {
    simulateKoma.mockRejectedValue(new Error("Julia is not installed. KomaMRI needs the julia executable."));
    render(<AcquisitionStudio projectName="Brain EPI" />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Julia is not installed");
  });
});
