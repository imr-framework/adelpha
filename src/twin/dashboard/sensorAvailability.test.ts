import { describe, expect, it } from "vitest";
import { hasSensorMeasurements } from "./sensorAvailability";
import { systemStateFixture } from "./testFixtures";
const now = Date.now();
const state = (source: string, age: number) => systemStateFixture({ thermal: { channels: [{ value: 23, source, timestamp: new Date(now - age).toISOString() }] }, emi: null } as never);
describe("hardware sensor availability", () => {
  it("does not treat a responding API or defaults as measurements", () => {
    expect(hasSensorMeasurements(null, now)).toBe(false);
    expect(hasSensorMeasurements(state("nominal", 0), now)).toBe(false);
    expect(hasSensorMeasurements(state("estimated", 0), now)).toBe(false);
  });
  it("accepts a recent measured channel, including partial connections", () => {
    expect(hasSensorMeasurements(state("measured", 1000), now)).toBe(true);
  });
  it("rejects stale or future measurements", () => {
    expect(hasSensorMeasurements(state("measured", 60000), now)).toBe(false);
    expect(hasSensorMeasurements(state("measured", -60000), now)).toBe(false);
  });
});
