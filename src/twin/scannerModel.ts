import { useEffect, useState } from "react";

export type ScannerModelId = "halbach-48" | "halbach-47" | "halbach-64" | "delta-v2" | "mri4all-z1";

export type ScannerCadSpec = {
  url: string;
  /** Uniform scale after centering. STL millimetre meshes need ~0.001; the Delta GLB is already metres. */
  scale: number;
  rotationDeg: [number, number, number];
  /** Translate named assembly children apart instead of uniformly scaling the mesh. */
  explodeParts: boolean;
};

export type ScannerModelProfile = {
  id: ScannerModelId;
  family: "halbach" | "delta" | "mri4all";
  label: string;
  displayName: string;
  serial: string;
  type: string;
  field: string;
  preview: string;
  alt: string;
  cad?: ScannerCadSpec;
};

const HALBACH_CAD: ScannerCadSpec = {
  url: "/MRI_base.stl",
  scale: 0.0012,
  rotationDeg: [-90, 0, 0],
  explodeParts: false,
};

const DELTA_CAD: ScannerCadSpec = {
  url: "/delta_v2.glb",
  scale: 0.22,
  rotationDeg: [0, 0, 0],
  explodeParts: true,
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

function isScannerModelId(value: string | null): value is ScannerModelId {
  return SCANNER_MODELS.some((model) => model.id === value);
}

export function readScannerModel(): ScannerModelId {
  try {
    const value = localStorage.getItem(KEY);
    if (isScannerModelId(value)) return value;
  } catch {
    /* ignore */
  }
  return "halbach-48";
}

export function getScannerProfile(id: ScannerModelId = readScannerModel()): ScannerModelProfile {
  return SCANNER_MODELS.find((model) => model.id === id) ?? SCANNER_MODELS[0];
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
