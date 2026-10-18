import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RfCoilStudio } from "./RfCoilStudio";

const simulateRfCoil = vi.fn();
const saveBlob = vi.fn();

vi.mock("../mri/api", () => ({
  simulateRfCoil: (...args: unknown[]) => simulateRfCoil(...args),
}));

vi.mock("../../desktop/saveFile", () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="coil-canvas" />,
  useThree: () => ({ camera: { position: { set() {} }, lookAt() {}, updateProjectionMatrix() {} } }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

const completed = {
  ok: true as const,
  generator_version: 1,
  title: "Solenoid RF coil",
  summary: "Integer winding pattern for a uniform on-axis B1 solenoid.",
  radius_mm: 30,
  length_mm: 180,
  former_mm: 5,
  grooves: 45,
  freq_mhz: 10.64,
  allow_bucking: true,
  n_max: 1,
  mean_field_error: 2.4,
  error_definition: "Maximum relative |B1 − target| / target on axis over 80% of coil length",
  inductance_uh: 12.5,
  q_factor: 180,
  tuning_pf: 18.2,
  wire_length_m: 4.2,
  forward_turns: 20,
  bucking_turns: 4,
  layout: {
    vertices: [
      [0, 0, -0.09],
      [0.03, 0, 0],
      [0, 0.03, 0.09],
    ],
    faces: [[0, 1, 2]],
    colors: [
      [0.6, 0.58, 0.66],
      [0.6, 0.58, 0.66],
      [0.6, 0.58, 0.66],
    ],
    wires: [{ group: 0, closed: true, points: [[0.03, 0, 0], [0, 0.03, 0], [-0.03, 0, 0], [0, -0.03, 0]] }],
    wire_radius: 0.00044,
    stream_min: -1,
    stream_max: 1,
  },
  layout_png: "side-view",
  surface_png: "field-figure",
  field_png: "field-figure",
  loop_count: 24,
  elapsed_s: 0.8,
};

describe("RfCoilStudio", () => {
  beforeEach(() => {
    simulateRfCoil.mockReset();
    saveBlob.mockReset();
  });

  it("runs a solenoid and shows the winding, side view, and field figure", async () => {
    simulateRfCoil.mockResolvedValue(completed);
    render(<RfCoilStudio projectName="Solenoid RF coil" />);
    expect(screen.getByLabelText("Inner radius (mm)")).toHaveValue(30);
    expect(screen.getByLabelText("Length (mm)")).toHaveValue(180);
    expect(screen.getByRole("checkbox", { name: "Allow bucking turns" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Run design" }));

    expect(simulateRfCoil).toHaveBeenCalledWith(
      expect.objectContaining({
        radius_mm: 30,
        length_mm: 180,
        former_mm: 5,
        grooves: 45,
        freq_mhz: 10.64,
        allow_bucking: true,
        n_max: 1,
      }),
    );
    expect(await screen.findByRole("region", { name: "Solenoid RF coil layout" })).toBeInTheDocument();
    expect(screen.getByText(/Drag to rotate · closed circular turns/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Side view" }));
    expect(screen.getByRole("img", { name: "Solenoid RF coil side view" })).toHaveAttribute("src", "data:image/png;base64,side-view");
    await userEvent.click(screen.getByRole("button", { name: "Field quality" }));
    expect(screen.getByRole("img", { name: "Solenoid RF coil field quality" })).toHaveAttribute(
      "src",
      "data:image/png;base64,field-figure",
    );
    await userEvent.click(screen.getByRole("button", { name: "3D windings" }));
    expect(screen.getByRole("region", { name: "Solenoid RF coil layout" })).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("12.50")).toBeInTheDocument();
    expect(screen.getByText("2.4", { selector: ".ws-metric-value" })).toBeInTheDocument();
    expect(screen.getByText(/Review the reported 2.4% max error/)).toBeInTheDocument();
  });

  it("saves the winding STL after a completed design", async () => {
    saveBlob.mockResolvedValue("/tmp/rf-solenoid.stl");
    simulateRfCoil.mockResolvedValue(completed);
    render(<RfCoilStudio projectName="Solenoid RF coil" />);
    expect(screen.getByRole("button", { name: "Save STL" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Run design" }));
    await screen.findByRole("region", { name: "Solenoid RF coil layout" });
    await userEvent.click(screen.getByRole("button", { name: "Save STL" }));
    expect(saveBlob).toHaveBeenCalledWith("rf-solenoid.stl", expect.any(Blob));
  });

  it("shows a failure when the optimizer cannot run", async () => {
    simulateRfCoil.mockRejectedValue(new Error("The RF coil environment is missing."));
    render(<RfCoilStudio projectName="Solenoid RF coil" />);
    await userEvent.click(screen.getByRole("button", { name: "Run design" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The RF coil environment is missing.");
  });
});
