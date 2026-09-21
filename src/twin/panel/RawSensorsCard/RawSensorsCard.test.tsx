import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RawSensorsCard } from "./RawSensorsCard";

describe("RawSensorsCard", () => {
  it("offers to load the batch and hides the table until asked", () => {
    const { container } = render(<RawSensorsCard sensorsBatch={null} />);
    expect(screen.getByRole("button", { name: "Load /sensors/batch" })).toBeInTheDocument();
    expect(container.querySelector(".raw-table")).toBeNull();
  });
});
