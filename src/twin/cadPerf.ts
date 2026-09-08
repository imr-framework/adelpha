import { create } from "zustand";

/** Large imported CAD: drop shadows, extra DPR, and per-frame material work. */
export const useCadPerfStore = create<{
  heavy: boolean;
  /** How many bodies exploded view can actually move. 0–1 means the GLB is fused. */
  explodePartCount: number;
  setHeavy: (heavy: boolean) => void;
  setExplodePartCount: (explodePartCount: number) => void;
}>((set) => ({
  heavy: false,
  explodePartCount: 0,
  setHeavy: (heavy) => set({ heavy }),
  setExplodePartCount: (explodePartCount) => set({ explodePartCount }),
}));
