import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MagneticCard } from "./MagneticCard";

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
