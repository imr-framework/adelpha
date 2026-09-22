import { describe, expect, it } from "vitest";

import { linePath, linePathOffset } from "./chartPath";

describe("linePath", () => {
  it("starts with M and continues with L", () => {
    expect(linePath([0, 1, 2], 0, 2, 300, 88)).toBe("M0.00,82.72 L150.00,44.00 L300.00,5.28");
  });

  it("returns an empty string for no values", () => {
    expect(linePath([], 0, 1, 300, 88)).toBe("");
  });

  it("places a single value at x=0", () => {
    expect(linePath([1], 0, 2, 300, 88)).toBe("M0.00,44.00");
  });

  it("does not divide by zero when min equals max", () => {
    const d = linePath([5, 5, 5], 5, 5, 300, 88);
    expect(d).not.toContain("NaN");
    expect(d).not.toContain("Infinity");
  });

  it("caps vertical padding at 6px for tall charts", () => {
    // pad = min(6, height * 0.06); at height 500 the cap binds.
    expect(linePath([0], 0, 1, 100, 500)).toBe("M0.00,494.00");
  });
});

describe("linePathOffset", () => {
  it("translates every point by the offset", () => {
    expect(linePathOffset([0, 1], 0, 1, 676, 330, 64, 30)).toBe("M64.00,352.00 L740.00,38.00");
  });

  it("returns an empty string for no values", () => {
    expect(linePathOffset([], 0, 1, 676, 330, 64, 30)).toBe("");
  });

  it("does not divide by zero when min equals max", () => {
    const d = linePathOffset([5, 5], 5, 5, 676, 330, 64, 30);
    expect(d).not.toContain("NaN");
  });
});
