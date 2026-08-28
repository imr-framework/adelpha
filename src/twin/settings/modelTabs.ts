import { Boxes, FileBox, Gauge, Layers, Radio, SlidersHorizontal } from "lucide-react";

export type ModelTabId =
  | "general"
  | "components"
  | "sensors"
  | "visualization"
  | "performance"
  | "files";

export const MODEL_TABS: {
  id: ModelTabId;
  label: string;
  Icon: typeof Boxes;
  /** Short line under the page title, so each tab explains its own scope. */
  summary: string;
}[] = [
  {
    id: "general",
    label: "General",
    Icon: SlidersHorizontal,
    summary: "Active scanner model, viewport background, and camera behavior.",
  },
  {
    id: "components",
    label: "Components",
    Icon: Boxes,
    summary: "Browse the CAD assembly, rename parts, and inspect properties.",
  },
  {
    id: "sensors",
    label: "Sensors",
    Icon: Radio,
    summary: "DTAM sensor assignments and live telemetry for this model.",
  },
  {
    id: "visualization",
    label: "Visualization",
    Icon: Layers,
    summary: "Render mode, engineering overlays, and field visualization layers.",
  },
  {
    id: "performance",
    label: "Performance",
    Icon: Gauge,
    summary: "Rendering quality and material fidelity presets.",
  },
  {
    id: "files",
    label: "Files",
    Icon: FileBox,
    summary: "Imported CAD source, file metadata, and the installed model library.",
  },
];

const KEY = "adelpha.settings.modelTab";

export function isModelTabId(value: string | null): value is ModelTabId {
  return MODEL_TABS.some((tab) => tab.id === value);
}

export function readModelTab(): ModelTabId {
  try {
    const value = localStorage.getItem(KEY);
    if (isModelTabId(value)) return value;
  } catch {
    /* ignore */
  }
  return "general";
}

export function writeModelTab(tab: ModelTabId) {
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    /* quota / private mode */
  }
}
