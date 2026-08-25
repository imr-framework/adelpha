import { create } from "zustand";
import { type ScannerModelId } from "./scannerModel";

const KEY = "adelpha.partBindings.v1";
const INSPECT_KEY = "adelpha.inspectionMode";

export type PartBinding = {
  displayName: string;
  sensorId: string | null;
  inSimulation: boolean;
  /** User color-code for this CAD part (`#rrggbb`), or null for the default studio look. */
  colorHex: string | null;
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

type BindingsMap = Record<string, Record<string, PartBinding>>;
type CatalogMap = Record<string, CadPartRef[]>;

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
  const cleaned = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Unnamed part";
}

export function inferPartRole(name: string): string {
  const n = name.toLowerCase();
  if (/rf|coil|transmit|receive/.test(n)) return "RF coil";
  if (/gradient|gx|gy|gz/.test(n)) return "Gradient";
  if (/shim/.test(n)) return "Shim";
  if (/halbach|magnet|yoke|pole/.test(n)) return "Magnet";
  if (/bore/.test(n)) return "Bore";
  if (/hous|cover|shell|enclos|fairing/.test(n)) return "Housing";
  if (/patient|table|bed|couch/.test(n)) return "Patient support";
  if (/electronics|rack|psu|power/.test(n)) return "Electronics";
  return "Assembly part";
}

type PartInspectorStore = {
  selected: SelectedCadPart | null;
  bindings: BindingsMap;
  catalog: CatalogMap;
  /** Parts are only clickable in the viewport while this is on. */
  inspectionMode: boolean;
  selectPart: (part: SelectedCadPart) => void;
  clearSelection: () => void;
  setInspectionMode: (on: boolean) => void;
  setPartCatalog: (scannerId: string, parts: CadPartRef[]) => void;
  patchBinding: (scannerId: string, partId: string, patch: Partial<PartBinding>) => void;
};

export const usePartInspectorStore = create<PartInspectorStore>((set) => ({
  selected: null,
  bindings: readBindings(),
  catalog: {},
  inspectionMode: readInspectionMode(),
  selectPart: (part) => set({ selected: part }),
  clearSelection: () => set({ selected: null }),
  setInspectionMode: (on) => {
    writeInspectionMode(on);
    set(on ? { inspectionMode: true } : { inspectionMode: false, selected: null });
  },
  setPartCatalog: (scannerId, parts) =>
    set((state) => ({
      catalog: { ...state.catalog, [scannerId]: parts },
    })),
  patchBinding: (scannerId, partId, patch) =>
    set((state) => {
      const current = state.bindings[scannerId]?.[partId];
      const nextPart: PartBinding = {
        displayName: patch.displayName ?? current?.displayName ?? "",
        sensorId: patch.sensorId !== undefined ? patch.sensorId : (current?.sensorId ?? null),
        inSimulation: patch.inSimulation ?? current?.inSimulation ?? false,
        colorHex:
          patch.colorHex !== undefined
            ? patch.colorHex && isPartColorHex(patch.colorHex)
              ? patch.colorHex.toLowerCase()
              : null
            : (current?.colorHex ?? null),
      };
      const next: BindingsMap = {
        ...state.bindings,
        [scannerId]: {
          ...state.bindings[scannerId],
          [partId]: nextPart,
        },
      };
      writeBindings(next);
      return { bindings: next };
    }),
}));

export function resolvePartBinding(part: SelectedCadPart, bindings: BindingsMap): PartBinding {
  const saved = bindings[part.scannerId]?.[part.partId];
  return {
    displayName: saved?.displayName?.trim() || humanizePartName(part.cadName),
    sensorId: saved?.sensorId ?? null,
    inSimulation: saved?.inSimulation ?? false,
    colorHex: isPartColorHex(saved?.colorHex) ? saved.colorHex.toLowerCase() : null,
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

export function clearPartSelection() {
  usePartInspectorStore.getState().clearSelection();
}
