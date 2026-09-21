import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { HealthResponse, SystemState } from "../dtamTypes";
import { AppTopbar } from "./AppTopbar";

function renderTopbar(over: Record<string, unknown> = {}) {
  const onToggleSettings = vi.fn();
  const view = render(
    <AppTopbar
      health={null}
      systemState={null}
      workspace="digital-twin"
      setWorkspace={vi.fn()}
      showSettings={false}
      onToggleSettings={onToggleSettings}
      {...over}
    />,
  );
  return { ...view, onToggleSettings };
}

describe("branding", () => {
  it("renders the brand block with a decorative logo", () => {
    const { container } = renderTopbar();
    expect(screen.getByText("Adelpha")).toHaveClass("title");
    expect(screen.getByText("The Intelligent Magnetic Resonance Framework")).toHaveClass("subtitle");
    expect(container.querySelector("img.brand-mark")).toHaveAttribute("alt", "");
  });

  it("keeps the header element the stylesheet targets", () => {
    const { container } = renderTopbar();
    expect(container.querySelector("header.topbar > .brand")).not.toBeNull();
    expect(container.querySelector("header.topbar > .topbar-right")).not.toBeNull();
  });
});

describe("scanner identity", () => {
  it("falls back to an em dash with no health or state", () => {
    renderTopbar();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("prefers health over system state", () => {
    renderTopbar({
      health: { scanner_id: "from-health", mode: "live" } as HealthResponse,
      systemState: { scanner_id: "from-state", mode: "sim" } as SystemState,
    });
    expect(screen.getByText("from-health")).toBeInTheDocument();
    expect(screen.queryByText("from-state")).toBeNull();
  });

  it("falls back to system state when health is absent", () => {
    renderTopbar({
      systemState: { scanner_id: "from-state", mode: "sim" } as SystemState,
    });
    expect(screen.getByText("from-state")).toBeInTheDocument();
  });
});

describe("settings button", () => {
  it("exposes its expanded state and control target", () => {
    renderTopbar();
    const btn = screen.getByRole("button", { name: "Settings" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls", "settings-card");
    expect(btn).not.toHaveClass("is-open");
  });

  it("marks itself open while the overlay is showing", () => {
    renderTopbar({ showSettings: true });
    const btn = screen.getByRole("button", { name: "Settings" });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn).toHaveClass("is-open");
  });

  it("calls the toggle once per click", async () => {
    const { onToggleSettings } = renderTopbar();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
  });
});
