import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GradientCoilStudio } from "./GradientCoilStudio";

const simulateCoil = vi.fn();

vi.mock("../mri/api", () => ({
  simulateCoil: (...args: unknown[]) => simulateCoil(...args),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="coil-canvas" />,
  useThree: () => ({ camera: { position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} } }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

describe("GradientCoilStudio", () => {
  beforeEach(() => {
    simulateCoil.mockReset();
  });

  it("runs a Y gradient and shows pyCoilGen's layout", async () => {
    simulateCoil.mockResolvedValue({
      ok: true,
      axis: "y",
      title: "Y gradient",
      summary: "pyCoilGen stream function and wire groups on a cylinder.",
      radius_mm: 140,
      length_mm: 280,
      levels: 10,
      gradient_mt_m: 10,
      achieved_mt_m: 0.34,
      mean_field_error: 1.2,
      layout: {
        vertices: [
          [0, 0, -0.1],
          [0.1, 0, 0],
          [0, 0.1, 0.1],
        ],
        faces: [[0, 1, 2]],
        colors: [
          [0.2, 0.1, 0.4],
          [0.1, 0.6, 0.4],
          [0.9, 0.9, 0.2],
        ],
        wires: [{ group: 0, closed: false, points: [[0, 0, -0.1], [0.1, 0, 0]] }],
        wire_radius: 0.002,
        stream_min: -12,
        stream_max: 18,
      },
      layout_png: "layout-figure",
      surface_png: "surface",
      loop_count: 1,
      elapsed_s: 0.4,
    });

    render(<GradientCoilStudio projectName="Gradient coil stack" />);
    expect(screen.getByLabelText("Radius (mm)")).toHaveValue(140);
    expect(screen.getByRole("button", { name: /Y gradient/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(simulateCoil).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "cylinder", axis: "y", radius_mm: 140, length_mm: 280, levels: 10, gradient_mt_m: 10 }),
    );
    expect(await screen.findByRole("region", { name: "Y gradient layout" })).toBeInTheDocument();
    expect(screen.getByText("Drag to orbit")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "3D layout" }));
    expect(screen.getByRole("img", { name: "Y gradient 3D layout" })).toHaveAttribute("src", "data:image/png;base64,layout-figure");
    await userEvent.click(screen.getByRole("button", { name: "Surface" }));
    expect(screen.getByRole("img", { name: "Y gradient surface" })).toHaveAttribute("src", "data:image/png;base64,surface");
    await userEvent.click(screen.getByRole("button", { name: "Orbit" }));
    expect(screen.getByRole("region", { name: "Y gradient layout" })).toBeInTheDocument();
    expect(screen.getByText(/1 loop/)).toBeInTheDocument();
    expect(screen.getByText(/0.34 mT\/m\/A/)).toBeInTheDocument();
    expect(screen.getByText(/mean error 120%/)).toBeInTheDocument();
  });

  it("switches the former to a planar plate", async () => {
    simulateCoil.mockResolvedValue({
      ok: true,
      shape: "planar",
      axis: "y",
      title: "Y gradient",
      summary: "pyCoilGen stream function and wire groups on a planar plate.",
      radius_mm: 140,
      length_mm: 280,
      width_mm: 250,
      height_mm: 250,
      gap_mm: 200,
      levels: 10,
      gradient_mt_m: 10,
      achieved_mt_m: 0.2,
      mean_field_error: 1.1,
      layout: {
        vertices: [
          [0, 0, 0],
          [0.1, 0, 0],
          [0, 0.1, 0],
        ],
        faces: [[0, 1, 2]],
        colors: [
          [0.2, 0.1, 0.4],
          [0.1, 0.6, 0.4],
          [0.9, 0.9, 0.2],
        ],
        wires: [{ group: 0, closed: false, points: [[0, 0, 0], [0.1, 0, 0]] }],
        wire_radius: 0.002,
        stream_min: -1,
        stream_max: 1,
      },
      layout_png: "layout-figure",
      surface_png: "surface",
      loop_count: 4,
      elapsed_s: 0.5,
    });

    render(<GradientCoilStudio projectName="Gradient coil stack" />);
    expect(screen.getByRole("button", { name: /Cylinder/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Planar/ }));
    expect(screen.getByLabelText("Width (mm)")).toHaveValue(250);
    expect(screen.getByLabelText("Height (mm)")).toHaveValue(250);
    expect(screen.queryByLabelText("Length (mm)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Biplanar/ }));
    expect(screen.getByLabelText("Gap (mm)")).toHaveValue(200);
    await userEvent.click(screen.getByRole("button", { name: /Circular/ }));
    expect(screen.getByLabelText("Radius (mm)")).toHaveValue(140);
    expect(screen.queryByLabelText("Gap (mm)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Planar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(simulateCoil).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "planar", axis: "y", width_mm: 250, height_mm: 250, levels: 10, gradient_mt_m: 10 }),
    );
  });

  it("shows a failure when pyCoilGen cannot run", async () => {
    simulateCoil.mockRejectedValue(new Error("pyCoilGen is not installed."));
    render(<GradientCoilStudio projectName="Gradient coil stack" />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pyCoilGen is not installed");
  });
});
