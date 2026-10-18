import { create } from "zustand";
import { useHeadMotionStore } from "./headMotionStore";

/** Session-scoped: media device identifiers belong to the current host/origin. */
export const useCameraInputStore = create<{
  targetHz: 15 | 30 | 60; setTargetHz: (rate: 15 | 30 | 60) => void;
  deviceId: string; attempt: number; refreshKey: number;
  restart: (deviceId: string) => void; opened: () => void;
}>((set) => ({
  targetHz: 30,
  setTargetHz: targetHz => {
    if (targetHz !== 15 && targetHz !== 30 && targetHz !== 60) return;
    useHeadMotionStore.getState().stopRecording();
    set(state => ({ targetHz, attempt: state.attempt + 1 }));
  },
  deviceId: "", attempt: 0, refreshKey: 0,
  restart: deviceId => {
    const motion = useHeadMotionStore.getState();
    motion.stopRecording();
    motion.clearReference();
    motion.setTracking(false);
    set(state => ({ deviceId, attempt: state.attempt + 1 }));
  },
  opened: () => set(state => ({ refreshKey: state.refreshKey + 1 })),
}));
