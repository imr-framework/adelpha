import { saveBlob } from "../desktop/saveFile";
import { create } from "zustand";
import {
  formatMotionContextBlock,
  formatMotionSharePrompt,
  HeadMotionRecorder,
  type HeadMotionSample,
} from "./headMotionLog";

const recorder = new HeadMotionRecorder();
let recordingTimer: ReturnType<typeof setTimeout> | undefined;
function cancelRecordingTimer() { clearTimeout(recordingTimer); recordingTimer = undefined; }

type HeadMotionState = {
  sampleCount: number;
  recording: boolean;
  recordingLimitReached: boolean;
  startRecording: () => void;
  stopRecording: () => void;
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
    monotonicMs?: number;
    cameraSource?: string;
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
  clearReference: () => void;
  clearLog: () => void;
  setTracking: (tracking: boolean) => void;
  downloadJson: () => Promise<string | null>;
  downloadCsv: () => Promise<string | null>;
  motionContextBlock: () => string;
  requestShareWithAgent: () => void;
  consumeShareRequest: () => string | null;
};

export const useHeadMotionStore = create<HeadMotionState>((set, get) => ({
  sampleCount: 0,
  recording: false,
  recordingLimitReached: false,
  hasReference: false,
  refAgeMs: null,
  tracking: false,
  latestYaw: 0,
  latestPitch: 0,
  latestRoll: 0,
  shareRequestId: 0,
  sharePrompt: null,

  startRecording: () => {
    recorder.startRecording();
    cancelRecordingTimer();
    set({ recording: recorder.isRecording, recordingLimitReached: recorder.limitReached });
    if (recorder.isRecording) recordingTimer = setTimeout(() => {
      recorder.checkDuration();
      set({ recording: recorder.isRecording, recordingLimitReached: recorder.limitReached });
    }, recorder.remainingDurationMs());
  },
  stopRecording: () => {
    cancelRecordingTimer();
    recorder.stopRecording();
    set({ recording: false });
  },
  pushSample: (args) => {
    const sample = recorder.push(args);
    set({ sampleCount: recorder.sampleCount, recording: recorder.isRecording, recordingLimitReached: recorder.limitReached });
    return sample;
  },

  setReference: (matrix) => {
    recorder.setReference(matrix);
    set({
      hasReference: true,
      refAgeMs: 0,
    });
  },

  clearReference: () => {
    recorder.clearReference();
    set({ hasReference: false, refAgeMs: null });
  },

  clearLog: () => {
    cancelRecordingTimer();
    recorder.clear();
    set({
      sampleCount: 0,
      recording: false,
      recordingLimitReached: false,
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
    return saveBlob(
      `adelpha-head-motion-${stamp}.json`,
      new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }),
    );
  },

  downloadCsv: () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return saveBlob(
      `adelpha-head-motion-${stamp}.csv`,
      new Blob([`${recorder.toCsv()}\n`], { type: "text/csv;charset=utf-8" }),
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
