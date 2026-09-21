import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SidePanel } from "./SidePanel";

function renderPanel(over: Record<string, unknown> = {}) {
  const props = {
    panelWidth: 380,
    panelCollapsed: false,
    panelMode: "telemetry" as const,
    systemState: null,
    setPanelCollapsed: vi.fn(),
    switchPanelMode: vi.fn(),
    onResizePointerDown: vi.fn(),
    onResizePointerMove: vi.fn(),
    onResizePointerUp: vi.fn(),
    onResizeDoubleClick: vi.fn(),
    ...over,
  };
  const view = render(
    <SidePanel {...props}>
      <div data-testid="telemetry-body">telemetry</div>
    </SidePanel>,
  );
  return { ...view, props };
}

describe("collapsed", () => {
  it("renders only the rail, no aside", () => {
    const { container } = renderPanel({ panelCollapsed: true });
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".panel-edge-rail")).not.toBeNull();
    expect(screen.queryByTestId("telemetry-body")).toBeNull();
  });

  it("expands when the rail is clicked", async () => {
    const { container, props } = renderPanel({ panelCollapsed: true });
    await userEvent.click(container.querySelector(".panel-edge-rail")!);
    expect(props.setPanelCollapsed).toHaveBeenCalledWith(false);
  });

  it("expands from the rail button without double-firing the rail handler", async () => {
    const { props } = renderPanel({ panelCollapsed: true });
    await userEvent.click(screen.getByRole("button", { name: "Expand side panel" }));
    expect(props.setPanelCollapsed).toHaveBeenCalledTimes(1);
    expect(props.setPanelCollapsed).toHaveBeenCalledWith(false);
  });
});

describe("expanded", () => {
  it("keeps the aside, drag edge and mode bar the stylesheet targets", () => {
    const { container } = renderPanel();
    expect(container.querySelector("aside.panel")).not.toBeNull();
    expect(container.querySelector("aside.panel > .panel-edge")).not.toBeNull();
    expect(container.querySelector("aside.panel > .panel-mode-bar")).not.toBeNull();
  });

  it("adds the agents modifier class only in agents mode", () => {
    const { container: telem } = renderPanel();
    expect(telem.querySelector("aside")).not.toHaveClass("panel-agents");

    const { container: agents } = renderPanel({ panelMode: "agents" });
    expect(agents.querySelector("aside")).toHaveClass("panel-agents");
  });

  it("publishes the width on the resize separator", () => {
    const { container } = renderPanel({ panelWidth: 512 });
    expect(container.querySelector(".panel-edge")).toHaveAttribute("aria-valuenow", "512");
  });

  it("marks the active tab", () => {
    renderPanel();
    expect(screen.getByRole("tab", { name: "Telemetry" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Agents" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches mode from the tabs", async () => {
    const { props } = renderPanel();
    await userEvent.click(screen.getByRole("tab", { name: "Agents" }));
    expect(props.switchPanelMode).toHaveBeenCalledWith("agents");
  });

  it("collapses from the edge button", async () => {
    const { props } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Collapse side panel" }));
    expect(props.setPanelCollapsed).toHaveBeenCalledWith(true);
  });

  it("renders children in telemetry mode", () => {
    renderPanel();
    expect(screen.getByTestId("telemetry-body")).toBeInTheDocument();
  });

  it("does not render children in agents mode", () => {
    renderPanel({ panelMode: "agents" });
    expect(screen.queryByTestId("telemetry-body")).toBeNull();
  });
});
