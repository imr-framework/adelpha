import { create } from "zustand";

export type StudioNavTool = "orbit" | "pan" | "inspect";
export type StudioCameraPreset = "iso" | "front" | "back" | "left" | "right" | "top";
export type HardwareView = "assembly" | "magnet" | "fem" | "gradients" | "shimming";

export type StudioModelFrame = {
  target: [number, number, number];
  radius: number;
  size: [number, number, number];
};

export type StudioProjectRef = {
  id: string;
  name: string;
  application: "hardware" | "acquisition" | "reconstruction";
  lastView?: HardwareView;
};

export type OpenProjectOptions = {
  view?: HardwareView;
  setup?: boolean;
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
  hardwareView: HardwareView;
  setupIntent: boolean;
  setNavTool: (tool: StudioNavTool) => void;
  setCameraPreset: (preset: StudioCameraPreset) => void;
  setModelInfo: (info: { label: string; partCount: number; catalogCount: number; fallback: boolean }) => void;
  setFrame: (frame: StudioModelFrame | null) => void;
  requestFit: () => void;
  openProject: (project: StudioProjectRef, options?: OpenProjectOptions) => void;
  closeProject: () => void;
  setHardwareView: (view: HardwareView) => void;
  clearSetupIntent: () => void;
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
  hardwareView: "assembly",
  setupIntent: false,
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
  openProject: (project, options) => {
    const application = project.application ?? "hardware";
    const requested = options?.view ?? project.lastView ?? "assembly";
    const hardwareView =
      application !== "hardware"
        ? "assembly"
        : options?.setup && (requested === "assembly" || requested === "gradients" || requested === "shimming")
          ? "magnet"
          : requested;
    set({
      activeProject: {
        id: project.id,
        name: project.name,
        application,
        lastView: hardwareView,
      },
      modelLabel: project.name,
      hardwareView,
      setupIntent: Boolean(options?.setup) && (hardwareView === "magnet" || hardwareView === "fem"),
    });
  },
  closeProject: () =>
    set({
      activeProject: null,
      modelLabel: "MRI assembly",
      navTool: "orbit",
      frame: null,
      partCount: 0,
      catalogCount: 0,
      fallback: false,
      hardwareView: "assembly",
      setupIntent: false,
    }),
  setHardwareView: (hardwareView) => set({ hardwareView, setupIntent: false }),
  clearSetupIntent: () => set({ setupIntent: false }),
}));
