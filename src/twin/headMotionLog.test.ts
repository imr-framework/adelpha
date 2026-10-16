import { describe, expect, it } from "vitest";
import { HeadMotionRecorder } from "./headMotionLog";

const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, 23, 34, 1];
const pose = { matrix, yaw: 1, pitch: 2, roll: 3, detected: true };

describe("export recording", () => {
  it("keeps live transforms available but saves nothing before Track or after Stop", () => {
    const recorder = new HeadMotionRecorder();
    recorder.setReference(matrix, 100);
    const live = recorder.push({ ...pose, wallMs: 200, monotonicMs: 20 });
    expect(live.matrix).toEqual(matrix);
    expect(live.t_rel).toEqual([0, 0, 0]);
    expect(live.t_recording_ms).toBeNull();
    expect(recorder.toExport().samples).toEqual([]);
    recorder.startRecording(300, 30);
    recorder.push({ ...pose, wallMs: 367, monotonicMs: 97 });
    recorder.stopRecording();
    expect(recorder.push({ ...pose, wallMs: 400, monotonicMs: 130 }).matrix).toEqual(matrix);
    expect(recorder.sampleCount).toBe(1);
  });

  it("exports actual millisecond timestamps, includes pauses, and does not fabricate 1ms samples", () => {
    const recorder = new HeadMotionRecorder();
    recorder.startRecording(1000, 50.25);
    recorder.push({ ...pose, wallMs: 1067, monotonicMs: 117.4 });
    recorder.push({ ...pose, wallMs: 1139, monotonicMs: 189.2 });
    recorder.stopRecording();
    recorder.startRecording(2000, 1050.25);
    // Wall-clock adjustment does not reverse the monotonic elapsed time.
    recorder.push({ ...pose, wallMs: 900, monotonicMs: 1117.4 });
    const exported = JSON.parse(JSON.stringify(recorder.toExport()));
    expect(exported.recording.started_at_wall_ms).toBe(1000);
    expect(exported.samples.map((s: {t_recording_ms: number}) => s.t_recording_ms)).toEqual([67, 139, 1067]);
    expect(exported.samples.map((s: {t_wall_ms: number}) => s.t_wall_ms)).toEqual([1067, 1139, 900]);
    expect(exported.samples.map((s: {index: number}) => s.index)).toEqual([0, 1, 2]);
    expect(exported.sample_count).toBe(3);
    expect(recorder.toCsv().split("\n")[0]).toContain("t_recording_ms");
  });

  it("does not save missing-face samples; Clear resets the recording clock but keeps reference", () => {
    const recorder = new HeadMotionRecorder();
    recorder.setReference(matrix);
    recorder.startRecording(1000, 100);
    recorder.push({ ...pose, detected: false });
    expect(recorder.sampleCount).toBe(0);
    recorder.clear();
    expect(recorder.isRecording).toBe(false);
    expect(recorder.hasReference).toBe(true);
    expect(recorder.toExport().recording.started_at_wall_ms).toBeNull();
    recorder.startRecording(2000, 200);
    expect(recorder.push({ ...pose, monotonicMs: 210 }).t_recording_ms).toBe(10);
  });

  it("stops at the limit without silently removing the beginning of a recording", () => {
    const recorder = new HeadMotionRecorder();
    recorder.startRecording(0, 0);
    for (let i = 0; i < 18_001; i++) recorder.push({ ...pose, wallMs: i, monotonicMs: i });
    expect(recorder.sampleCount).toBe(18_000);
    expect(recorder.isRecording).toBe(false);
    expect(recorder.toExport().samples[0]?.index).toBe(0);
    expect(recorder.toExport().recording.limit_reached).toBe(true);
  });
});
