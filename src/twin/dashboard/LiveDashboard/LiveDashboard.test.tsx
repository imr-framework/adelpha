import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LiveDashboard } from "./LiveDashboard";
import { seriesFixture, telemetryFixture } from "../testFixtures";


function renderDashboard(stageMode: "magnet" | "camera", onExpand = vi.fn()) {
  const view = render(
    <LiveDashboard
      series={seriesFixture()}
      stageMode={stageMode}
      cameraPreviewStream={null}
      telemetry={telemetryFixture()}
      onExpand={onExpand}
    />,
  );
  return { ...view, onExpand };
}

describe("LiveDashboard structure", () => {
  it("keeps the grid nesting the stylesheet targets", () => {
    const { container } = renderDashboard("magnet");
    const grid = container.querySelector(".liquid-dashboard > .dash-grid");
    expect(grid).not.toBeNull();
    expect(container.querySelectorAll(".liquid-dashboard > .dash-grid > .dash-card")).toHaveLength(4);
  });
});

describe("magnet stage", () => {
  it("shows the four telemetry cards", () => {
    renderDashboard("magnet");
    expect(screen.getByText("Magnet temperature (time)")).toBeInTheDocument();
    expect(screen.getByText(/Johnson noise spectrum/)).toBeInTheDocument();
    expect(screen.getByText(/Johnson noise \(time\)/)).toBeInTheDocument();
    expect(screen.getByText(/MRI signal spectrum/)).toBeInTheDocument();
  });

  it("does not render the camera cards", () => {
    const { container } = renderDashboard("magnet");
    expect(screen.queryByText("Yaw")).toBeNull();
    expect(container.querySelector(".dash-camera-preview")).toBeNull();
  });

  it("draws the EMI marker on the MRI card", () => {
    const { container } = renderDashboard("magnet");
    expect(container.querySelector(".dash-emi-marker")).not.toBeNull();
  });

  it("expands the temperature card on click", async () => {
    const { onExpand } = renderDashboard("magnet");
    await userEvent.click(screen.getByText("Magnet temperature (time)"));
    expect(onExpand).toHaveBeenCalledWith("temp");
  });

  it("expands the MRI card on click", async () => {
    const { onExpand } = renderDashboard("magnet");
    await userEvent.click(screen.getByText(/MRI signal spectrum/));
    expect(onExpand).toHaveBeenCalledWith("mriSpec");
  });
});

describe("camera stage", () => {
  it("shows the preview plus the three pose cards", () => {
    const { container } = renderDashboard("camera");
    expect(container.querySelector(".dash-camera-preview")).not.toBeNull();
    expect(screen.getByText("Yaw")).toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
    expect(screen.getByText("Roll")).toBeInTheDocument();
  });

  it("does not render the telemetry cards", () => {
    renderDashboard("camera");
    expect(screen.queryByText("Magnet temperature (time)")).toBeNull();
  });

  it("shows an em dash for an empty pose history", () => {
    renderDashboard("camera");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("expands a pose card on click", async () => {
    const { onExpand } = renderDashboard("camera");
    await userEvent.click(screen.getByText("Yaw"));
    expect(onExpand).toHaveBeenCalledWith("yaw");
  });
});
