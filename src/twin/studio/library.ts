export type StudioProjectKind = "sample" | "user";
export type StudioApplication = "hardware" | "acquisition" | "reconstruction";
export type StudioLastView = "assembly" | "magnet" | "fem" | "gradients" | "shimming";
export type StudioProjectClass = "acq" | "magnet" | "gradient" | "rf" | "shimming" | "assembly" | "recon";
export type StudioSort = "modified" | "name";
export type StudioRecencyGroup = "today" | "yesterday" | "week" | "older";

export type StudioProject = {
  id: string;
  name: string;
  updatedAt: number;
  kind: StudioProjectKind;
  discipline: string;
  parts: number;
  application: StudioApplication;
  openedAt?: number;
  lastView?: StudioLastView;
  primaryClass?: StudioProjectClass;
  catalogParts?: number;
  includedParts?: number;
  preview?: string;
  summary?: string;
};

export const PROJECT_CLASS_META: Record<
  StudioProjectClass,
  { badge: string; label: string }
> = {
  acq: { badge: "Acq", label: "Acquisition" },
  magnet: { badge: "Magnet", label: "Magnet" },
  gradient: { badge: "Gradient", label: "Gradient" },
  rf: { badge: "RF", label: "RF" },
  shimming: { badge: "Shimming", label: "Shimming" },
  assembly: { badge: "Assembly", label: "Assembly" },
  recon: { badge: "Recon", label: "Reconstruction" },
};

export const PROJECT_CLASS_FILTERS: readonly { id: "all" | StudioProjectClass; badge: string; label: string }[] = [
  { id: "all", badge: "All", label: "All" },
  { id: "acq", badge: "Acq", label: "Acquisition" },
  { id: "magnet", badge: "Magnet", label: "Magnet" },
  { id: "gradient", badge: "Gradient", label: "Gradient" },
  { id: "rf", badge: "RF", label: "RF" },
  { id: "shimming", badge: "Shimming", label: "Shimming" },
  { id: "assembly", badge: "Assembly", label: "Assembly" },
  { id: "recon", badge: "Recon", label: "Reconstruction" },
];

export const RECENCY_GROUPS: readonly { id: StudioRecencyGroup; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Earlier this week" },
  { id: "older", label: "Older" },
];

export const APPLICATIONS: readonly {
  id: StudioApplication;
  label: string;
  summary: string;
}[] = [
  {
    id: "hardware",
    label: "Hardware",
    summary: "Magnet, RF coils, and gradient coils together.",
  },
  {
    id: "acquisition",
    label: "Data acquisition",
    summary: "Pulse sequences and the data they collect.",
  },
  {
    id: "reconstruction",
    label: "Reconstruction",
    summary: "Images reconstructed from acquired data.",
  },
];

export type StudioTutorial = {
  id: string;
  title: string;
  duration: string;
  summary: string;
  preview?: string;
};

export type StudioPlugin = {
  id: string;
  name: string;
  summary: string;
};

const PROJECTS_KEY = "adelpha.studio.projects";
const PLUGINS_KEY = "adelpha.studio.plugins";
const PREVIEWS_KEY = "adelpha.studio.previews";
const DAY = 86_400_000;

export const STUDIO_DOCS_URL = "https://imr-framework.github.io/adelpha/";

export const TUTORIALS: readonly StudioTutorial[] = [
  {
    id: "halbach-dt",
    title: "Make a Halbach digital twin",
    duration: "5 min",
    summary: "Import a Halbach GLB in Settings → 3D Model, or choose a bundled 48 / 47 / 64 mT magnet for the twin viewport.",
    preview: "/project_previews/make_halbach_dt.png",
  },
  {
    id: "delta-dt",
    title: "Set the Delta digital twin",
    duration: "3 min",
    summary: "Choose the bundled Delta v2 assembly in Settings → 3D Model so the twin and console show that magnet.",
    preview: "/project_previews/set_delta_dt.png",
  },
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

export const PROJECT_TYPE_PREVIEWS = {
  magnet: "/project_previews/magnet.png",
  coil: "/project_previews/gradient_coil.png",
  rf: "/project_previews/rf_coil.png",
  shim: "/project_previews/magnet.png",
  acquisition: "/project_previews/mrzero.png",
  reconstruction: "/project_previews/mrzero.png",
  cryostat: "/project_previews/magnet.png",
} as const;

export function seedProjects(now = Date.now()): StudioProject[] {
  return [
    {
      id: "sample-halbach",
      name: "Halbach 0.5 T",
      updatedAt: now - DAY,
      kind: "sample",
      discipline: "Magnet",
      parts: 24,
      application: "hardware",
      lastView: "assembly",
      primaryClass: "magnet",
      catalogParts: 24,
      includedParts: 24,
      summary: "Permanent magnet assembly",
    },
    {
      id: "sample-gradient",
      name: "Gradient coil stack",
      updatedAt: now - 3 * DAY,
      kind: "sample",
      discipline: "Gradients",
      parts: 11,
      application: "hardware",
      lastView: "gradients",
      primaryClass: "gradient",
      summary: "Standalone gradient design",
    },
    {
      id: "sample-cryostat",
      name: "Cryostat envelope",
      updatedAt: now - 12 * DAY,
      kind: "sample",
      discipline: "Cryostat",
      parts: 8,
      application: "hardware",
      lastView: "assembly",
      primaryClass: "assembly",
      catalogParts: 8,
      includedParts: 8,
      summary: "Vacuum vessel and cooling",
    },
  ];
}

function isApplication(value: unknown): value is StudioApplication {
  return value === "hardware" || value === "acquisition" || value === "reconstruction";
}

function isLastView(value: unknown): value is StudioLastView {
  return value === "assembly" || value === "magnet" || value === "fem" || value === "gradients" || value === "shimming";
}

export function isProjectClass(value: unknown): value is StudioProjectClass {
  return (
    value === "acq" ||
    value === "magnet" ||
    value === "gradient" ||
    value === "rf" ||
    value === "shimming" ||
    value === "assembly" ||
    value === "recon"
  );
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

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeProject(row: StudioProject): StudioProject {
  const preview = typeof row.preview === "string" && row.preview.length > 0 ? row.preview : undefined;
  const summary = typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : undefined;
  return {
    ...row,
    application: isApplication(row.application) ? row.application : "hardware",
    openedAt: typeof row.openedAt === "number" ? row.openedAt : undefined,
    lastView: isLastView(row.lastView) ? row.lastView : undefined,
    primaryClass: isProjectClass(row.primaryClass) ? row.primaryClass : undefined,
    catalogParts: asCount(row.catalogParts),
    includedParts: asCount(row.includedParts),
    preview,
    summary,
  };
}

export function disciplineFor(application: StudioApplication): string {
  if (application === "acquisition") return "Acquisition";
  if (application === "reconstruction") return "Reconstruction";
  return "Hardware";
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
    return parsed.filter(isStudioProject).map(normalizeProject).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `project-${Date.now().toString(36)}`;
}

export function saveNewProject(
  name: string,
  choice: {
    application: StudioApplication;
    lastView?: StudioLastView;
    primaryClass?: StudioProjectClass;
    discipline?: string;
    preview?: string;
    summary?: string;
  },
): StudioProject {
  const application = choice.application;
  const now = Date.now();
  const lastView = choice.lastView ?? defaultLastView(application);
  const discipline = choice.discipline ?? disciplineFor(application);
  const project: StudioProject = {
    id: nextId(),
    name: name.trim(),
    updatedAt: now,
    openedAt: now,
    kind: "user",
    discipline,
    parts: 0,
    application,
    lastView,
    primaryClass: choice.primaryClass ?? deriveProjectClass(application, lastView, discipline),
    preview: choice.preview,
    summary: choice.summary,
  };
  const existing = readProjects();
  writeProjects([project, ...existing.filter((item) => item.id !== project.id)]);
  return project;
}

export function createFromExample(example: StudioProject): StudioProject {
  return saveNewProject(example.name, {
    application: example.application,
    lastView: example.lastView ?? inferLastView(example),
    primaryClass: projectClass(example),
    discipline: example.discipline,
    summary: example.summary,
  });
}

export function syncProjectParts(id: string, parts: number): StudioProject | null {
  return patchProject(id, { parts, includedParts: parts }, { touchUpdated: true });
}

export function syncProjectAssembly(
  id: string,
  counts: { catalogParts: number; includedParts: number },
): StudioProject | null {
  return patchProject(
    id,
    {
      parts: counts.catalogParts,
      catalogParts: counts.catalogParts,
      includedParts: counts.includedParts,
    },
    { touchUpdated: true },
  );
}

export function touchProject(id: string): StudioProject | null {
  return patchProject(id, { openedAt: Date.now() }, { touchUpdated: false });
}

export function rememberProjectView(id: string, lastView: StudioLastView): StudioProject | null {
  return patchProject(id, { lastView }, { touchUpdated: false });
}

export function rememberProjectPreview(id: string, preview: string): StudioProject | null {
  writePreview(id, preview);
  return patchProject(id, { preview }, { touchUpdated: false });
}

function patchProject(
  id: string,
  patch: Partial<StudioProject>,
  options: { touchUpdated: boolean },
): StudioProject | null {
  const existing = readProjects();
  const found = existing.find((item) => item.id === id);
  if (!found) return null;
  const next = {
    ...found,
    ...patch,
    updatedAt: options.touchUpdated ? Date.now() : found.updatedAt,
  };
  const unchanged =
    next.updatedAt === found.updatedAt &&
    next.openedAt === found.openedAt &&
    next.lastView === found.lastView &&
    next.parts === found.parts &&
    next.catalogParts === found.catalogParts &&
    next.includedParts === found.includedParts &&
    next.preview === found.preview;
  if (unchanged) return found;
  writeProjects(existing.map((item) => (item.id === id ? next : item)));
  return next;
}

export function featuredProject(projects: StudioProject[]): StudioProject | null {
  const user = projects.filter((project) => project.kind === "user");
  if (user.length === 0) return null;
  return [...user].sort((a, b) => lastOpenedAt(b) - lastOpenedAt(a))[0] ?? null;
}

export function lastOpenedAt(project: StudioProject): number {
  return project.openedAt ?? project.updatedAt;
}

export function defaultLastView(application: StudioApplication): StudioLastView | undefined {
  return application === "hardware" ? "assembly" : undefined;
}

export function inferLastView(project: StudioProject): StudioLastView | undefined {
  if (isLastView(project.lastView)) return project.lastView;
  if (project.application !== "hardware") return undefined;
  if (project.discipline === "Gradients") return "gradients";
  return "assembly";
}

export function deriveProjectClass(
  application: StudioApplication,
  lastView?: StudioLastView,
  discipline?: string,
): StudioProjectClass {
  if (application === "acquisition") return "acq";
  if (application === "reconstruction") return "recon";
  if (lastView === "gradients" || discipline === "Gradients") return "gradient";
  if (lastView === "shimming" || discipline === "Shimming") return "shimming";
  if (lastView === "magnet" || lastView === "fem") return "magnet";
  if (discipline === "RF") return "rf";
  if (discipline === "Magnet") return "magnet";
  return "assembly";
}

export function projectClass(project: StudioProject): StudioProjectClass {
  if (isProjectClass(project.primaryClass)) return project.primaryClass;
  return deriveProjectClass(project.application, inferLastView(project), project.discipline);
}

export function projectClassMeta(project: StudioProject) {
  return PROJECT_CLASS_META[projectClass(project)];
}

export function matchesProjectClass(project: StudioProject, filter: "all" | StudioProjectClass): boolean {
  if (filter === "all") return true;
  return projectClass(project) === filter;
}

export function engineLabel(project: StudioProject): string | undefined {
  if (project.application === "acquisition") return "MRzero";
  if (project.application === "reconstruction") return "MRzero";
  const view = inferLastView(project);
  if (view === "gradients" || project.discipline === "Gradients") return "PyCoilGen";
  if (view === "fem") return "Elmer";
  return undefined;
}

export function studyTypeLabel(project: StudioProject): string {
  return engineLabel(project) ?? projectClassMeta(project).label;
}

export function isStandaloneProject(project: StudioProject): boolean {
  if (project.application !== "hardware") return true;
  const view = inferLastView(project);
  return view === "gradients" || view === "shimming";
}

export function hasSetupDestination(project: StudioProject): boolean {
  if (project.application !== "hardware") return false;
  const view = inferLastView(project);
  return view === "assembly" || view === "magnet" || view === "fem";
}

export function setupViewFor(project: StudioProject): StudioLastView {
  return inferLastView(project) === "fem" ? "fem" : "magnet";
}

export function projectDetail(project: StudioProject): string {
  const engine = engineLabel(project);
  const withEngine = (detail: string) => (engine && !detail.includes(engine) ? `${detail} · ${engine}` : detail);
  if (project.application === "acquisition") return withEngine("Acquisition simulation");
  if (project.application === "reconstruction") return withEngine("Reconstruction study");
  const view = inferLastView(project);
  if (view === "gradients") return withEngine(project.summary ?? "Standalone design");
  if (view === "shimming") return withEngine(project.summary ?? "Optimization study");
  const catalog = project.catalogParts ?? (project.includedParts == null ? undefined : project.parts);
  const included = project.includedParts ?? (project.catalogParts == null ? project.parts : undefined);
  if (catalog != null && included != null && (catalog > 0 || included > 0)) {
    return withEngine(`${formatParts(catalog)} · ${included} included`);
  }
  if (included != null && included > 0) return withEngine(`${included} included`);
  if (catalog != null && catalog > 0) return withEngine(formatParts(catalog));
  if (project.parts > 0) return withEngine(formatParts(project.parts));
  return withEngine(project.summary ?? (projectClass(project) === "magnet" ? "Magnet field study" : "Assembly study"));
}

export function matchesQuery(project: StudioProject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const cls = projectClassMeta(project);
  const haystack = [
    project.name,
    project.discipline,
    cls.badge,
    cls.label,
    engineLabel(project) ?? "",
    projectDetail(project),
    project.summary ?? "",
    project.application,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function sortProjects(projects: StudioProject[], sort: StudioSort): StudioProject[] {
  const next = [...projects];
  if (sort === "name") {
    next.sort((a, b) => a.name.localeCompare(b.name) || b.updatedAt - a.updatedAt);
    return next;
  }
  next.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  return next;
}

export function visibleProjects(
  projects: StudioProject[],
  query: string,
  filter: "all" | StudioProjectClass,
  sort: StudioSort,
): StudioProject[] {
  return sortProjects(
    projects.filter((project) => project.kind === "user" && matchesQuery(project, query) && matchesProjectClass(project, filter)),
    sort,
  );
}

export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function localeWeekStartsOn(): number {
  try {
    const tag = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    const locale = new Intl.Locale(tag);
    const info =
      "getWeekInfo" in locale && typeof locale.getWeekInfo === "function"
        ? locale.getWeekInfo()
        : "weekInfo" in locale
          ? (locale as Intl.Locale & { weekInfo?: { firstDay: number } }).weekInfo
          : undefined;
    if (info?.firstDay == null) return 0;
    return info.firstDay === 7 ? 0 : info.firstDay;
  } catch {
    return 0;
  }
}

export function startOfLocalWeek(ms: number, weekStartsOn = localeWeekStartsOn()): number {
  const date = new Date(startOfLocalDay(ms));
  const day = date.getDay();
  date.setDate(date.getDate() - ((day - weekStartsOn + 7) % 7));
  return date.getTime();
}

export function recencyGroup(
  updatedAt: number,
  now = Date.now(),
  weekStartsOn = localeWeekStartsOn(),
): StudioRecencyGroup {
  const day = startOfLocalDay(updatedAt);
  const today = startOfLocalDay(now);
  if (day >= today) return "today";
  if (day >= today - DAY) return "yesterday";
  if (day >= startOfLocalWeek(now, weekStartsOn)) return "week";
  return "older";
}

export function groupProjects(
  projects: StudioProject[],
  now = Date.now(),
  weekStartsOn = localeWeekStartsOn(),
): { id: StudioRecencyGroup; label: string; projects: StudioProject[] }[] {
  const buckets: Record<StudioRecencyGroup, StudioProject[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };
  for (const project of projects) {
    buckets[recencyGroup(project.updatedAt, now, weekStartsOn)].push(project);
  }
  return RECENCY_GROUPS.filter((group) => buckets[group.id].length > 0).map((group) => ({
    ...group,
    projects: buckets[group.id],
  }));
}

export function formatModifiedDate(updatedAt: number, now = Date.now()): string {
  const group = recencyGroup(updatedAt, now);
  const date = new Date(updatedAt);
  if (group === "today") return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (group === "yesterday" || group === "week") return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function readPreviewMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PREVIEWS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writePreview(id: string, preview: string) {
  try {
    localStorage.setItem(PREVIEWS_KEY, JSON.stringify({ ...readPreviewMap(), [id]: preview }));
  } catch {
    /* quota / private mode */
  }
}

export function readProjectPreview(id: string): string | undefined {
  return readPreviewMap()[id];
}

export function projectPreviewSrc(project: StudioProject): string {
  return PROJECT_TYPE_PREVIEWS[previewKind(project)];
}

export function tutorialPreviewSrc(tutorial: StudioTutorial): string {
  if (tutorial.preview) return tutorial.preview;
  if (tutorial.id === "field") return PROJECT_TYPE_PREVIEWS.acquisition;
  if (tutorial.id === "assemble") return PROJECT_TYPE_PREVIEWS.rf;
  return PROJECT_TYPE_PREVIEWS.magnet;
}

export function tutorialOpensModelSettings(tutorial: StudioTutorial): boolean {
  return tutorial.id === "halbach-dt" || tutorial.id === "delta-dt";
}

export function previewKind(
  project: StudioProject,
): keyof typeof PROJECT_TYPE_PREVIEWS {
  const cls = projectClass(project);
  if (cls === "acq") return "acquisition";
  if (cls === "recon") return "reconstruction";
  if (cls === "rf") return "rf";
  if (cls === "gradient") return "coil";
  if (cls === "shimming") return "shim";
  if (project.discipline === "Cryostat") return "cryostat";
  return "magnet";
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

export function formatRelative(updatedAt: number, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - updatedAt) / DAY);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export function formatEdited(updatedAt: number, now = Date.now()): string {
  const relative = formatRelative(updatedAt, now).toLowerCase();
  if (relative === "today" || relative === "yesterday") return `Edited ${relative}`;
  return `Edited ${relative}`;
}

export function formatOpened(openedAt: number, now = Date.now()): string {
  return `Last opened ${formatRelative(openedAt, now).toLowerCase()}`;
}

export function formatParts(parts: number): string {
  return parts === 1 ? "1 part" : `${parts} parts`;
}

export function shortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+K";
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl+K";
}
