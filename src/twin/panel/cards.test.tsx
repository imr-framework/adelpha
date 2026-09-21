import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SystemState, TwinAssessment } from "../dtamTypes";
import type { TwinViewControls } from "../telemetryStore";
import { AssessCard } from "./AssessCard";
import { EmiCard } from "./EmiCard";
import { ForecastCard } from "./ForecastCard";
import { MagneticCard } from "./MagneticCard";
import { NotesCard } from "./NotesCard";
import { RawSensorsCard } from "./RawSensorsCard";
import { RfNoiseCard } from "./RfNoiseCard";
import { ThermalCard } from "./ThermalCard";
import { ViewCard } from "./ViewCard";

import type { TimestampedQuantity } from "../dtamTypes";

const q = (value: number, over: Partial<TimestampedQuantity> = {}): TimestampedQuantity => ({
  value,
  unit: "degC",
  source: "measured",
  timestamp: "2026-01-01T00:00:00Z",
  confidence: null,
  uncertainty_std: null,
  model_version: null,
  channel_id: null,
  ...over,
});

describe("ThermalCard", () => {
  it("renders an em dash for every missing reading", () => {
    const { container } = render(<ThermalCard thermal={null} />);
    expect(screen.getByRole("heading", { name: "Thermal" })).toBeInTheDocument();
    expect(container.querySelectorAll(".metric-value")).toHaveLength(6);
  });

  it("renders channel rows only when channels exist", () => {
    const { container: none } = render(<ThermalCard thermal={{} as never} />);
    expect(none.querySelector(".metric-group")).toBeNull();

    const { container: some } = render(
      <ThermalCard
        thermal={{ channels: [q(24, { channel_id: "probe-a" })] } as never}
      />,
    );
    expect(some.querySelector(".metric-group")).not.toBeNull();
    expect(screen.getByText("probe-a")).toBeInTheDocument();
  });
});

describe("MagneticCard", () => {
  it("renders the physics footnote", () => {
    const { container } = render(<MagneticCard magnetic={null} />);
    expect(container.querySelector(".info-card-footer .physics-note")).not.toBeNull();
  });

  it("shows nominal B0 as a bare value", () => {
    render(<MagneticCard magnetic={{ nominal_b0_t: 0.05 } as never} />);
    expect(screen.getByLabelText("nominal")).toBeInTheDocument();
  });
});

describe("EmiCard and RfNoiseCard", () => {
  it("falls back to an em dash for an absent EMI class", () => {
    render(<EmiCard emi={null} />);
    expect(screen.getByRole("heading", { name: "EMI" })).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the EMI classification label when present", () => {
    render(<EmiCard emi={{ classification_label: "broadband" } as never} />);
    expect(screen.getByText("broadband")).toBeInTheDocument();
  });

  it("renders the RF noise card", () => {
    render(<RfNoiseCard rf={null} />);
    expect(screen.getByRole("heading", { name: "RF noise" })).toBeInTheDocument();
  });
});

describe("NotesCard", () => {
  it("renders nothing when there are no notes", () => {
    const { container } = render(<NotesCard systemState={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders one list item per note", () => {
    const { container } = render(
      <NotesCard systemState={{ notes: ["first", "second"] } as SystemState} />,
    );
    expect(container.querySelectorAll(".notes-list li")).toHaveLength(2);
  });
});

describe("ForecastCard", () => {
  it("disables submit while busy or disconnected", () => {
    const { rerender } = render(<ForecastCard forecastBusy={false} connected={false} />);
    expect(screen.getByRole("button", { name: "Run forecast" })).toBeDisabled();

    rerender(<ForecastCard forecastBusy={true} connected={true} />);
    expect(screen.getByRole("button", { name: "Running forecast…" })).toBeDisabled();

    rerender(<ForecastCard forecastBusy={false} connected={true} />);
    expect(screen.getByRole("button", { name: "Run forecast" })).toBeEnabled();
  });

  it("guards a non-positive horizon on submit", async () => {
    // min={1} means the browser blocks a 0 via the submit button, so the JS
    // guard is exercised by submitting the form directly.
    const { container } = render(<ForecastCard forecastBusy={false} connected={true} />);
    const horizon = screen.getByRole("spinbutton", { name: /Horizon/ });
    await userEvent.clear(horizon);
    fireEvent.submit(container.querySelector(".forecast-form")!);
    expect(await screen.findByText("Horizon must be > 0 seconds")).toBeInTheDocument();
  });

  it("defaults the PINN toggle on", () => {
    render(<ForecastCard forecastBusy={false} connected={true} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});

describe("AssessCard", () => {
  it("disables the action while busy or disconnected", () => {
    const { rerender } = render(
      <AssessCard assessBusy={false} connected={false} lastAssessment={null} />,
    );
    expect(screen.getByRole("button", { name: "Assess live twin" })).toBeDisabled();

    rerender(<AssessCard assessBusy={true} connected={true} lastAssessment={null} />);
    expect(screen.getByRole("button", { name: "Assessing…" })).toBeDisabled();
  });

  it("offers both assessment modes", () => {
    render(<AssessCard assessBusy={false} connected lastAssessment={null} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("observe");
    expect(screen.getByRole("option", { name: "recommend" })).toBeInTheDocument();
  });

  it("summarises a completed assessment and caps findings at five", () => {
    const assessment = {
      overall_status: "nominal",
      overall_confidence: 0.82,
      activated_agents: ["thermal", "emi"],
      explanation: "all clear",
      findings: Array.from({ length: 8 }, (_, i) => ({ code: `f${i}`, summary: `finding ${i}` })),
    } as TwinAssessment;
    const { container } = render(
      <AssessCard assessBusy={false} connected lastAssessment={assessment} />,
    );
    expect(screen.getByText("nominal")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("thermal, emi")).toBeInTheDocument();
    expect(container.querySelectorAll(".notes-list li")).toHaveLength(5);
  });
});

describe("RawSensorsCard", () => {
  it("offers to load the batch and hides the table until asked", () => {
    const { container } = render(<RawSensorsCard sensorsBatch={null} />);
    expect(screen.getByRole("button", { name: "Load /sensors/batch" })).toBeInTheDocument();
    expect(container.querySelector(".raw-table")).toBeNull();
  });
});

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
