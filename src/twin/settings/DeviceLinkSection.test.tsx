import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { DeviceLinkSection } from "./DeviceLinkSection";

const fetchDevices = vi.fn();
const fetchHealth = vi.fn();
const setDeviceControl = vi.fn();

vi.mock("../dtamApi", () => ({
  fetchDevices: (...args: unknown[]) => fetchDevices(...args),
  fetchHealth: (...args: unknown[]) => fetchHealth(...args),
  setDeviceControl: (...args: unknown[]) => setDeviceControl(...args),
}));

vi.mock("../../desktop/runtime", () => ({ isTauri: () => true }));
vi.mock("../../desktop/dtamRuntime", () => ({
  revealDtamConfigDir: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  fetchDevices.mockReset();
  fetchHealth.mockReset();
  setDeviceControl.mockReset();
  fetchHealth.mockResolvedValue({ scanner_id: "halbach_48mt", mode: "read_only", connected: true });
  fetchDevices.mockResolvedValue({
    devices: [{ device_id: "pi-01", scanner_id: "halbach_48mt", connected: true, last_received: null, capabilities: null }],
    host: "0.0.0.0",
    port: 8765,
    allow_control: true,
    control_enabled: false,
    error: null,
  });
});

it("shows the device listener and connected board", async () => {
  render(<DeviceLinkSection />);
  expect(await screen.findByText("Port 8765")).toBeInTheDocument();
  expect(screen.getByText("pi-01")).toBeInTheDocument();
  expect(screen.getByText("Connected")).toBeInTheDocument();
});

it("enables physical control when the hardware profile allows it", async () => {
  setDeviceControl.mockResolvedValue({ enabled: true });
  fetchDevices.mockResolvedValueOnce({
    devices: [],
    host: "0.0.0.0",
    port: 8765,
    allow_control: true,
    control_enabled: false,
    error: null,
  }).mockResolvedValue({
    devices: [],
    host: "0.0.0.0",
    port: 8765,
    allow_control: true,
    control_enabled: true,
    error: null,
  });
  render(<DeviceLinkSection />);
  const control = await screen.findByRole("switch", { name: "Physical control" });
  fireEvent.click(control);
  await waitFor(() => expect(setDeviceControl).toHaveBeenCalledWith(true));
});
