import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExpandedChartModal } from "./ExpandedChartModal";
import { seriesFixture } from "../testFixtures";
import type { DashboardCard } from "../types";


function renderModal(expandedCard: DashboardCard, onClose = vi.fn()) {
  const view = render(
    <ExpandedChartModal
      expandedCard={expandedCard}
      series={seriesFixture()}
      cameraPreviewStream={null}
      onClose={onClose}
    />,
  );
  return { ...view, onClose };
}

describe("titles", () => {
  it.each([
    ["temp", "Temperature vs Time"],
    ["noiseTime", "Johnson noise spectrum (DFT magnitude)"],
    ["noiseSpec", "Johnson / thermal noise (time domain)"],
    ["mriSpec", "MRI Signal Frequency Spectrum (EMI Highlighted)"],
    ["camPreview", "Camera preview"],
    ["yaw", "Head yaw vs time"],
    ["pitch", "Head pitch vs time"],
    ["roll", "Head roll vs time"],
  ] as [DashboardCard, string][])("titles the %s card", (card, title) => {
    const { container } = renderModal(card);
    expect(container.querySelector(".chart-modal-title")).toHaveTextContent(title);
  });
});

describe("structure", () => {
  it("keeps the backdrop wrapping the modal", () => {
    const { container } = renderModal("temp");
    expect(container.querySelector(".chart-modal-backdrop > .chart-modal")).not.toBeNull();
  });

  it("renders an SVG chart for plotted cards", () => {
    const { container } = renderModal("temp");
    expect(container.querySelector("svg.chart-modal-svg")).not.toBeNull();
  });

  it("renders the camera preview instead of a chart for camPreview", () => {
    const { container } = renderModal("camPreview");
    expect(container.querySelector("svg.chart-modal-svg")).toBeNull();
    expect(container.querySelector(".chart-modal-camera .dash-camera-preview-expanded")).not.toBeNull();
  });

  it("draws the EMI marker on the expanded MRI chart", () => {
    const { container } = renderModal("mriSpec");
    expect(container.querySelector(".dash-emi-marker")).not.toBeNull();
  });
});

describe("dismissal", () => {
  it("closes on the Close button", async () => {
    const { onClose } = renderModal("temp");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click", async () => {
    const { container, onClose } = renderModal("temp");
    await userEvent.click(container.querySelector(".chart-modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a click inside the modal body", async () => {
    const { container, onClose } = renderModal("temp");
    await userEvent.click(container.querySelector(".chart-modal")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
