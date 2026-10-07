import { create } from "zustand";

export type StudioNavTool = "orbit" | "pan" | "inspect";
export type StudioCameraPreset = "iso" | "front" | "back" | "left" | "right" | "top";

export type StudioModelFrame = {
  target: [number, number, number];
  radius: number;
  size: [number, number, number];
};

export type StudioProjectRef = {
  id: string;
  name: string;
  application: "hardware" | "acquisition" | "reconstruction";
};

type EngineeringStore = {
  navTool: StudioNavTool;
  cameraPreset: StudioCameraPreset;
  modelLabel: string;
  partCount: number;
  catalogCount: number;
  fallback: boolean;
  frame: StudioModelFrame | null;
  viewNonce: number;
  fitNonce: number;
  /** Null until the start card opens or creates a project. */
  activeProject: StudioProjectRef | null;
  setNavTool: (tool: StudioNavTool) => void;
  setCameraPreset: (preset: StudioCameraPreset) => void;
  setModelInfo: (info: { label: string; partCount: number; catalogCount: number; fallback: boolean }) => void;
  setFrame: (frame: StudioModelFrame | null) => void;
  requestFit: () => void;
  openProject: (project: StudioProjectRef) => void;
  closeProject: () => void;
};

export const useEngineeringStore = create<EngineeringStore>((set) => ({
  navTool: "orbit",
  cameraPreset: "iso",
  modelLabel: "MRI assembly",
  partCount: 0,
  catalogCount: 0,
  fallback: false,
  frame: null,
  viewNonce: 0,
  fitNonce: 0,
  activeProject: null,
  setNavTool: (navTool) => set({ navTool }),
  setCameraPreset: (cameraPreset) => set((state) => ({ cameraPreset, viewNonce: state.viewNonce + 1 })),
  setModelInfo: (info) =>
    set({
      modelLabel: info.label,
      partCount: info.partCount,
      catalogCount: info.catalogCount,
      fallback: info.fallback,
    }),
  setFrame: (frame) => set({ frame }),
  requestFit: () => set((state) => ({ fitNonce: state.fitNonce + 1 })),
  openProject: (project) =>
    set({
      activeProject: {
        id: project.id,
        name: project.name,
        application: project.application ?? "hardware",
      },
      modelLabel: project.name,
    }),
  closeProject: () =>
    set({
      activeProject: null,
      modelLabel: "MRI assembly",
      navTool: "orbit",
      frame: null,
      partCount: 0,
      catalogCount: 0,
      fallback: false,
    }),
}));
