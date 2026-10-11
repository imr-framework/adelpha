import { create } from "zustand";
import { physicalModelKey, worldMagnetization, type PhysicalPart } from "./geometryPrep";
import { emptyEngineering } from "./engineering";

export type HardwareStudyKind = "magnet" | "fem";
export type StudySection = "setup" | "geometry" | "physics" | "results" | "diagnostics";
export type RunStatus = "queued" | "running" | "failed" | "completed";
export type MagnetModel = "dipole" | "cuboid";
export type FemApproximation = "imported_mesh" | "oriented_box";
export type FieldQuantity = "magnitude" | "bx" | "by" | "bz" | "delta";

export type StudyRoi = {
  centerM: [number, number, number];
  sizeM: [number, number, number];
  samples: [number, number, number];
};

export type MeshSettings = {
  approximation: FemApproximation;
  airPaddingM: number;
  grid: [number, number, number];
};

export type HardwareStudySettings = {
  roi: StudyRoi;
  magnetModel: MagnetModel;
  mesh: MeshSettings;
  referenceFieldT: number | null;
};

export type FrozenPart = {
  instanceId: string;
  partId: string;
  cadName: string;
  sourceAssetId: string;
  geometryRevision: string;
  worldMatrix: number[];
  translationM: [number, number, number];
  sizeM: [number, number, number];
  units: "m" | "mm";
  role: string | null;
  remanenceT: number | null;
  magnetizationLocal: [number, number, number] | null;
  magnetizationWorld: [number, number, number] | null;
  magnetizationFrame: "local" | "world";
  relativePermeability: number | null;
  conductivitySPerM: number | null;
};

export type HardwareStudySnapshot = {
  study: HardwareStudyKind;
  includedInstanceIds: string[];
  includedPartIds: string[];
  parts: FrozenPart[];
  modelKey: string;
  settings: HardwareStudySettings;
  approximations: string[];
  versions: Record<string, string>;
};

export type FieldSample = {
  points: number[][];
  bx: number[];
  by: number[];
  bz: number[];
  magnitude: number[];
  units: "T";
};

export type HomogeneityStats = {
  roi: StudyRoi;
  referenceT: number;
  metric: string;
  meanT: number;
  peakToPeakT: number;
  stdT: number;
  ppmPeakToPeak: number;
  ppmRms: number;
};

export type HardwareStudyResult = {
  ok: boolean;
  completed: boolean;
  title: string;
  summary: string;
  solver: string;
  approximations: string[];
  diagnostics: string[];
  limitation: string;
  field: FieldSample | null;
  slice: { axis: "x" | "y" | "z"; index: number; width: number; height: number; values: number[]; quantity: string; units: string } | null;
  vectors: { points: number[][]; components: number[][]; scale: number } | null;
  probes: { position: number[]; bT: number[]; magnitudeT: number }[];
  homogeneity: HomogeneityStats | null;
  mesh: { nodes: number; elements: number; regions: { id: string; body: number; name: string }[] } | null;
  elapsed_s: number;
};

export type HardwareStudyRun = {
  id: string;
  study: HardwareStudyKind;
  status: RunStatus;
  stale: boolean;
  createdAt: number;
  error: string | null;
  snapshot: HardwareStudySnapshot;
  result: HardwareStudyResult | null;
};

export type HardwareStudyRecord = {
  settings: HardwareStudySettings;
  section: StudySection;
  quantity: FieldQuantity;
  exampleId: string | null;
  runs: HardwareStudyRun[];
  activeRunId: string | null;
};

type StudyMap = Record<string, Partial<Record<HardwareStudyKind, HardwareStudyRecord>>>;

const KEY = "adelpha.hardwareStudies.v1";

export const DEFAULT_ROI: StudyRoi = {
  centerM: [0, 0, 0],
  sizeM: [0.08, 0.08, 0.08],
  samples: [17, 17, 17],
};

export const DEFAULT_SETTINGS: HardwareStudySettings = {
  roi: DEFAULT_ROI,
  magnetModel: "cuboid",
  mesh: { approximation: "oriented_box", airPaddingM: 0.04, grid: [16, 16, 16] },
  referenceFieldT: null,
};

function defaultRecord(): HardwareStudyRecord {
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    section: "setup",
    quantity: "magnitude",
    exampleId: null,
    runs: [],
    activeRunId: null,
  };
}

function readMap(): StudyMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StudyMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: StudyMap) {
  if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function normalizeRecord(value: HardwareStudyRecord | undefined): HardwareStudyRecord {
  if (!value) return defaultRecord();
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...value.settings,
      roi: { ...DEFAULT_ROI, ...value.settings?.roi },
      mesh: { ...DEFAULT_SETTINGS.mesh, ...value.settings?.mesh },
    },
    section: value.section ?? "setup",
    quantity: value.quantity ?? "magnitude",
    exampleId: value.exampleId ?? null,
    runs: Array.isArray(value.runs) ? value.runs : [],
    activeRunId: value.activeRunId ?? null,
  };
}

type HardwareStudyStore = {
  projects: StudyMap;
  record: (projectId: string, study: HardwareStudyKind) => HardwareStudyRecord;
  setSection: (projectId: string, study: HardwareStudyKind, section: StudySection) => void;
  setQuantity: (projectId: string, study: HardwareStudyKind, quantity: FieldQuantity) => void;
  setSettings: (projectId: string, study: HardwareStudyKind, patch: Partial<HardwareStudySettings>) => void;
  setExample: (projectId: string, study: HardwareStudyKind, exampleId: string | null) => void;
  addRun: (projectId: string, study: HardwareStudyKind, run: HardwareStudyRun) => void;
  updateRun: (projectId: string, study: HardwareStudyKind, runId: string, patch: Partial<HardwareStudyRun>) => void;
  selectRun: (projectId: string, study: HardwareStudyKind, runId: string | null) => void;
  markStale: (projectId: string, study: HardwareStudyKind, modelKey: string) => void;
};

function writeProject(
  projects: StudyMap,
  projectId: string,
  study: HardwareStudyKind,
  next: HardwareStudyRecord,
): StudyMap {
  const updated = {
    ...projects,
    [projectId]: {
      ...projects[projectId],
      [study]: next,
    },
  };
  writeMap(updated);
  return updated;
}

export const useHardwareStudyStore = create<HardwareStudyStore>((set, get) => ({
  projects: readMap(),
  record: (projectId, study) => normalizeRecord(get().projects[projectId]?.[study]),
  setSection: (projectId, study, section) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return { projects: writeProject(state.projects, projectId, study, { ...current, section }) };
    }),
  setQuantity: (projectId, study, quantity) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return { projects: writeProject(state.projects, projectId, study, { ...current, quantity }) };
    }),
  setSettings: (projectId, study, patch) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      const settings = {
        ...current.settings,
        ...patch,
        roi: { ...current.settings.roi, ...patch.roi },
        mesh: { ...current.settings.mesh, ...patch.mesh },
      };
      return { projects: writeProject(state.projects, projectId, study, { ...current, settings }) };
    }),
  setExample: (projectId, study, exampleId) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return { projects: writeProject(state.projects, projectId, study, { ...current, exampleId }) };
    }),
  addRun: (projectId, study, run) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return {
        projects: writeProject(state.projects, projectId, study, {
          ...current,
          runs: [run, ...current.runs].slice(0, 20),
          activeRunId: run.id,
        }),
      };
    }),
  updateRun: (projectId, study, runId, patch) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return {
        projects: writeProject(state.projects, projectId, study, {
          ...current,
          runs: current.runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)),
        }),
      };
    }),
  selectRun: (projectId, study, runId) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      return { projects: writeProject(state.projects, projectId, study, { ...current, activeRunId: runId }) };
    }),
  markStale: (projectId, study, modelKey) =>
    set((state) => {
      const current = normalizeRecord(state.projects[projectId]?.[study]);
      const settingsKey = JSON.stringify(current.settings);
      let changed = false;
      const runs = current.runs.map((run) => {
        const stale =
          run.status === "completed" &&
          (run.snapshot.modelKey !== modelKey || JSON.stringify(run.snapshot.settings) !== settingsKey);
        if (stale !== run.stale) changed = true;
        return stale === run.stale ? run : { ...run, stale };
      });
      if (!changed) return state;
      return { projects: writeProject(state.projects, projectId, study, { ...current, runs }) };
    }),
}));

export function exampleHalbachParts(): PhysicalPart[] {
  const sizeM: [number, number, number] = [0.02, 0.02, 0.02];
  const radius = 0.08;
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const mag = 2 * angle;
    const cx = radius * Math.cos(angle);
    const cy = radius * Math.sin(angle);
    const worldMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, cy, 0, 1];
    return {
      instanceId: `example-halbach::${index}`,
      partId: "example-halbach",
      cadName: `Example Halbach cube ${index + 1}`,
      sourceAssetId: "example-halbach-8",
      geometryRevision: "example-halbach-8",
      worldMatrix,
      translationM: [cx, cy, 0],
      sizeM,
      units: "m" as const,
      triangleCount: 12,
      vertexCount: 8,
      closed: true,
      degenerateFaces: 0,
      boundaryEdges: 0,
      visible: true,
      inSimulation: true,
      selected: false,
      engineering: {
        ...emptyEngineering(),
        role: "permanent_magnet",
        remanenceT: 1.2,
        magnetizationLocal: [Math.cos(mag), Math.sin(mag), 0],
        magnetizationFrame: "world",
      },
    };
  });
}

export function freezeParts(parts: PhysicalPart[]): FrozenPart[] {
  return parts
    .filter((part) => part.inSimulation)
    .map((part) => ({
      instanceId: part.instanceId,
      partId: part.partId,
      cadName: part.cadName,
      sourceAssetId: part.sourceAssetId,
      geometryRevision: part.geometryRevision,
      worldMatrix: part.worldMatrix.slice(),
      translationM: part.translationM,
      sizeM: part.sizeM,
      units: part.units,
      role: part.engineering.role,
      remanenceT: part.engineering.remanenceT,
      magnetizationLocal: part.engineering.magnetizationLocal,
      magnetizationWorld: worldMagnetization(
        part.engineering.magnetizationLocal,
        part.worldMatrix,
        part.engineering.magnetizationFrame,
      ),
      magnetizationFrame: part.engineering.magnetizationFrame,
      relativePermeability: part.engineering.relativePermeability,
      conductivitySPerM: part.engineering.conductivitySPerM,
    }));
}

export function makeSnapshot(
  study: HardwareStudyKind,
  parts: PhysicalPart[],
  settings: HardwareStudySettings,
  approximations: string[],
  versions: Record<string, string>,
): HardwareStudySnapshot {
  const included = freezeParts(parts);
  return {
    study,
    includedInstanceIds: included.map((part) => part.instanceId),
    includedPartIds: [...new Set(included.map((part) => part.partId))],
    parts: included,
    modelKey: physicalModelKey(parts),
    settings: structuredClone(settings),
    approximations,
    versions,
  };
}

export function newRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now().toString(36)}`;
}

export function snapshotRequest(snapshot: HardwareStudySnapshot) {
  return {
    study: snapshot.study,
    parts: snapshot.parts,
    roi: snapshot.settings.roi,
    magnet_model: snapshot.settings.magnetModel,
    mesh: snapshot.settings.mesh,
    reference_field_t: snapshot.settings.referenceFieldT,
    approximations: snapshot.approximations,
  };
}

export function emptyEngineeringPart(): ReturnType<typeof emptyEngineering> {
  return emptyEngineering();
}
