import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElmerStepStudio } from "./ElmerStepStudio";
import { uploadFemStep, startFemJob, fetchFemJob, downloadFemJob } from "../mri/api";
vi.mock("./FemMeshPreview", () => ({ default: ({ jobId }: { jobId: string }) => <div>Generated mesh {jobId}</div> }));
vi.mock("./FemFieldPreview", () => ({ default: ({ jobId }: { jobId: string }) => <div>Computed fields {jobId}</div> }));
const preview = vi.hoisted(() => ({ fail: false }));
vi.mock("./FemStepPreview", () => ({ default: () => { if (preview.fail) throw new Error("Preview module failed to load"); return <div>STEP preview</div>; } }));
vi.mock("../mri/api", () => ({ uploadFemStep: vi.fn(), startFemJob: vi.fn(), fetchFemJob: vi.fn(), downloadFemJob: vi.fn() }));
const uploaded = { id: "upload1", filename: "magnet.step", units: "m" as const, solids: [{ index: 1, label: "Magnet cube", bounds_m: [0, 0, 0, .01, .01, .01], center_m: [.005, .005, .005], volume_m3: .000001 }] };
async function upload() { fireEvent.change(screen.getByLabelText("STEP file"), { target: { files: [new File(["STEP"], "magnet.step")] } }); await screen.findByText("Magnet cube"); }
beforeEach(() => { vi.resetAllMocks(); preview.fail = false; sessionStorage.clear(); vi.mocked(uploadFemStep).mockResolvedValue(uploaded); });
describe("Elmer STEP workflow", () => {
  it("requires materials, converts mm to metres, runs and downloads results", async () => {
    vi.mocked(startFemJob).mockResolvedValue({ id: "job1", status: "queued" });
    vi.mocked(fetchFemJob).mockResolvedValue({ id: "job1", status: "completed", mesh: { nodes: 300, tetrahedra: 1000, quality: { minimum: .4, mean: .8 } } });
    render(<ElmerStepStudio projectId="p1" projectName="My magnet" />);
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
    await upload();
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Solid 1 material"), { target: { value: "magnet" } });
    fireEvent.click(screen.getByRole("button", { name: /Geometry & mesh/ }));
    fireEvent.change(screen.getByLabelText("Part mesh size (mm)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await screen.findAllByText("Simulation complete");
    expect(startFemJob).toHaveBeenCalledWith("upload1", expect.objectContaining({ mesh: expect.objectContaining({ size: .001, air_padding: .06 }), materials: { solid_1: { relative_permeability: 1.05, remanence: [0, 0, 1.2] } } }));
    fireEvent.click(screen.getByRole("button", { name: "Download results & logs" }));
    await waitFor(() => expect(downloadFemJob).toHaveBeenCalledWith("job1"));
  });
  it("shows solver errors and permits retry", async () => {
    vi.mocked(startFemJob).mockResolvedValue({ id: "job1", status: "queued" });
    vi.mocked(fetchFemJob).mockResolvedValue({ id: "job1", status: "failed", error: "Mesh quality check failed" });
    render(<ElmerStepStudio projectId="p1" projectName="My magnet" />);
    await upload();
    fireEvent.change(screen.getByLabelText("Solid 1 material"), { target: { value: "magnet" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await screen.findByText("Mesh quality check failed");
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download diagnostic logs" })).toBeEnabled();
  });
  it("rejects invalid mesh sizes and does not reuse replaced solid assignments", async () => {
    render(<ElmerStepStudio projectId="p1" projectName="My magnet" />);
    await upload();
    fireEvent.change(screen.getByLabelText("Solid 1 material"), { target: { value: "magnet" } });
    fireEvent.click(screen.getByRole("button", { name: /Geometry & mesh/ }));
    fireEvent.change(screen.getByLabelText("Part mesh size (mm)"), { target: { value: "-1" } });
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Part mesh size (mm)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Parts & roles/ }));
    await upload();
    await waitFor(() => expect(screen.getByLabelText("Solid 1 material")).toHaveValue(""));
  });
  it("restores and polls a running project after returning", async () => {
    sessionStorage.setItem("adelpha-fem-step-p1", JSON.stringify({ upload: uploaded, assignments: { 1: { kind: "magnet", mu: 1, br: [0, 0, 1] } }, job: { id: "job1", status: "solving" } }));
    vi.mocked(fetchFemJob).mockResolvedValue({ id: "job1", status: "completed" });
    render(<ElmerStepStudio projectId="p1" projectName="My magnet" />);
    await screen.findAllByText("Simulation complete");
    expect(fetchFemJob).toHaveBeenCalledWith("job1");
  });
});

it("contains preview failures while keeping STEP input usable", async () => {
  preview.fail = true;
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ElmerStepStudio projectId="preview-failure" projectName="FEM" />);
  await screen.findByText("Preview unavailable. You can still import your STEP file and run the simulation.");
  expect(screen.getByLabelText("STEP file")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
  consoleError.mockRestore();
});

it("enables generated mesh visualization only after meshing", async () => {
  vi.mocked(startFemJob).mockResolvedValue({ id: "mesh-job", status: "queued" });
  vi.mocked(fetchFemJob).mockResolvedValue({ id: "mesh-job", status: "completed", mesh_available: true });
  render(<ElmerStepStudio projectId="mesh-test" projectName="FEM" />);
  expect(screen.getByRole("button", { name: "Mesh view" })).toBeDisabled();
  await upload();
  fireEvent.change(screen.getByLabelText("Solid 1 material"), { target: { value: "magnet" } });
  fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Mesh view" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Mesh view" }));
  await screen.findByText("Generated mesh mesh-job");
  fireEvent.click(screen.getByRole("button", { name: "CAD view" }));
  await screen.findByText("STEP preview");
});

it("opens saved completed fields without starting a new simulation", async () => {
  sessionStorage.setItem("adelpha-fem-step-existing", JSON.stringify({ job: { id: "old-job", status: "completed" } }));
  render(<ElmerStepStudio projectId="existing" projectName="Saved result" />);
  fireEvent.click(screen.getByRole("button", { name: "Results" }));
  await screen.findByText("Computed fields old-job");
  expect(startFemJob).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "CAD view" }));
  await screen.findByText("STEP preview");
});

it("collapses the project drawer without losing simulation state", async () => {
  render(<ElmerStepStudio projectId="drawer" projectName="Twin magnet study" />);
  await upload();
  fireEvent.change(screen.getByLabelText("Solid 1 material"), { target: { value: "magnet" } });
  fireEvent.click(screen.getByRole("button", { name: "Collapse project drawer" }));
  expect(screen.queryByRole("navigation", { name: "Study preparation" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run simulation" })).toBeEnabled();
  expect(sessionStorage.getItem("fem-drawer-drawer")).toBe("closed");
  fireEvent.click(screen.getByRole("button", { name: "Expand project drawer" }));
  expect(screen.getByText("CURRENT STUDY")).toBeVisible();
  expect(screen.getByLabelText("Solid 1 material")).toHaveValue("magnet");
});
