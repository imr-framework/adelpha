export type StudioProjectKind = "sample" | "user";

export type StudioProject = {
  id: string;
  name: string;
  updatedAt: number;
  kind: StudioProjectKind;
  discipline: string;
  parts: number;
};

export type StudioTutorial = {
  id: string;
  title: string;
  duration: string;
  summary: string;
};

export type StudioPlugin = {
  id: string;
  name: string;
  summary: string;
};

const PROJECTS_KEY = "adelpha.studio.projects";
const PLUGINS_KEY = "adelpha.studio.plugins";
const DAY = 86_400_000;

export const TUTORIALS: readonly StudioTutorial[] = [
  {
    id: "tour",
    title: "Navigate the studio",
    duration: "2 min",
    summary: "Orbit, pan, and frame an assembly without losing the part you care about.",
  },
  {
    id: "assemble",
    title: "Place a component",
    duration: "4 min",
    summary: "Add a part to the floor and keep the simulation set to only what you need.",
  },
  {
    id: "materials",
    title: "Assign materials",
    duration: "3 min",
    summary: "Give a surface a metal, composite, or coating and read it back from the inspector.",
  },
  {
    id: "field",
    title: "Inspect a field study",
    duration: "5 min",
    summary: "Open a result, compare the bore, and see where the map leaves specification.",
  },
];

export const PLUGINS: readonly StudioPlugin[] = [
  { id: "field-mapper", name: "Field Mapper", summary: "Harmonic B0 maps on the bore." },
  { id: "shim-optimizer", name: "Shim Optimizer", summary: "Passive shim trays and iron placement." },
  { id: "thermal-solver", name: "Thermal Solver", summary: "Coil, cryostat, and gradient heat." },
  { id: "rf-budget", name: "RF Budget", summary: "Transmit and receive chain margins." },
  { id: "emi-kit", name: "EMI Kit", summary: "Shielding, seams, and ingress paths." },
  { id: "material-library", name: "Material Library", summary: "Grades, coatings, and magnet wire." },
];

export function seedProjects(now = Date.now()): StudioProject[] {
  return [
    {
      id: "sample-halbach",
      name: "Halbach 0.5 T",
      updatedAt: now - DAY,
      kind: "sample",
      discipline: "Magnet",
      parts: 24,
    },
    {
      id: "sample-gradient",
      name: "Gradient coil stack",
      updatedAt: now - 3 * DAY,
      kind: "sample",
      discipline: "Gradients",
      parts: 11,
    },
    {
      id: "sample-cryostat",
      name: "Cryostat envelope",
      updatedAt: now - 12 * DAY,
      kind: "sample",
      discipline: "Cryostat",
      parts: 8,
    },
  ];
}

function isStudioProject(value: unknown): value is StudioProject {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.updatedAt === "number" &&
    typeof row.discipline === "string" &&
    typeof row.parts === "number" &&
    (row.kind === "sample" || row.kind === "user")
  );
}

function writeProjects(projects: StudioProject[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    /* private mode / blocked storage */
  }
}

/** Saved studies only. Example starters stay in code so a first launch is not a fake history. */
export function readProjects(): StudioProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStudioProject).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `project-${Date.now().toString(36)}`;
}

export function saveNewProject(name: string): StudioProject {
  const project: StudioProject = {
    id: nextId(),
    name: name.trim(),
    updatedAt: Date.now(),
    kind: "user",
    discipline: "Project",
    parts: 0,
  };
  const existing = readProjects();
  writeProjects([project, ...existing.filter((item) => item.id !== project.id)]);
  return project;
}

export function touchProject(id: string): StudioProject | null {
  const existing = readProjects();
  const found = existing.find((item) => item.id === id);
  if (!found) return null;
  const next = { ...found, updatedAt: Date.now() };
  writeProjects([next, ...existing.filter((item) => item.id !== id)]);
  return next;
}

export function readInstalledPluginIds(): string[] {
  try {
    const raw = localStorage.getItem(PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function setPluginInstalled(id: string, installed: boolean): string[] {
  const current = new Set(readInstalledPluginIds());
  if (installed) current.add(id);
  else current.delete(id);
  const next = [...current];
  try {
    localStorage.setItem(PLUGINS_KEY, JSON.stringify(next));
  } catch {
    /* private mode / blocked storage */
  }
  return next;
}

export function formatEdited(updatedAt: number, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - updatedAt) / DAY);
  if (days < 1) return "Edited today";
  if (days === 1) return "Edited yesterday";
  if (days < 14) return `Edited ${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "Edited 1 week ago" : `Edited ${weeks} weeks ago`;
}

export function formatParts(parts: number): string {
  return parts === 1 ? "1 part" : `${parts} parts`;
}
