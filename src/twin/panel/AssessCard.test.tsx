import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TwinAssessment } from "../dtamTypes";
import { AssessCard } from "./AssessCard";

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
