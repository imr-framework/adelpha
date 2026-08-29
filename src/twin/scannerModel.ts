import { useEffect, useState } from "react";

import { readDevicePreview } from "./devicePreviews";
import {
  CATALOG_EVENT,
  hydrateImportedModels,
  importedObjectUrl,
  isImportedModelId,
  readImportedMeta,
  type ImportedModelMeta,
} from "./importedModels";

export type ScannerModelId = string;

export type ScannerCadSpec = {
  url: string;
  /** Uniform scale after centering. STL millimetre meshes need ~0.001; the Delta GLB is already metres. */
  scale: number;
  rotationDeg: [number, number, number];
  /** Translate named assembly children apart instead of uniformly scaling the mesh. */
  explodeParts: boolean;
  format?: "glb" | "stl" | "step";
  fileName?: string;
};

export type ScannerModelProfile = {
  id: ScannerModelId;
  family: string;
  label: string;
  displayName: string;
  serial: string;
  type: string;
  field: string;
  preview: string;
  alt: string;
  imported?: boolean;
  cad?: ScannerCadSpec;
};

const HALBACH_CAD: ScannerCadSpec = {
  url: "/MRI_base.stl",
  scale: 0.0012,
  rotationDeg: [-90, 0, 0],
  explodeParts: false,
  format: "stl",
};

const DELTA_CAD: ScannerCadSpec = {
  url: "/delta_v2.glb",
  scale: 0.22,
  rotationDeg: [0, 0, 0],
  explodeParts: true,
  format: "glb",
};

export const SCANNER_MODELS: ScannerModelProfile[] = [
  {
    id: "halbach-48",
    family: "halbach",
    label: "48 mT Halbach — MRI Uganda",
    displayName: "Adelpha 48 mT Halbach",
    serial: "—",
    type: "Halbach",
    field: "48 mT",
    preview: "/settings/3D_models/halbach.png",
    alt: "48 mT Halbach scanner model",
    cad: HALBACH_CAD,
  },
  {
    id: "halbach-47",
    family: "halbach",
    label: "47 mT Halbach — Prototype",
    displayName: "Adelpha 47 mT Halbach",
    serial: "—",
    type: "Halbach",
    field: "47 mT",
    preview: "/settings/3D_models/halbach.png",
    alt: "47 mT Halbach scanner model",
    cad: HALBACH_CAD,
  },
  {
    id: "halbach-64",
    family: "halbach",
    label: "64 mT Halbach — Research",
    displayName: "Adelpha 64 mT Halbach",
    serial: "—",
    type: "Halbach",
    field: "64 mT",
    preview: "/settings/3D_models/halbach.png",
    alt: "64 mT Halbach scanner model",
    cad: HALBACH_CAD,
  },
  {
    id: "delta-v2",
    family: "delta",
    label: "Delta v2",
    displayName: "Delta v2",
    serial: "—",
    type: "Delta",
    field: "—",
    preview: "/settings/3D_models/delta.png",
    alt: "Delta v2 scanner model",
    cad: DELTA_CAD,
  },
  {
    id: "mri4all-z1",
    family: "mri4all",
    label: "MRI4ALL — Zeugmatron Z1",
    displayName: "MRI4ALL Zeugmatron Z1",
    serial: "000001",
    type: "Zeugmatron Z1",
    field: "50 mT",
    preview: "/settings/3D_models/mri4all.png",
    alt: "MRI4ALL Zeugmatron Z1 scanner model",
  },
];

const KEY = "adelpha.scannerModel";
const EVENT = "adelpha:scanner-model";

export const MAGNET_CAD_SCALE_MIN = 0.0001;
export const MAGNET_CAD_SCALE_MAX = 10;

const previewCache = new Map<string, string>();

function glbPreview(id: string, label: string, badge = "GLB"): string {
  const cached = previewCache.get(id);
  if (cached) return cached;
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = "#8b7cf7";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(badge, 160, 96);
  ctx.fillStyle = "#c8c8c8";
  ctx.font = "14px system-ui, sans-serif";
  const name = label.length > 22 ? `${label.slice(0, 21)}…` : label;
  ctx.fillText(name, 160, 130);
  const data = canvas.toDataURL("image/png");
  previewCache.set(id, data);
  return data;
}

function profileFromImport(row: ImportedModelMeta): ScannerModelProfile | null {
  const url = importedObjectUrl(row.id);
  if (!url) return null;
  return {
    id: row.id,
    family: row.id,
    label: row.displayName,
    displayName: row.displayName,
    serial: "—",
    type: row.displayName,
    field: "—",
    preview: glbPreview(row.id, row.displayName, row.format === "step" ? "STEP" : "GLB"),
    alt: `Imported ${row.format === "step" ? "STEP" : "GLB"} ${row.displayName}`,
    imported: true,
    cad: {
      url,
      scale: row.scale,
      rotationDeg: [0, 0, 0],
      explodeParts: true,
      format: row.format === "step" ? "step" : "glb",
      fileName: row.fileName,
    },
  };
}

function withCustomPreview(profile: ScannerModelProfile): ScannerModelProfile {
  const custom = readDevicePreview(profile.family) ?? readDevicePreview(profile.id);
  return custom ? { ...profile, preview: custom } : profile;
}

export function listScannerProfiles(): ScannerModelProfile[] {
  const imported = readImportedMeta()
    .map(profileFromImport)
    .filter((row): row is ScannerModelProfile => row !== null);
  return [...SCANNER_MODELS, ...imported].map(withCustomPreview);
}

function isKnownModelId(value: string | null): value is ScannerModelId {
  if (!value) return false;
  if (SCANNER_MODELS.some((model) => model.id === value)) return true;
  return isImportedModelId(value);
}

export function readScannerModel(): ScannerModelId {
  try {
    const value = localStorage.getItem(KEY);
    if (isKnownModelId(value)) return value;
  } catch {
    /* ignore */
  }
  return "halbach-48";
}

export function getScannerProfile(id: ScannerModelId = readScannerModel()): ScannerModelProfile {
  return listScannerProfiles().find((model) => model.id === id) ?? SCANNER_MODELS[0];
}

export function cadForScanner(id: ScannerModelId = readScannerModel()): ScannerCadSpec | undefined {
  return getScannerProfile(id).cad;
}

export function setScannerModel(id: ScannerModelId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<ScannerModelId>(EVENT, { detail: id }));
}

export function useScannerModel(): [ScannerModelId, (id: ScannerModelId) => void] {
  const [id, setId] = useState<ScannerModelId>(readScannerModel);
  useEffect(() => {
    const onChange = (event: Event) => setId((event as CustomEvent<ScannerModelId>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [id, setScannerModel];
}

/** Subscribe to bundled + imported profiles (re-renders after hydrate/import/remove). */
export function useScannerCatalog(): ScannerModelProfile[] {
  const [profiles, setProfiles] = useState(listScannerProfiles);
  useEffect(() => {
    const refresh = () => setProfiles(listScannerProfiles());
    window.addEventListener(CATALOG_EVENT, refresh);
    void hydrateImportedModels().catch(() => undefined);
    return () => window.removeEventListener(CATALOG_EVENT, refresh);
  }, []);
  return profiles;
}
