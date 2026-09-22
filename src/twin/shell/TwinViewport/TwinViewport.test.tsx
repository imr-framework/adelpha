import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { seriesFixture, telemetryFixture } from "../../dashboard/testFixtures";
import { TwinViewport } from "./TwinViewport";

// The 3D canvas and the camera pipeline need WebGL and MediaPipe; neither adds
// anything to a structural test of the stage.
vi.mock("../../TwinCanvas", () => ({
  TwinCanvas: ({ active }: { active: boolean }) => (
    <div data-testid="twin-canvas" data-active={String(active)} />
  ),
}));
vi.mock("../../CameraFeed", () => ({
  CameraFeed: () => <div data-testid="camera-feed" />,
}));
vi.mock("../../SystemConsole", () => ({ SystemConsole: () => <div data-testid="system-console" /> }));
vi.mock("../../ViewportContextMenu", () => ({
  ViewportContextMenu: () => <div data-testid="context-menu" />,
}));
vi.mock("../../PartInspectorCard", () => ({
  PartInspectorCard: () => <div data-testid="part-inspector" />,
}));
vi.mock("../../PartVisibilityTray", () => ({
  PartVisibilityTray: () => <div data-testid="part-tray" />,
}));


function renderViewport(over: Record<string, unknown> = {}) {
  const setShowDashboard = vi.fn();
  const onViewportToolChange = vi.fn();
  const view = render(
    <TwinViewport
      viewportTool="magnet"
      onViewportToolChange={onViewportToolChange}
      stageMode="magnet"
      showDashboard={false}
      setShowDashboard={setShowDashboard}
      expandedCard={null}
      setExpandedCard={vi.fn()}
      cameraPreviewStream={null}
      setCameraPreviewStream={vi.fn()}
      series={seriesFixture({ showDashboard: false })}
      telemetry={telemetryFixture()}
      scannerId="halbach-48"
      workspace="digital-twin"
      {...over}
    />,
  );
  return { ...view, setShowDashboard, onViewportToolChange };
}

describe("structure", () => {
  it("keeps the section/stage nesting the stylesheet targets", () => {
    const { container } = renderViewport();
    expect(container.querySelector("section.viewport > .viewport-stage")).not.toBeNull();
  });

  it("renders the system console outside the stage", () => {
    const { container } = renderViewport();
    const console = container.querySelector('[data-testid="system-console"]');
    expect(console?.parentElement).toHaveClass("viewport");
  });
});

describe("magnet stage", () => {
  it("shows the CAD canvas, context menu and inspector stack", async () => {
    renderViewport();
    expect(await screen.findByTestId("twin-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("context-menu")).toBeInTheDocument();
    expect(screen.getByTestId("part-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("part-tray")).toBeInTheDocument();
  });

  it("activates the canvas only on the digital-twin workspace", async () => {
    renderViewport();
    expect(await screen.findByTestId("twin-canvas")).toHaveAttribute("data-active", "true");

    renderViewport({ workspace: "imaging-console" });
    const canvases = await screen.findAllByTestId("twin-canvas");
    expect(canvases.at(-1)).toHaveAttribute("data-active", "false");
  });
});

describe("camera stage", () => {
  it("swaps the canvas for the camera feed", async () => {
    renderViewport({ stageMode: "camera" });
    expect(await screen.findByTestId("camera-feed")).toBeInTheDocument();
    expect(screen.queryByTestId("twin-canvas")).toBeNull();
  });

  it("hides the context menu and inspector stack", () => {
    renderViewport({ stageMode: "camera" });
    expect(screen.queryByTestId("context-menu")).toBeNull();
    expect(screen.queryByTestId("part-inspector")).toBeNull();
  });
});

describe("dashboard toggle", () => {
  it("offers to open the dashboard when hidden", async () => {
    const { setShowDashboard } = renderViewport();
    const btn = screen.getByRole("button", { name: "Open live dashboard" });
    await userEvent.click(btn);
    expect(setShowDashboard).toHaveBeenCalledTimes(1);
  });

  it("offers to hide it and renders the grid when shown", () => {
    const { container } = renderViewport({ showDashboard: true });
    expect(screen.getByRole("button", { name: "Hide live dashboard" })).toBeInTheDocument();
    expect(container.querySelector(".liquid-dashboard")).not.toBeNull();
  });

  it("renders the expanded modal only when a card is expanded", () => {
    const { container: none } = renderViewport();
    expect(none.querySelector(".chart-modal-backdrop")).toBeNull();

    const { container: some } = renderViewport({ expandedCard: "temp" });
    expect(some.querySelector(".chart-modal-backdrop")).not.toBeNull();
  });
});
