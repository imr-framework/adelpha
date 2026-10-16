import { useHeadMotionStore } from "./headMotionStore";

/** Recording affects exported samples only; visual tracking stays live. */
export function MotionRecordingControl() {
  const recording = useHeadMotionStore(state => state.recording);
  const limitReached = useHeadMotionStore(state => state.recordingLimitReached);
  return <>
    <button
      type="button"
      className={`camera-mask-btn${recording ? " camera-mask-btn-active" : ""}`}
      aria-pressed={recording}
      disabled={limitReached}
      title={recording ? "Stop saving samples; live tracking continues" : "Save new motion samples for export; live tracking continues"}
      onClick={() => {
        const store = useHeadMotionStore.getState();
        if (store.recording) store.stopRecording();
        else store.startRecording();
      }}
    >{recording ? "Stop" : "Track"}</button>
    <p className="camera-head-hint" role="status">
      {limitReached ? "Log full — export, then clear to record again" : recording ? "Recording measurements" : "Export recording paused"}
    </p>
  </>;
}
