import { beforeEach, expect, it, vi } from "vitest";
import { deleteProject, readProjects, saveNewProject } from "./library";
import { removeProjectState } from "./projectStorage";
vi.mock("./projectStorage", () => ({ removeProjectState: vi.fn(), saveProjectState: vi.fn(), loadProjectState: vi.fn() }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.mocked(removeProjectState).mockReset().mockResolvedValue(); });
it("deletes only the chosen durable project and its legacy draft", async () => {
  const one = saveNewProject("one", { application: "hardware" });
  const two = saveNewProject("two", { application: "hardware" });
  sessionStorage.setItem(`adelpha-fem-step-${one.id}`, "legacy");
  await deleteProject(one.id);
  expect(removeProjectState).toHaveBeenCalledWith(one.id);
  expect(readProjects().map(p => p.id)).toEqual([two.id]);
  expect(sessionStorage.getItem(`adelpha-fem-step-${one.id}`)).toBeNull();
});
it("restores the catalog when durable deletion fails", async () => {
  const one = saveNewProject("keep", { application: "hardware" });
  vi.mocked(removeProjectState).mockRejectedValue(new Error("disk"));
  await expect(deleteProject(one.id)).rejects.toThrow("disk");
  expect(readProjects().some(p => p.id === one.id)).toBe(true);
});
