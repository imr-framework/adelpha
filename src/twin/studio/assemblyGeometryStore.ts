import { create } from "zustand";
import type { AssemblyInstance, LengthUnit } from "./geometryPrep";

type GeometryMap = Record<string, AssemblyInstance[]>;

type AssemblyGeometryStore = {
  instances: GeometryMap;
  units: LengthUnit;
  setUnits: (units: LengthUnit) => void;
  setInstances: (scannerId: string, instances: AssemblyInstance[]) => void;
};

export const useAssemblyGeometryStore = create<AssemblyGeometryStore>((set) => ({
  instances: {},
  units: "m",
  setUnits: (units) => set({ units }),
  setInstances: (scannerId, instances) =>
    set((state) => ({ instances: { ...state.instances, [scannerId]: instances } })),
}));
