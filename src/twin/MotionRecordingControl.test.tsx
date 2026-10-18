import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MotionRecordingControl } from "./MotionRecordingControl";
import { useHeadMotionStore } from "./headMotionStore";

afterEach(() => { cleanup(); useHeadMotionStore.getState().clearLog(); });

it("Track and Stop gate saved samples while leaving live tracking enabled", () => {
  const store = useHeadMotionStore.getState();
  store.clearLog();
  store.setTracking(true);
  render(<MotionRecordingControl />);
  const pose = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1], yaw: 0, pitch: 0, roll: 0, detected: true };
  act(() => { store.pushSample(pose); });
  expect(useHeadMotionStore.getState().sampleCount).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Track" }));
  expect(screen.getByRole("button", { name: "Stop" })).toHaveAttribute("aria-pressed", "true");
  act(() => { store.pushSample(pose); });
  expect(useHeadMotionStore.getState().sampleCount).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  act(() => { store.pushSample(pose); });
  expect(useHeadMotionStore.getState().sampleCount).toBe(1);
  expect(useHeadMotionStore.getState().tracking).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("paused");
});
