import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TwinViewControls } from "../telemetryStore";
import { ViewCard } from "./ViewCard";

describe("ViewCard", () => {
  const view = {
    exploded: 0,
    magnet_cad_scale: 1,
    wireframe: false,
    hybrid_render: false,
    show_temperature_map: false,
  } as TwinViewControls;

  const renderCard = (over: Record<string, unknown> = {}) => {
    const setView = vi.fn();
    const utils = render(
      <ViewCard
        view={view}
        setView={setView}
        scannerId="halbach-48"
        hasCadMagnet={false}
        explodePartCount={0}
        polishedFinish={false}
        setPolishedFinish={vi.fn()}
        {...over}
      />,
    );
    return { ...utils, setView };
  };

  it("shows only the explode slider without a CAD magnet", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("adds scale, finish and render toggles once a CAD magnet is present", () => {
    const { container } = renderCard({ hasCadMagnet: true });
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Show temperature map" })).toBeInTheDocument();
  });

  it("reports the part count once the assembly splits", () => {
    renderCard({ explodePartCount: 7 });
    expect(screen.getByText("(7 parts)")).toBeInTheDocument();
  });

  it("pushes explode slider changes through setView", () => {
    const { container, setView } = renderCard();
    const slider = container.querySelector('input[type="range"]')!;
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(setView).toHaveBeenCalledWith({ exploded: 0.4 });
  });
});
