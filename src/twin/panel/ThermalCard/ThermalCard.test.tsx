import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThermalCard } from "./ThermalCard";
import { q } from "../testFixtures";

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
