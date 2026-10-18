import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import FemFieldPreview from "./FemFieldPreview";
import { fetchFemFields, type FemFields } from "../mri/api";
vi.mock("@react-three/fiber", () => ({ Canvas: () => <div>Field canvas</div>, useThree: vi.fn() }));
vi.mock("../mri/api", () => ({ fetchFemFields: vi.fn() }));
const field = { name: "test", unit: "T", values: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
const data: FemFields = { units: "m", source: "fields.vtu", points: field.values, fields: { B: field, H: { ...field, unit: "A/m" }, A: { ...field, unit: "T·m" } }, groups: [{ id: 2, name: "magnet", tetrahedra: [0, 1, 2, 3], triangles: [0, 1, 2] }] };
beforeEach(() => vi.resetAllMocks());
it("switches field units, sections and validates fixed ranges", async () => {
  vi.mocked(fetchFemFields).mockResolvedValue(data);
  render(<FemFieldPreview jobId="finished" />);
  await screen.findByText("Field Display");
  fireEvent.change(screen.getByLabelText("Field quantity"), { target: { value: "H" } });
  expect(screen.getByLabelText("Field color scale")).toHaveTextContent("A/m");
  fireEvent.click(screen.getByRole("button", { name: "Cross-section" }));
  expect(screen.getByLabelText("Section plane")).toBeVisible();
  expect(screen.getByLabelText("Include air")).toBeChecked();
  fireEvent.click(screen.getByText("Color range"));
  fireEvent.click(screen.getByLabelText("Fixed color range"));
  fireEvent.change(screen.getByLabelText("Color maximum"), { target: { value: "-1" } });
  expect(screen.getByRole("alert")).toHaveTextContent("maximum greater than the minimum");
  expect(fetchFemFields).toHaveBeenCalledWith("finished");
});
it("shows a retryable load failure without losing download guidance", async () => {
  vi.mocked(fetchFemFields).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(data);
  render(<FemFieldPreview jobId="finished" />);
  await screen.findByText("Unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Field Display");
});

it("docks controls outside the viewport and leaves section geometry off by default", async () => {
  vi.mocked(fetchFemFields).mockResolvedValue(data);
  const host = document.createElement("div"); document.body.appendChild(host);
  const view = render(<FemFieldPreview jobId="finished" controlsHost={host} />);
  await screen.findByText("Field Display");
  expect(host.querySelector('[aria-label="Field quantity"]')).not.toBeNull();
  expect(view.container.querySelector('[aria-label="Field quantity"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Surfaces" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Cross-section" })).toHaveAttribute("aria-pressed", "false");
  view.unmount(); host.remove();
});
