import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SensorWaiting } from "./SensorWaiting";
import { subscribeOpenSettings } from "../settingsOpen";
describe("sensor connection view", () => {
  it("opens real settings and provides an inline connection guide", () => {
    const launch = vi.fn(); const off = subscribeOpenSettings(launch);
    render(<SensorWaiting />);
    fireEvent.click(screen.getByRole("button", { name: "Configure sensors" }));
    expect(launch).toHaveBeenCalledWith({ section: "digital-twin" });
    fireEvent.click(screen.getByRole("button", { name: "Connection guide" }));
    expect(screen.getByText("Connect and power the sensor acquisition hardware.")).toBeInTheDocument();
    off();
  });
  it("shows missing data rather than invented telemetry", () => {
    render(<SensorWaiting compact />);
    expect(screen.getByText("Not received")).toBeInTheDocument();
    expect(screen.queryByText("Powered on")).not.toBeInTheDocument();
  });
});
