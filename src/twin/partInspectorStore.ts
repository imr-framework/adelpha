import { create } from "zustand";
import { type ScannerModelId } from "./scannerModel";
import {
  defaultGradeId,
  defaultGroupName,
  isMriMaterialClassId,
  MRI_CLASS_COLOR,
  newMaterialGroupId,
  type MaterialGroup,
  type MriMaterialClassId,
} from "./mriMaterials";

const KEY = "adelpha.partBindings.v1";
const GROUPS_KEY = "adelpha.partGroups.v1";
const INSPECT_KEY = "adelpha.inspectionMode";

export type PartBinding = {
  displayName: string;
  sensorId: string | null;
  inSimulation: boolean;
  /** User color-code for this CAD part (`#rrggbb`), or null for the default studio look. */
  colorHex: string | null;
  /** Material group this part belongs to, if classified. */
  groupId: string | null;
};

export const PART_COLOR_SWATCHES = [
  "#8260fb",
  "#3ee4a4",
  "#6eb6ff",
  "#ff6b6b",
  "#e0a526",
  "#ff8a4c",
  "#f472b6",
  "#22d3ee",
] as const;

export function isPartColorHex(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export type SelectedCadPart = {
  partId: string;
  cadName: string;
  scannerId: ScannerModelId;
};

export type CadPartRef = {
  partId: string;
  cadName: string;
};

export type SelectMode = "replace" | "add" | "toggle";

type BindingsMap = Record<string, Record<string, PartBinding>>;
type CatalogMap = Record<string, CadPartRef[]>;
type HiddenMap = Record<string, string[]>;
type GroupsMap = Record<string, MaterialGroup[]>;

const NO_HIDDEN: string[] = [];
const NO_GROUPS: MaterialGroup[] = [];

function readBindings(): BindingsMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BindingsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBindings(map: BindingsMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function isMaterialGroup(value: unknown): value is MaterialGroup {
  if (!value || typeof value !== "object") return false;
  const row = value as MaterialGroup;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    isMriMaterialClassId(row.classId) &&
    typeof row.gradeId === "string" &&
    Array.isArray(row.partIds) &&
    typeof row.inSimulation === "boolean"
  );
}

function readGroups(): GroupsMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: GroupsMap = {};
    for (const [scannerId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(rows)) continue;
      out[scannerId] = rows.filter(isMaterialGroup).map((group) => ({
        ...group,
        partIds: group.partIds.filter((id) => typeof id === "string"),
      }));
    }
    return out;
  } catch {
    return {};
  }
}

function writeGroups(map: GroupsMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function readInspectionMode(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(INSPECT_KEY) === "on";
  } catch {
    return false;
  }
}

function writeInspectionMode(on: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INSPECT_KEY, on ? "on" : "off");
  } catch {
    /* quota / private mode */
  }
}

export function humanizePartName(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const withoutInstance = spaced.replace(/\s*\d+$/, "").trim();
  const cleaned = withoutInstance || spaced || "Unnamed part";
  if (cleaned === cleaned.toLowerCase()) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export function inferPartRole(name: string): string {
  const n = name.toLowerCase();
  if (/rf|coil|transmit|receive/.test(n)) return "RF coil";
  if (/gradient|gx|gy|gz/.test(n)) return "Gradient";
  if (/shim/.test(n)) return "Shim";
  if (/halbach|magnet|yoke|pole|cube|ndfeb/.test(n)) return "Magnet";
  if (/bore/.test(n)) return "Bore";
  if (/hous|cover|shell|enclos|fairing/.test(n)) return "Housing";
  if (/patient|table|bed|couch/.test(n)) return "Patient support";
  if (/electronics|rack|psu|power/.test(n)) return "Electronics";
  return "Assembly part";
}

function mergeBinding(
  current: PartBinding | undefined,
  patch: Partial<PartBinding>,
  fallbackName: string,
): PartBinding {
  return {
    displayName: patch.displayName ?? current?.displayName ?? fallbackName,
    sensorId: patch.sensorId !== undefined ? patch.sensorId : (current?.sensorId ?? null),
    inSimulation: patch.inSimulation ?? current?.inSimulation ?? false,
    colorHex:
      patch.colorHex !== undefined
        ? patch.colorHex && isPartColorHex(patch.colorHex)
          ? patch.colorHex.toLowerCase()
          : null
        : (current?.colorHex ?? null),
    groupId: patch.groupId !== undefined ? patch.groupId : (current?.groupId ?? null),
  };
}

function fallbackNameFor(scannerId: string, partId: string, catalog: CatalogMap): string {
  const cadName = catalog[scannerId]?.find((part) => part.partId === partId)?.cadName ?? partId;
  return humanizePartName(cadName);
}

function applyBindingPatch(
  bindings: BindingsMap,
  catalog: CatalogMap,
  scannerId: string,
  partIds: string[],
  patch: Partial<PartBinding>,
): BindingsMap {
  const scanner = { ...(bindings[scannerId] ?? {}) };
  for (const partId of partIds) {
    scanner[partId] = mergeBinding(scanner[partId], patch, fallbackNameFor(scannerId, partId, catalog));
  }
  return { ...bindings, [scannerId]: scanner };
}

function dropPartsFromGroups(groups: MaterialGroup[], partIds: Set<string>): MaterialGroup[] {
  return groups
    .map((group) => ({ ...group, partIds: group.partIds.filter((id) => !partIds.has(id)) }))
    .filter((group) => group.partIds.length > 0);
}

function syncGroupSimulation(group: MaterialGroup, bindings: Record<string, PartBinding> | undefined): MaterialGroup {
  const on = group.partIds.length > 0 && group.partIds.every((id) => bindings?.[id]?.inSimulation);
  return on === group.inSimulation ? group : { ...group, inSimulation: on };
}

type PartInspectorStore = {
  selected: SelectedCadPart | null;
  selection: SelectedCadPart[];
  bindings: BindingsMap;
  catalog: CatalogMap;
  groups: GroupsMap;
  /** Parts are only clickable in the viewport while this is on. */
  inspectionMode: boolean;
  /**
   * Parts culled from the viewport so the user can see what sits behind them.
   * Deliberately session-only: a part that stayed invisible across restarts
   * would read as a broken model rather than a view choice.
   */
  hidden: HiddenMap;
  selectPart: (part: SelectedCadPart, mode?: SelectMode) => void;
  selectMany: (parts: SelectedCadPart[]) => void;
  clearSelection: () => void;
  setInspectionMode: (on: boolean) => void;
  hidePart: (scannerId: string, partId: string) => void;
  showPart: (scannerId: string, partId: string) => void;
  isolatePart: (scannerId: string, partId: string) => void;
  isolateParts: (scannerId: string, partIds: string[]) => void;
  showAllParts: (scannerId: string) => void;
  setPartCatalog: (scannerId: string, parts: CadPartRef[]) => void;
  patchBinding: (scannerId: string, partId: string, patch: Partial<PartBinding>) => void;
  patchBindings: (scannerId: string, partIds: string[], patch: Partial<PartBinding>) => void;
  assignMaterial: (args: {
    scannerId: string;
    partIds: string[];
    classId: MriMaterialClassId;
    gradeId?: string;
    groupId?: string | null;
    name?: string;
  }) => MaterialGroup;
  setGroupInSimulation: (scannerId: string, groupId: string, on: boolean) => void;
  setPartsInSimulation: (scannerId: string, partIds: string[], on: boolean) => void;
  selectGroup: (scannerId: ScannerModelId, groupId: string) => void;
  dissolveGroup: (scannerId: string, groupId: string) => void;
};

export const usePartInspectorStore = create<PartInspectorStore>((set, get) => ({
  selected: null,
  selection: [],
  bindings: readBindings(),
  catalog: {},
  groups: readGroups(),
  inspectionMode: readInspectionMode(),
  hidden: {},
  selectPart: (part, mode = "replace") =>
    set((state) => {
      const sameScanner = state.selection.every((row) => row.scannerId === part.scannerId);
      const current = sameScanner ? state.selection : [];
      let next: SelectedCadPart[];
      if (mode === "replace") {
        next = [part];
      } else if (mode === "add") {
        next = current.some((row) => row.partId === part.partId)
          ? current.map((row) => (row.partId === part.partId ? part : row))
          : [...current, part];
      } else {
        next = current.some((row) => row.partId === part.partId)
          ? current.filter((row) => row.partId !== part.partId)
          : [...current, part];
      }
      return { selection: next, selected: next[next.length - 1] ?? null };
    }),
  selectMany: (parts) =>
    set({
      selection: parts,
      selected: parts[parts.length - 1] ?? null,
    }),
  clearSelection: () => set({ selected: null, selection: [] }),
  setInspectionMode: (on) => {
    writeInspectionMode(on);
    set(on ? { inspectionMode: true } : { inspectionMode: false, selected: null, selection: [], hidden: {} });
  },
  hidePart: (scannerId, partId) =>
    set((state) => {
      const current = state.hidden[scannerId] ?? NO_HIDDEN;
      if (current.includes(partId)) return state;
      const selection = state.selection.filter(
        (row) => !(row.partId === partId && row.scannerId === scannerId),
      );
      return {
        hidden: { ...state.hidden, [scannerId]: [...current, partId] },
        selection,
        selected: selection[selection.length - 1] ?? null,
      };
    }),
  showPart: (scannerId, partId) =>
    set((state) => {
      const current = state.hidden[scannerId] ?? NO_HIDDEN;
      if (!current.includes(partId)) return state;
      return {
        hidden: { ...state.hidden, [scannerId]: current.filter((id) => id !== partId) },
      };
    }),
  isolatePart: (scannerId, partId) =>
    set((state) => {
      const others = listPartsForScanner(scannerId, state.catalog, state.bindings)
        .map((part) => part.partId)
        .filter((id) => id !== partId);
      return { hidden: { ...state.hidden, [scannerId]: others } };
    }),
  isolateParts: (scannerId, partIds) =>
    set((state) => {
      const keep = new Set(partIds);
      const others = listPartsForScanner(scannerId, state.catalog, state.bindings)
        .map((part) => part.partId)
        .filter((id) => !keep.has(id));
      return { hidden: { ...state.hidden, [scannerId]: others } };
    }),
  showAllParts: (scannerId) =>
    set((state) => ({ hidden: { ...state.hidden, [scannerId]: NO_HIDDEN } })),
  setPartCatalog: (scannerId, parts) =>
    set((state) => ({
      catalog: { ...state.catalog, [scannerId]: parts },
    })),
  patchBinding: (scannerId, partId, patch) => {
    get().patchBindings(scannerId, [partId], patch);
  },
  patchBindings: (scannerId, partIds, patch) =>
    set((state) => {
      if (partIds.length === 0) return state;
      const bindings = applyBindingPatch(state.bindings, state.catalog, scannerId, partIds, patch);
      const groups = (state.groups[scannerId] ?? NO_GROUPS).map((group) =>
        syncGroupSimulation(group, bindings[scannerId]),
      );
      const nextGroups = { ...state.groups, [scannerId]: groups };
      writeBindings(bindings);
      writeGroups(nextGroups);
      return { bindings, groups: nextGroups };
    }),
  assignMaterial: ({ scannerId, partIds, classId, gradeId, groupId, name }) => {
    const uniqueIds = [...new Set(partIds.filter(Boolean))];
    const resolvedGrade = gradeId ?? defaultGradeId(classId);
    const state = get();
    const moving = new Set(uniqueIds);
    let groups = dropPartsFromGroups(state.groups[scannerId] ?? NO_GROUPS, moving);
    const existing = groupId ? groups.find((group) => group.id === groupId) : undefined;
    let group: MaterialGroup;
    if (existing) {
      group = {
        ...existing,
        classId,
        gradeId: resolvedGrade,
        name: name?.trim() || existing.name,
        partIds: [...new Set([...existing.partIds, ...uniqueIds])],
      };
      groups = groups.map((row) => (row.id === existing.id ? group : row));
    } else {
      group = {
        id: newMaterialGroupId(),
        name: name?.trim() || defaultGroupName(classId, resolvedGrade),
        classId,
        gradeId: resolvedGrade,
        partIds: uniqueIds,
        inSimulation: false,
      };
      groups = [...groups, group];
    }

    let bindings = state.bindings;
    const color = MRI_CLASS_COLOR[classId];
    for (const partId of uniqueIds) {
      const current = bindings[scannerId]?.[partId];
      bindings = applyBindingPatch(bindings, state.catalog, scannerId, [partId], {
        groupId: group.id,
        colorHex: current?.colorHex ?? color,
        inSimulation: group.inSimulation ? true : current?.inSimulation,
      });
    }
    group = syncGroupSimulation(group, bindings[scannerId]);
    groups = groups.map((row) => (row.id === group.id ? group : row));
    const nextGroups = { ...state.groups, [scannerId]: groups };
    writeBindings(bindings);
    writeGroups(nextGroups);
    set({ bindings, groups: nextGroups });
    return group;
  },
  setGroupInSimulation: (scannerId, groupId, on) =>
    set((state) => {
      const groups = (state.groups[scannerId] ?? NO_GROUPS).map((group) =>
        group.id === groupId ? { ...group, inSimulation: on } : group,
      );
      const target = groups.find((group) => group.id === groupId);
      if (!target) return state;
      const bindings = applyBindingPatch(state.bindings, state.catalog, scannerId, target.partIds, {
        inSimulation: on,
      });
      const nextGroups = { ...state.groups, [scannerId]: groups };
      writeBindings(bindings);
      writeGroups(nextGroups);
      return { bindings, groups: nextGroups };
    }),
  setPartsInSimulation: (scannerId, partIds, on) => {
    get().patchBindings(scannerId, partIds, { inSimulation: on });
  },
  selectGroup: (scannerId, groupId) =>
    set((state) => {
      const group = (state.groups[scannerId] ?? NO_GROUPS).find((row) => row.id === groupId);
      if (!group) return state;
      const byId = new Map((state.catalog[scannerId] ?? []).map((part) => [part.partId, part]));
      const parts: SelectedCadPart[] = group.partIds.map((partId) => ({
        partId,
        cadName: byId.get(partId)?.cadName ?? partId,
        scannerId,
      }));
      return { selection: parts, selected: parts[parts.length - 1] ?? null };
    }),
  dissolveGroup: (scannerId, groupId) =>
    set((state) => {
      const current = state.groups[scannerId] ?? NO_GROUPS;
      const group = current.find((row) => row.id === groupId);
      if (!group) return state;
      const groups = current.filter((row) => row.id !== groupId);
      const bindings = applyBindingPatch(state.bindings, state.catalog, scannerId, group.partIds, {
        groupId: null,
      });
      const nextGroups = { ...state.groups, [scannerId]: groups };
      writeBindings(bindings);
      writeGroups(nextGroups);
      return { bindings, groups: nextGroups };
    }),
}));

export function resolvePartBinding(part: SelectedCadPart, bindings: BindingsMap): PartBinding {
  const saved = bindings[part.scannerId]?.[part.partId];
  return {
    displayName: saved?.displayName?.trim() || humanizePartName(part.cadName),
    sensorId: saved?.sensorId ?? null,
    inSimulation: saved?.inSimulation ?? false,
    colorHex: isPartColorHex(saved?.colorHex) ? saved.colorHex.toLowerCase() : null,
    groupId: saved?.groupId ?? null,
  };
}

export function listPartsForScanner(
  scannerId: string,
  catalog: CatalogMap,
  bindings: BindingsMap,
): CadPartRef[] {
  const fromCad = catalog[scannerId] ?? [];
  const seen = new Set(fromCad.map((part) => part.partId));
  const extras = Object.keys(bindings[scannerId] ?? {})
    .filter((id) => !seen.has(id))
    .map((id) => ({ partId: id, cadName: id }));
  return [...fromCad, ...extras];
}

/** Parts the user explicitly added to the DTAM simulation. */
export function listSimulationPartIds(
  scannerId: string,
  catalog: CatalogMap,
  bindings: BindingsMap,
): string[] {
  return listPartsForScanner(scannerId, catalog, bindings)
    .filter((part) => resolvePartBinding({ ...part, scannerId: scannerId as ScannerModelId }, bindings).inSimulation)
    .map((part) => part.partId);
}

export function listMaterialGroups(state: { groups: GroupsMap }, scannerId: string): MaterialGroup[] {
  return state.groups[scannerId] ?? NO_GROUPS;
}

export function selectHiddenParts(state: { hidden: HiddenMap }, scannerId: string): string[] {
  return state.hidden[scannerId] ?? NO_HIDDEN;
}

export function clearPartSelection() {
  usePartInspectorStore.getState().clearSelection();
}

/** Drop selection and restore every hidden part — used when the loaded CAD changes. */
export function resetPartView(scannerId: string) {
  const store = usePartInspectorStore.getState();
  store.clearSelection();
  store.showAllParts(scannerId);
}
