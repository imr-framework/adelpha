import { describe, expect, it } from "vitest";

import {
  createFromExample,
  featuredProject,
  formatOpened,
  formatRelative,
  groupProjects,
  hasSetupDestination,
  matchesProjectClass,
  projectClass,
  projectDetail,
  projectPreviewSrc,
  recencyGroup,
  saveNewProject,
  seedProjects,
  sortProjects,
  tutorialPreviewSrc,
  visibleProjects,
  type StudioProject,
} from "./library";

function project(patch: Partial<StudioProject>): StudioProject {
  return {
    id: patch.id ?? "p1",
    name: patch.name ?? "Study",
    updatedAt: patch.updatedAt ?? 100,
    kind: patch.kind ?? "user",
    discipline: patch.discipline ?? "Hardware",
    parts: patch.parts ?? 0,
    application: patch.application ?? "hardware",
    openedAt: patch.openedAt,
    lastView: patch.lastView,
    primaryClass: patch.primaryClass,
    catalogParts: patch.catalogParts,
    includedParts: patch.includedParts,
    preview: patch.preview,
    summary: patch.summary,
  };
}

describe("studio project library", () => {
  it("maps stored types onto project-class badges without using the name", () => {
    expect(projectClass(project({ application: "acquisition" }))).toBe("acq");
    expect(projectClass(project({ application: "reconstruction" }))).toBe("recon");
    expect(projectClass(project({ lastView: "magnet" }))).toBe("magnet");
    expect(projectClass(project({ lastView: "fem" }))).toBe("magnet");
    expect(projectClass(project({ lastView: "gradients" }))).toBe("gradient");
    expect(projectClass(project({ discipline: "Gradients" }))).toBe("gradient");
    expect(projectClass(project({ lastView: "shimming" }))).toBe("shimming");
    expect(projectClass(project({ lastView: "assembly" }))).toBe("assembly");
    expect(projectClass(project({ discipline: "RF" }))).toBe("rf");
    expect(projectClass(project({ lastView: "assembly", primaryClass: "magnet" }))).toBe("magnet");
    expect(projectClass(project({ name: "Birdcage RF", lastView: "assembly" }))).toBe("assembly");
    expect(matchesProjectClass(project({ application: "reconstruction" }), "all")).toBe(true);
    expect(matchesProjectClass(project({ application: "reconstruction" }), "acq")).toBe(false);
    expect(projectClass(seedProjects()[0]!)).toBe("magnet");
    expect(projectClass(seedProjects()[1]!)).toBe("gradient");
    expect(projectClass(seedProjects()[2]!)).toBe("assembly");
  });

  it("keeps assembly and standalone metadata distinct and puts engines in details", () => {
    expect(projectDetail(project({ catalogParts: 12, includedParts: 9 }))).toBe("12 parts · 9 included");
    expect(projectDetail(project({ lastView: "gradients" }))).toBe("Standalone design · PyCoilGen");
    expect(projectDetail(project({ application: "acquisition" }))).toBe("Acquisition simulation · MRzero");
    expect(projectDetail(project({ lastView: "shimming" }))).toBe("Optimization study");
    expect(projectDetail(project({ lastView: "fem" }))).toBe("Magnet field study · Elmer");
    expect(projectDetail(project({ parts: 0, lastView: "assembly" }))).toBe("Assembly study");
  });

  it("filters, searches, and sorts together", () => {
    const rows = [
      project({ id: "a", name: "Delta v2", application: "hardware", updatedAt: 30, lastView: "magnet" }),
      project({ id: "b", name: "Gradient coil", lastView: "gradients", updatedAt: 20 }),
      project({ id: "c", name: "Spin echo", application: "acquisition", updatedAt: 10 }),
    ];
    expect(visibleProjects(rows, "", "gradient", "modified").map((row) => row.id)).toEqual(["b"]);
    expect(visibleProjects(rows, "acq", "all", "modified").map((row) => row.id)).toEqual(["c"]);
    expect(visibleProjects(rows, "mrzero", "all", "modified").map((row) => row.id)).toEqual(["c"]);
    expect(visibleProjects(rows, "", "all", "name").map((row) => row.name)).toEqual([
      "Delta v2",
      "Gradient coil",
      "Spin echo",
    ]);
    expect(sortProjects(rows, "modified").map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("groups filtered projects by local recency and omits empty sections", () => {
    const now = new Date(2026, 9, 10, 15).getTime();
    const weekStartsOn = 0;
    const rows = [
      project({ id: "today", name: "Today", updatedAt: new Date(2026, 9, 10, 11).getTime() }),
      project({ id: "yesterday", name: "Yesterday", updatedAt: new Date(2026, 9, 9, 18).getTime() }),
      project({ id: "week", name: "Thursday", updatedAt: new Date(2026, 9, 8, 9).getTime() }),
      project({ id: "older", name: "Last week", updatedAt: new Date(2026, 9, 2, 9).getTime() }),
    ];
    expect(recencyGroup(rows[0]!.updatedAt, now, weekStartsOn)).toBe("today");
    expect(recencyGroup(rows[1]!.updatedAt, now, weekStartsOn)).toBe("yesterday");
    expect(recencyGroup(rows[2]!.updatedAt, now, weekStartsOn)).toBe("week");
    expect(recencyGroup(rows[3]!.updatedAt, now, weekStartsOn)).toBe("older");
    expect(groupProjects(rows, now, weekStartsOn).map((group) => [group.id, group.projects.map((item) => item.id)])).toEqual([
      ["today", ["today"]],
      ["yesterday", ["yesterday"]],
      ["week", ["week"]],
      ["older", ["older"]],
    ]);
    expect(groupProjects(rows.slice(0, 1), now, weekStartsOn).map((group) => group.id)).toEqual(["today"]);
  });

  it("features the most recently opened user project and hides setup for standalone work", () => {
    const hardware = project({ id: "hw", openedAt: 10, lastView: "assembly" });
    const later = project({ id: "acq", application: "acquisition", openedAt: 50 });
    expect(featuredProject([hardware, later])?.id).toBe("acq");
    expect(featuredProject(seedProjects())).toBeNull();
    expect(hasSetupDestination(hardware)).toBe(true);
    expect(hasSetupDestination(later)).toBe(false);
    expect(hasSetupDestination(project({ lastView: "gradients" }))).toBe(false);
  });

  it("copies an example into a separate user project", () => {
    const example = seedProjects()[0]!;
    const copy = createFromExample(example);
    expect(copy.kind).toBe("user");
    expect(copy.id).not.toBe(example.id);
    expect(copy.name).toBe(example.name);
    expect(copy.application).toBe(example.application);
    expect(copy.primaryClass).toBe("magnet");
    expect(saveNewProject("GRE", { application: "acquisition" }).discipline).toBe("Acquisition");
    expect(saveNewProject("GRE", { application: "acquisition" }).primaryClass).toBe("acq");
  });

  it("uses the type-specific pictures from project_previews", () => {
    expect(projectPreviewSrc(project({ lastView: "magnet" }))).toBe("/project_previews/magnet.png");
    expect(projectPreviewSrc(project({ lastView: "gradients" }))).toBe("/project_previews/gradient_coil.png");
    expect(projectPreviewSrc(project({ application: "acquisition" }))).toBe("/project_previews/mrzero.png");
    expect(projectPreviewSrc(project({ discipline: "RF" }))).toBe("/project_previews/rf_coil.png");
    expect(projectPreviewSrc(seedProjects()[0]!)).toBe("/project_previews/magnet.png");
    expect(projectPreviewSrc(seedProjects()[1]!)).toBe("/project_previews/gradient_coil.png");
    expect(tutorialPreviewSrc({ id: "tour", title: "Navigate the studio", duration: "2 min", summary: "" })).toBe(
      "/project_previews/magnet.png",
    );
    expect(tutorialPreviewSrc({ id: "assemble", title: "Place a component", duration: "4 min", summary: "" })).toBe(
      "/project_previews/rf_coil.png",
    );
    expect(tutorialPreviewSrc({ id: "field", title: "Inspect a field study", duration: "5 min", summary: "" })).toBe(
      "/project_previews/mrzero.png",
    );
    expect(
      tutorialPreviewSrc({
        id: "halbach-dt",
        title: "Make a Halbach digital twin",
        duration: "5 min",
        summary: "",
        preview: "/project_previews/make_halbach_dt.png",
      }),
    ).toBe("/project_previews/make_halbach_dt.png");
    expect(
      tutorialPreviewSrc({
        id: "delta-dt",
        title: "Set the Delta digital twin",
        duration: "3 min",
        summary: "",
        preview: "/project_previews/set_delta_dt.png",
      }),
    ).toBe("/project_previews/set_delta_dt.png");
  });

  it("formats opened and modified times from stored dates", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(formatRelative(now, now)).toBe("Today");
    expect(formatRelative(now - 86_400_000, now)).toBe("Yesterday");
    expect(formatOpened(now, now)).toBe("Last opened today");
  });
});
