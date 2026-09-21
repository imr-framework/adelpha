import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TimestampedQuantity } from "../../dtamTypes";
import { InfoCard, MetricRow, QuantityRow } from "./metrics";

const quantity = (over: Partial<TimestampedQuantity> = {}): TimestampedQuantity =>
  ({ value: 25.5, source: "measured", timestamp: 0, ...over }) as TimestampedQuantity;

describe("InfoCard", () => {
  it("renders its title and body", () => {
    const { container } = render(
      <InfoCard title="Thermal">
        <p>body</p>
      </InfoCard>,
    );
    expect(screen.getByRole("heading", { name: "Thermal" })).toHaveClass("info-card-title");
    expect(container.querySelector(".info-card-body")).toHaveTextContent("body");
  });

  it("omits the footer element when no footer is given", () => {
    const { container } = render(<InfoCard title="Thermal">body</InfoCard>);
    expect(container.querySelector(".info-card-footer")).toBeNull();
  });

  it("renders the footer when given", () => {
    const { container } = render(
      <InfoCard title="Thermal" footer={<span>note</span>}>
        body
      </InfoCard>,
    );
    expect(container.querySelector(".info-card-footer")).toHaveTextContent("note");
  });
});

describe("MetricRow", () => {
  it("renders label and value", () => {
    const { container } = render(<MetricRow label="Room" value="21.0 °C" />);
    expect(container.querySelector(".metric-label")).toHaveTextContent("Room");
    expect(container.querySelector(".metric-value")).toHaveTextContent("21.0 °C");
  });

  it("adds the nested modifier class only when nested", () => {
    const { container: plain } = render(<MetricRow label="a" value="1" />);
    expect(plain.querySelector(".metric-row")).not.toHaveClass("metric-row-nested");

    const { container: nested } = render(<MetricRow label="a" value="1" nested />);
    expect(nested.querySelector(".metric-row")).toHaveClass("metric-row-nested");
  });

  it("renders a source badge labelled by the source", () => {
    render(<MetricRow label="a" value="1" source="measured" />);
    const badge = screen.getByLabelText("measured");
    expect(badge).toHaveClass("src-badge");
  });

  it("omits the badge and confidence when absent", () => {
    const { container } = render(<MetricRow label="a" value="1" />);
    expect(container.querySelector(".src-badge")).toBeNull();
    expect(container.querySelector(".metric-conf")).toBeNull();
  });
});

describe("QuantityRow", () => {
  it("renders an em dash when the quantity is missing", () => {
    const { container } = render(<QuantityRow label="Room" q={null} format={String} />);
    expect(container.querySelector(".metric-value")).toHaveTextContent("—");
    expect(container.querySelector(".src-badge")).toBeNull();
  });

  it("formats the quantity value and shows its source", () => {
    const { container } = render(
      <QuantityRow label="Room" q={quantity()} format={(v) => `${v.toFixed(1)} °C`} />,
    );
    expect(container.querySelector(".metric-value")).toHaveTextContent("25.5 °C");
    expect(screen.getByLabelText("measured")).toBeInTheDocument();
  });

  it("prefers a bare value over the quantity, tagged as nominal by default", () => {
    const { container } = render(
      <QuantityRow label="Nominal B₀" q={quantity()} bare="0.0500 T" format={String} />,
    );
    expect(container.querySelector(".metric-value")).toHaveTextContent("0.0500 T");
    expect(screen.getByLabelText("nominal")).toBeInTheDocument();
  });

  it("honours an explicit bareSource", () => {
    render(<QuantityRow label="a" bare="1" bareSource="measured" format={String} />);
    expect(screen.getByLabelText("measured")).toBeInTheDocument();
  });
});
