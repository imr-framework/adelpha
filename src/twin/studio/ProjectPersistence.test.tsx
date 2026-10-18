import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPersistence, useProjectState, useProjectRun, flushProject, finishProjectDeletion, prepareProjectDeletion, compactArchivedValue } from "./ProjectPersistence";
import { loadProjectState, saveProjectState, type SavedProject } from "./projectStorage";
vi.mock("./projectStorage", () => ({ loadProjectState: vi.fn(), saveProjectState: vi.fn() }));
const disk = new Map<string, SavedProject>();
function Study() {
  const [value, setValue] = useProjectState("test.value", "initial");
  const [result, setResult] = useProjectState("test.result", "");
  const capture = useProjectRun("test");
  return <><input aria-label="Setting" value={value} onChange={event => setValue(event.target.value)} /><output>{result}</output><button onClick={() => { const archive = capture(); setResult(value); archive("Test run", { "test.result": value }); }}>Run</button></>;
}
beforeEach(() => {
  disk.clear(); vi.resetAllMocks();
  vi.mocked(loadProjectState).mockImplementation(async id => structuredClone(disk.get(id) ?? { version: 1, values: {}, runs: [] }));
  vi.mocked(saveProjectState).mockImplementation(async (id, data) => { disk.set(id, structuredClone(data)); });
});
describe("durable project state", () => {
  it("restores edits and run history after closing and losing the memory cache", async () => {
    const view = render(<ProjectPersistence id="restart"><Study /></ProjectPersistence>);
    fireEvent.change(await screen.findByLabelText("Setting"), { target: { value: "10 mm" } });
    fireEvent.click(screen.getByText("Run"));
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "20 mm" } });
    fireEvent.click(screen.getByText("Run"));
    await act(() => flushProject("restart"));
    view.unmount(); finishProjectDeletion("restart", true); // Simulate a fresh JS session, retaining disk.
    render(<ProjectPersistence id="restart"><Study /></ProjectPersistence>);
    expect(await screen.findByLabelText("Setting")).toHaveValue("20 mm");
    expect(screen.getByText("20 mm", { selector: "output" })).toBeInTheDocument();
    expect(disk.get("restart")!.runs).toHaveLength(2);
    expect(disk.get("restart")!.runs[1].values["test.result"]).toBe("10 mm");
    expect(screen.queryByLabelText("Project run history")).not.toBeInTheDocument();
  });
  it("keeps project IDs isolated", async () => {
    const view = render(<ProjectPersistence id="one"><Study /></ProjectPersistence>);
    fireEvent.change(await screen.findByLabelText("Setting"), { target: { value: "only one" } });
    await act(() => flushProject("one")); view.unmount();
    render(<ProjectPersistence id="two"><Study /></ProjectPersistence>);
    expect(await screen.findByLabelText("Setting")).toHaveValue("initial");
  });
  it("does not overwrite data when opening storage fails", async () => {
    vi.mocked(loadProjectState).mockRejectedValue(new Error("unavailable"));
    render(<ProjectPersistence id="bad-read"><Study /></ProjectPersistence>);
    expect(await screen.findByText(/Could not open saved project/)).toBeInTheDocument();
    expect(saveProjectState).not.toHaveBeenCalled();
  });
  it("reports failed saves, blocks close, and retries without dropping history", async () => {
    render(<ProjectPersistence id="bad-write"><Study /></ProjectPersistence>);
    await screen.findByLabelText("Setting"); await act(() => flushProject("bad-write"));
    vi.mocked(saveProjectState).mockRejectedValue(new Error("quota"));
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "keep this" } });
    await screen.findByText(/Could not save this project/);
    await expect(flushProject("bad-write")).rejects.toThrow();
    vi.mocked(saveProjectState).mockImplementation(async (id, data) => { disk.set(id, structuredClone(data)); });
    fireEvent.click(screen.getByText("Retry save"));
    await waitFor(() => expect(disk.get("bad-write")?.values["test.value"]).toBe("keep this"));
  });
  it("prevents a deleted project's late setter from recreating saved data", async () => {
    render(<ProjectPersistence id="deleted"><Study /></ProjectPersistence>);
    await screen.findByLabelText("Setting"); await act(() => prepareProjectDeletion("deleted"));
    const count = vi.mocked(saveProjectState).mock.calls.length;
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "late" } });
    await act(() => flushProject("deleted"));
    expect(vi.mocked(saveProjectState).mock.calls.length).toBe(count);
  });
});

it("keeps run history without storing meshes and PNG blobs twice", async () => {
  function CoilStudy() {
    const capture = useProjectRun("gradient");
    return <button onClick={() => {
      const archive = capture();
      archive("Gradient coil", {
        "gradient.result": {
          loop_count: 4,
          mean_field_error: 1.2,
          layout: { wires: [[[0, 0, 0]]] },
          layout_png: "iVBORw0KGgo",
          surface_png: "iVBORw0KGgo",
          echo: [0, 1, 0],
        },
      });
    }}>Run</button>;
  }
  render(<ProjectPersistence id="coil-history"><CoilStudy /></ProjectPersistence>);
  await screen.findByText("Run");
  fireEvent.click(screen.getByText("Run"));
  await act(() => flushProject("coil-history"));
  const stored = disk.get("coil-history")!.runs[0]!.values["gradient.result"] as Record<string, unknown>;
  expect(stored.loop_count).toBe(4);
  expect(stored.mean_field_error).toBe(1.2);
  expect(stored.layout).toBeUndefined();
  expect(stored.layout_png).toBeUndefined();
  expect(stored.echo).toBeUndefined();
  expect(compactArchivedValue({ layout: { wires: [] }, loop_count: 2 })).toEqual({ loop_count: 2 });
});

it("keeps more than twenty historical runs", async () => {
  render(<ProjectPersistence id="many-runs"><Study /></ProjectPersistence>);
  await screen.findByLabelText("Setting");
  for (let i = 0; i < 25; i++) {
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: String(i) } });
    fireEvent.click(screen.getByText("Run"));
  }
  await act(() => flushProject("many-runs"));
  expect(disk.get("many-runs")?.runs).toHaveLength(25);
  expect(disk.get("many-runs")?.runs[24].values["test.value"]).toBe("0");
});

it("saves background results after close and refreshes a reopened project", async () => {
  let complete!: () => void;
  function AsyncStudy() {
    const [result, setResult] = useProjectState("background.result", "waiting");
    return <><output>{result}</output><button onClick={() => { complete = () => setResult("finished"); }}>Start</button></>;
  }
  const first = render(<ProjectPersistence id="background"><AsyncStudy /></ProjectPersistence>);
  fireEvent.click(await screen.findByText("Start"));
  await act(() => flushProject("background")); first.unmount();
  render(<ProjectPersistence id="background"><AsyncStudy /></ProjectPersistence>);
  await act(async () => { complete(); await flushProject("background"); });
  expect(await screen.findByText("finished", { selector: "output" })).toBeInTheDocument();
  expect(disk.get("background")?.values["background.result"]).toBe("finished");
});
