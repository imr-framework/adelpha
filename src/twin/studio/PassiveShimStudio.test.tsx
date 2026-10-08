import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PassiveShimStudio } from "./PassiveShimStudio";

const simulateShim = vi.fn();

vi.mock("../mri/api", () => ({
  simulateShim: (...args: unknown[]) => simulateShim(...args),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="shim-canvas" />,
  useThree: () => ({ camera: { position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} } }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

describe("PassiveShimStudio", () => {
  beforeEach(() => {
    simulateShim.mockReset();
  });

  it("runs two circular trays and shows the placed magnets", async () => {
    simulateShim.mockResolvedValue({
      ok: true,
      title: "Passive shim trays",
      summary: "Iterated-greedy passive shim on two circular trays. The bore field is synthetic.",
      diameter_mm: 152,
      offset_mm: 48.5,
      dsv_mm: 70,
      candidates: 20,
      steps: 40,
      pre_std_ppm: 28033.2,
      post_std_ppm: 18884.8,
      pre_p2p_mt: 6,
      post_p2p_mt: 4.9,
      n_positive: 5,
      n_negative: 6,
      magnet_mm: [6.35, 6.35, 3.18],
      magnets: [{ position: [0.01, 0, 0.0485], polarity: 1 }],
      elapsed_s: 1.2,
    });

    render(<PassiveShimStudio projectName="Shim trays" />);
    expect(screen.getByLabelText("Diameter (mm)")).toHaveValue(152);
    expect(screen.getByText(/N45/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));

    expect(simulateShim).toHaveBeenCalledWith(
      expect.objectContaining({ diameter_mm: 152, offset_mm: 48.5, dsv_mm: 70, candidates: 20, steps: 40 }),
    );
    expect(await screen.findByRole("region", { name: "Passive shim trays" })).toBeInTheDocument();
    expect(screen.getByText(/11 magnets/)).toBeInTheDocument();
    expect(screen.getByText(/5 positive/)).toBeInTheDocument();
    expect(screen.getByText(/18885 ppm after, was 28033/)).toBeInTheDocument();
  });

  it("shows a failure when passive shimming cannot run", async () => {
    simulateShim.mockRejectedValue(new Error("Passive shimming is not installed."));
    render(<PassiveShimStudio projectName="Shim trays" />);
    await userEvent.click(screen.getByRole("button", { name: "Run shimming" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Passive shimming is not installed");
  });
});
