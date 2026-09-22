import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/** Guards the test harness itself: jsdom, the JSX transform, and jest-dom matchers. */
describe("test harness", () => {
  it("renders JSX into jsdom", () => {
    render(<p className="probe">ready</p>);
    expect(screen.getByText("ready")).toHaveClass("probe");
  });

  it("exposes a writable localStorage", () => {
    localStorage.setItem("probe", "1");
    expect(localStorage.getItem("probe")).toBe("1");
  });
});
