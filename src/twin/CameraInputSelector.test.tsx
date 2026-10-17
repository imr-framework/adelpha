import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CameraInputSelector, cameraConstraints, openCamera } from "./CameraInputSelector";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("uses exact device selection with best-effort capture format", () => {
  expect(cameraConstraints("")).toEqual({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  expect(cameraConstraints("camo")).toEqual({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, deviceId: { exact: "camo" } } });
});

it("discovers Camo, selects it, and preserves an unavailable selection on unplug", async () => {
  const media = new EventTarget();
  const enumerateDevices = vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "mac", label: "MacBook Camera" }, { kind: "videoinput", deviceId: "camo", label: "Camo Camera" }, { kind: "audioinput", deviceId: "mic", label: "Microphone" }]);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: Object.assign(media, { enumerateDevices }) });
  const onChange = vi.fn(), onRetry = vi.fn();
  const { rerender } = render(<CameraInputSelector deviceId="" refreshKey={0} onChange={onChange} onRetry={onRetry} />);
  await screen.findByRole("option", { name: "Camo Camera" });
  expect(screen.queryByRole("option", { name: "Microphone" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "camo" } });
  expect(onChange).toHaveBeenCalledWith("camo");
  rerender(<CameraInputSelector deviceId="camo" refreshKey={0} onChange={onChange} onRetry={onRetry} />);
  enumerateDevices.mockResolvedValue([{ kind: "videoinput", deviceId: "mac", label: "MacBook Camera" }]);
  act(() => { media.dispatchEvent(new Event("devicechange")); });
  await screen.findByRole("option", { name: "Selected camera unavailable" });
  expect(screen.getByLabelText("Camera")).toHaveValue("camo");
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(onRetry).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(enumerateDevices).toHaveBeenCalledTimes(3));
});

it("retries unsupported format constraints while preserving the selected device", async () => {
  const stream = {} as MediaStream;
  const getUserMedia = vi.fn().mockRejectedValueOnce(new Error("Invalid constraint")).mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  expect(await openCamera("camo")).toBe(stream);
  expect(getUserMedia.mock.calls[1][0]).toEqual({ audio: false, video: { deviceId: { exact: "camo" } } });
});
it("does not retry permission denial", async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  await expect(openCamera("camo")).rejects.toThrow("Denied");
  expect(getUserMedia).toHaveBeenCalledOnce();
});

it("requests the selected high-rate target without making it a hard camera constraint", () => {
  expect(cameraConstraints("camo", 60)).toEqual({ audio: false, video: {
    width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 }, deviceId: { exact: "camo" },
  } });
});
