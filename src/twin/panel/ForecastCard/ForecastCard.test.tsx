import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ForecastCard } from "./ForecastCard";

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
