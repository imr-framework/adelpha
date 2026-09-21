import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SystemState } from "../dtamTypes";
import type { TwinViewControls } from "../telemetryStore";
import { TelemetryPanel } from "./TelemetryPanel";

function renderPanel(over: Record<string, unknown> = {}) {
  return render(
    <TelemetryPanel
      systemState={null}
      lastError={null}
      connected={false}
      forecastBusy={false}
      assessBusy={false}
      lastAssessment={null}
      sensorsBatch={null}
      view={{ exploded: 0, magnet_cad_scale: 1 } as TwinViewControls}
      setView={vi.fn()}
      scannerId="halbach-48"
      hasCadMagnet={false}
      explodePartCount={0}
      polishedFinish={false}
      setPolishedFinish={vi.fn()}
      {...over}
    />,
  );
}

describe("TelemetryPanel", () => {
  it("stacks the eight always-on cards in order", () => {
    renderPanel();
    const titles = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(titles).toEqual([
      "Thermal",
      "Magnetic / B₀",
      "EMI",
      "RF noise",
      "Forecast",
      "Assess",
      "Raw sensors",
      "View",
    ]);
  });

  it("inserts Notes between Assess and Raw sensors when present", () => {
    renderPanel({ systemState: { notes: ["a note"] } as SystemState });
    const titles = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(titles.indexOf("Notes")).toBe(titles.indexOf("Assess") + 1);
    expect(titles.indexOf("Notes")).toBe(titles.indexOf("Raw sensors") - 1);
  });

  it("keeps every card inside the info-card-stack", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll(".info-card-stack > .info-card")).toHaveLength(8);
  });

  it("hides the error banner when there is no error", () => {
    const { container } = renderPanel();
    expect(container.querySelector(".error-banner")).toBeNull();
  });

  it("shows the error banner as a status region", () => {
    renderPanel({ lastError: "twin offline" });
    expect(screen.getByRole("status")).toHaveTextContent("twin offline");
  });
});
