import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmiCard } from "./EmiCard";

describe("EmiCard", () => {
  it("falls back to an em dash for an absent EMI class", () => {
    render(<EmiCard emi={null} />);
    expect(screen.getByRole("heading", { name: "EMI" })).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the EMI classification label when present", () => {
    render(<EmiCard emi={{ classification_label: "broadband" } as never} />);
    expect(screen.getByText("broadband")).toBeInTheDocument();
  });
});
