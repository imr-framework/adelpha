import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HalbachMagnetStudio } from "./HalbachMagnetStudio";

const designHalbach = vi.fn();
const exportHalbachCad = vi.fn();

vi.mock("../mri/api", () => ({
  designHalbach: (...args: unknown[]) => designHalbach(...args),
  exportHalbachCad: (...args: unknown[]) => exportHalbachCad(...args),
}));

vi.mock("../../desktop/saveFile", () => ({
  saveBlob: vi.fn().mockResolvedValue("halbach-assembly.stl"),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="halbach-canvas" />,
  useThree: () => ({ camera: { position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} } }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

const completed = {
  ok: true as const,
  title: "Halbach cylinder",
  summary: "Parameterized Halbach cylinder.",
  inner_radius_mm: 80,
  length_mm: 88,
  magnet_mm: 12,
  br_t: 1.3,
  mur: 1,
  magnets: 16,
  rings: 5,
  ring_sep_mm: 22,
  outer_ring: true,
  outer_offset_mm: 21,
  outer_extra: 7,
  ring_count: 10,
  magnet_count: 195,
  slice_count: 5,
  geometry_mode: "uniform" as const,
  cubes: [{ x: 0.08, y: 0, z: 0, angle: 0, size: 0.012 }],
  plates: [
    {
      index: 0,
      z: 0,
      inner_radius: 0.068,
      outer_radius: 0.131,
      height: 0.012,
      stand_width: 0,
      stand_height: 0,
    },
  ],
  rods: [],
  elapsed_s: 0.01,
};

describe("HalbachMagnetStudio", () => {
  beforeEach(() => {
    designHalbach.mockReset();
    exportHalbachCad.mockReset();
  });

  it("generates a Halbach cylinder and shows cube counts", async () => {
    designHalbach.mockResolvedValue(completed);
    render(<HalbachMagnetStudio projectName="Halbach 0.5 T" />);
    expect(screen.getByLabelText("Inner radius (mm)")).toHaveValue(80);
    expect(screen.getByRole("checkbox", { name: "Outer Halbach ring" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Generate array" }));
    expect(designHalbach).toHaveBeenCalledWith(
      expect.objectContaining({
        inner_radius_mm: 80,
        magnets: 16,
        rings: 5,
        outer_ring: true,
      }),
    );
    expect(await screen.findByRole("region", { name: "Halbach cylinder layout" })).toBeInTheDocument();
    expect(screen.getByText("195")).toBeInTheDocument();
    expect(screen.getByText(/inner and outer rings/)).toBeInTheDocument();
  });

  it("does not run a magnet field study and explains that it is coming soon", async () => {
    render(<HalbachMagnetStudio projectName="Halbach 0.5 T" />);
    await userEvent.click(screen.getByRole("button", { name: "Run study" }));
    expect(designHalbach).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Magnet field simulation is coming soon.");
  });

  it("shows a failure when the designer cannot run", async () => {
    designHalbach.mockRejectedValue(new Error("Halbach sources are not available in this install."));
    render(<HalbachMagnetStudio projectName="Halbach 0.5 T" />);
    await userEvent.click(screen.getByRole("button", { name: "Generate array" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Halbach sources are not available in this install.");
  });

  it("opens a geometry card and applies the O'Reilly catalog", async () => {
    designHalbach.mockResolvedValue({ ...completed, geometry_mode: "catalog", magnet_count: 2674 });
    render(<HalbachMagnetStudio projectName="Halbach 0.5 T" />);
    await userEvent.click(screen.getByRole("button", { name: "Edit geometry…" }));
    expect(screen.getByRole("dialog", { name: "Halbach geometry" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load O'Reilly 27 cm" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply geometry" }));
    await userEvent.click(screen.getByRole("button", { name: "Generate array" }));
    expect(designHalbach.mock.calls[0][0].geometry.rings).toHaveLength(26);
    expect(designHalbach.mock.calls[0][0].geometry.slices).toHaveLength(11);
    expect(designHalbach.mock.calls[0][0].geometry.mirrorSlices).toBe(true);
  });

  it("switches the inspect view to the mechanical assembly", async () => {
    designHalbach.mockResolvedValue(completed);
    render(<HalbachMagnetStudio projectName="Halbach 0.5 T" />);
    await userEvent.click(screen.getByRole("button", { name: "Generate array" }));
    await userEvent.click(screen.getByRole("button", { name: "Assembly view" }));
    expect(screen.getByRole("button", { name: "Assembly view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/slice plates, stands, and connection rods/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assembly STL" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Slice STEP" })).toBeEnabled();
  });
});
