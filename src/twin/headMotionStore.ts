import { create } from "zustand";
import {
  downloadTextFile,
  formatMotionContextBlock,
  formatMotionSharePrompt,
  HeadMotionRecorder,
  type HeadMotionSample,
} from "./headMotionLog";

const recorder = new HeadMotionRecorder();

type HeadMotionState = {
  sampleCount: number;
  hasReference: boolean;
  refAgeMs: number | null;
  tracking: boolean;
  latestYaw: number;
  latestPitch: number;
  latestRoll: number;
  /** Incremented when Motion menu requests a share-to-agent action. */
  shareRequestId: number;
  sharePrompt: string | null;

  pushSample: (args: {
    matrix: ArrayLike<number>;
    yaw: number;
    pitch: number;
    roll: number;
    detected: boolean;
    wallMs?: number;
  }) => HeadMotionSample;
  syncHud: (patch: {
    sampleCount: number;
    hasReference: boolean;
    refAgeMs: number | null;
    latestYaw: number;
    latestPitch: number;
    latestRoll: number;
    tracking: boolean;
  }) => void;
  setReference: (matrix: ArrayLike<number>) => void;
  clearLog: () => void;
  setTracking: (tracking: boolean) => void;
  downloadJson: () => void;
  downloadCsv: () => void;
  motionContextBlock: () => string;
  requestShareWithAgent: () => void;
  consumeShareRequest: () => string | null;
};

export const useHeadMotionStore = create<HeadMotionState>((set, get) => ({
  sampleCount: 0,
  hasReference: false,
  refAgeMs: null,
  tracking: false,
  latestYaw: 0,
  latestPitch: 0,
  latestRoll: 0,
  shareRequestId: 0,
  sharePrompt: null,

  pushSample: (args) => recorder.push(args),

  setReference: (matrix) => {
    recorder.setReference(matrix);
    set({
      hasReference: true,
      refAgeMs: 0,
    });
  },

  clearLog: () => {
    recorder.clear();
    set({
      sampleCount: 0,
      refAgeMs: recorder.hasReference ? 0 : null,
    });
  },

  setTracking: (tracking) => set({ tracking }),
  syncHud: (patch: {
    sampleCount: number;
    hasReference: boolean;
    refAgeMs: number | null;
    latestYaw: number;
    latestPitch: number;
    latestRoll: number;
    tracking: boolean;
  }) => set(patch),

  downloadJson: () => {
    const payload = recorder.toExport();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(
      `adelpha-head-motion-${stamp}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
      "application/json",
    );
  },

  downloadCsv: () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(
      `adelpha-head-motion-${stamp}.csv`,
      `${recorder.toCsv()}\n`,
      "text/csv",
    );
  },

  motionContextBlock: () => formatMotionContextBlock(recorder),

  requestShareWithAgent: () => {
    const prompt = formatMotionSharePrompt(recorder);
    set({
      shareRequestId: get().shareRequestId + 1,
      sharePrompt: prompt,
    });
  },

  consumeShareRequest: () => {
    const prompt = get().sharePrompt;
    set({ sharePrompt: null });
    return prompt;
  },
}));
