import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcquisitionStudio } from "./StudioApplication";

const simulateMr0 = vi.fn();

vi.mock("../mri/api", () => ({
  fetchSequences: () => Promise.reject(new Error("offline")),
  simulateMr0: (...args: unknown[]) => simulateMr0(...args),
}));

describe("AcquisitionStudio MRZero suite", () => {
  beforeEach(() => {
    simulateMr0.mockReset();
  });

  it("runs the 2D spin echo through MRZero and shows the echo", async () => {
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
    const listed = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    const spin = listed.findIndex((text) => text.includes("2D Spin-Echo"));
    const turbo = listed.findIndex((text) => text.includes("3D Turbo Spin-Echo"));
    expect(spin).toBeGreaterThanOrEqual(0);
    expect(turbo).toBeGreaterThan(spin);
    expect(listed.some((text) => text.includes("RF Spin-Echo"))).toBe(false);
    expect(listed.some((text) => text.includes("1D Spin-Echo"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Gradient echo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "On this scanner" })).not.toBeInTheDocument();
    expect(screen.getByText(/simulate one brain slice with MRZero/)).toBeInTheDocument();
    expect(screen.getByLabelText("TE (ms)")).toHaveValue(5);
    expect(screen.getByLabelText("FOV (mm)")).toHaveValue(64);
    expect(screen.queryByLabelText("ETL")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(simulateMr0).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: "se_2D", tr_ms: 100, te_ms: 5, averages: 1 }),
    );
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

    await userEvent.click(screen.getByRole("button", { name: /3D Turbo Spin-Echo/ }));
    expect(screen.getByLabelText("ETL")).toHaveValue(8);
    expect(screen.getByLabelText("Slices")).toHaveValue(8);
    expect(screen.queryByLabelText("PE Ordering")).not.toBeInTheDocument();
  });

  it("shows a failure when MRZero cannot run", async () => {
    simulateMr0.mockRejectedValue(new Error("MRZero simulation failed."));
    render(<AcquisitionStudio projectName="Brain EPI" />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MRZero simulation failed");
  });
});
