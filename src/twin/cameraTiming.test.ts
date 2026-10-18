import { expect, it } from "vitest";
import { nextInferenceDeadline } from "./cameraTiming";
it("maintains a 30 Hz target under small frame timing jitter", () => {
  const interval = 1000 / 30;
  let deadline = nextInferenceDeadline(100, 0, interval);
  for (let i = 1; i <= 30; i++) {
    const time = 100 + i * interval + 0.2;
    expect(time).toBeGreaterThanOrEqual(deadline - 1);
    deadline = nextInferenceDeadline(time, deadline, interval);
  }
  expect(deadline).toBeCloseTo(100 + 31 * interval);
});
it("skips missed slots after slow inference without creating catch-up measurements", () => {
  const deadline = nextInferenceDeadline(240, 100, 1000 / 60);
  expect(deadline).toBeGreaterThan(240);
  expect(deadline).toBeLessThanOrEqual(240 + 1000 / 60);
});
