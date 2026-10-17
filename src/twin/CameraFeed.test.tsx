import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCameraInputStore } from "./cameraInputStore";
import { CameraFeed } from "./CameraFeed";
import { useHeadMotionStore } from "./headMotionStore";

const visionMocks = vi.hoisted(() => ({
  files: vi.fn(() => new Promise(() => {})),
  create: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({ FaceLandmarker: { createFromOptions: visionMocks.create }, ImageSegmenter: {}, FilesetResolver: { forVisionTasks: visionMocks.files } }));
afterEach(() => { cleanup(); useHeadMotionStore.getState().clearLog(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("stops the old camera and recording when switching, and handles unplug without fallback", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const mac = Object.assign(new EventTarget(), { label: "MacBook Camera", stop: vi.fn() });
  const camo = Object.assign(new EventTarget(), { label: "Camo Camera", stop: vi.fn() });
  const stream = (track: typeof mac) => ({ getTracks: () => [track], getVideoTracks: () => [track] });
  const getUserMedia = vi.fn().mockResolvedValueOnce(stream(mac)).mockResolvedValueOnce(stream(camo));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: Object.assign(new EventTarget(), {
    getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "camo", label: "Camo Camera" }]),
  }) });
  render(<CameraFeed />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  act(() => { useHeadMotionStore.getState().startRecording(); });
  act(() => useCameraInputStore.getState().restart("camo"));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  expect(mac.stop).toHaveBeenCalledOnce();
  expect(getUserMedia.mock.calls[1]![0].video.deviceId).toEqual({ exact: "camo" });
  expect(useHeadMotionStore.getState().recording).toBe(false);
  act(() => { camo.dispatchEvent(new Event("ended")); });
  expect(await screen.findByText(/Camera disconnected/)).toBeInTheDocument();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});

it("keeps pumping frames and starts tracking when hidden-video callbacks never fire", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    pending.set(++nextId, callback); return nextId;
  }));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  const stalledCallback = vi.fn(() => 1);
  Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: stalledCallback });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const camera = Object.assign(new EventTarget(), { label: "Camo Camera", stop: vi.fn() });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [camera], getVideoTracks: () => [camera] }),
  } });
  const detect = vi.fn(() => ({ faceLandmarks: [], facialTransformationMatrixes: [{ data: [1,0,0,0,0,1,0,0,0,0,1,0,1,2,3,1] }] }));
  visionMocks.files.mockResolvedValueOnce({} as never);
  visionMocks.create.mockResolvedValueOnce({ detectForVideo: detect, close: vi.fn() });
  const { container, unmount } = render(<CameraFeed />);
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "readyState", { value: 4 });
  await screen.findByText("Looking for face…");
  let now = 10000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const advance = (time: number) => act(() => {
    now += 40;
    video.currentTime = time;
    const callbacks = [...pending.values()]; pending.clear();
    callbacks.forEach(callback => callback(now));
  });
  advance(1);
  expect(detect).toHaveBeenCalledOnce();
  expect(useHeadMotionStore.getState().tracking).toBe(true);
  act(() => useHeadMotionStore.getState().startRecording());
  advance(1.04);
  expect(detect).toHaveBeenCalledTimes(2);
  expect(useHeadMotionStore.getState().sampleCount).toBe(1);
  advance(1.04);
  expect(detect).toHaveBeenCalledTimes(2);
  expect(stalledCallback).not.toHaveBeenCalled();
  unmount();
  expect(pending.size).toBe(0);
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).requestVideoFrameCallback;
});
