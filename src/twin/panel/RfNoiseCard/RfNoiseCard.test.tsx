import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RfNoiseCard } from "./RfNoiseCard";

describe("RfNoiseCard", () => {
  it("renders the RF noise card", () => {
    render(<RfNoiseCard rf={null} />);
    expect(screen.getByRole("heading", { name: "RF noise" })).toBeInTheDocument();
  });
});
