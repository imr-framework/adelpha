import { beforeEach, expect, it, vi } from "vitest";
import { saveBlob } from "../desktop/saveFile";
import { useHeadMotionStore } from "./headMotionStore";
vi.mock("../desktop/saveFile", () => ({ saveBlob: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); useHeadMotionStore.getState().clearLog(); });
it("routes JSON and CSV through desktop saving and preserves cancellation", async () => {
  vi.mocked(saveBlob).mockResolvedValueOnce("/tmp/motion.json").mockResolvedValueOnce(null);
  expect(await useHeadMotionStore.getState().downloadJson()).toBe("/tmp/motion.json");
  expect(await useHeadMotionStore.getState().downloadCsv()).toBeNull();
  expect(saveBlob).toHaveBeenNthCalledWith(1, expect.stringMatching(/\.json$/), expect.any(Blob));
  expect(saveBlob).toHaveBeenNthCalledWith(2, expect.stringMatching(/\.csv$/), expect.any(Blob));
  expect(vi.mocked(saveBlob).mock.calls[0][1].type).toBe("application/json");
});
it("propagates save failure so the camera HUD can report it", async () => {
  vi.mocked(saveBlob).mockRejectedValue(new Error("Disk unavailable"));
  await expect(useHeadMotionStore.getState().downloadJson()).rejects.toThrow("Disk unavailable");
});

it("stops at 30 minutes even when no face measurements arrive", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    const store = useHeadMotionStore.getState();
    store.clearLog();
    store.startRecording();
    vi.advanceTimersByTime(13 * 60 * 1000);
    expect(useHeadMotionStore.getState().recording).toBe(true);
    vi.advanceTimersByTime(17 * 60 * 1000);
    expect(useHeadMotionStore.getState().recording).toBe(false);
    expect(useHeadMotionStore.getState().recordingLimitReached).toBe(true);
    store.clearLog();
    expect(useHeadMotionStore.getState().recordingLimitReached).toBe(false);
  } finally {
    useHeadMotionStore.getState().clearLog();
    vi.useRealTimers();
  }
});
