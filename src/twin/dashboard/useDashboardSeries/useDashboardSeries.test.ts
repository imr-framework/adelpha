import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { telemetryFixture, systemStateFixture } from "../testFixtures";
import {
  FFT_BINS,
  HISTORY_POINTS,
  POSE_HISTORY_POINTS,
  useDashboardSeries,
} from "./useDashboardSeries";

const pose = (n: number) => ({ yaw: n, pitch: n * 2, roll: n * 3 }) as never;

function setup(over: Partial<Parameters<typeof useDashboardSeries>[0]> = {}) {
  return renderHook((props: Parameters<typeof useDashboardSeries>[0]) => useDashboardSeries(props), {
    initialProps: {
      telemetry: telemetryFixture(),
      systemState: systemStateFixture(),
      showDashboard: true,
      expandedCard: null,
      ...over,
    },
  });
}

describe("temperature history", () => {
  it("seeds from the first telemetry frame", () => {
    const { result } = setup();
    expect(result.current.tempHistory).toEqual([23]);
  });

  it("appends a point per distinct telemetry frame", () => {
    const { result, rerender } = setup();
    rerender({
      telemetry: telemetryFixture({ magnet_temp_C: 24, device_time_ms: 1_700_000_001_000 }),
      systemState: systemStateFixture(),
      showDashboard: true,
      expandedCard: null,
    });
    expect(result.current.tempHistory).toEqual([23, 24]);
  });

  it("caps the ring buffer at HISTORY_POINTS", () => {
    const { result, rerender } = setup();
    for (let i = 0; i < HISTORY_POINTS + 25; i++) {
      rerender({
        telemetry: telemetryFixture({ magnet_temp_C: i, device_time_ms: 1_700_000_000_000 + i }),
        systemState: systemStateFixture(),
        showDashboard: true,
        expandedCard: null,
      });
    }
    expect(result.current.tempHistory).toHaveLength(HISTORY_POINTS);
  });

  it("floors and ceilings the temperature axis around the comfort band", () => {
    const { result } = setup();
    // Math.min(20, ...) - 0.5 and Math.max(26, ...) + 0.5 with a 23 °C sample.
    expect(result.current.tempMin).toBe(19.5);
    expect(result.current.tempMax).toBe(26.5);
  });
});

describe("pose history", () => {
  it("ignores pose samples while the dashboard is hidden", () => {
    const { result } = setup({ showDashboard: false });
    act(() => result.current.onCameraPoseUpdate(pose(10)));
    expect(result.current.yawHistory).toEqual([]);
  });

  it("records pose samples while the dashboard is open", () => {
    const { result } = setup();
    act(() => result.current.onCameraPoseUpdate(pose(10)));
    expect(result.current.yawHistory).toEqual([10]);
    expect(result.current.pitchHistory).toEqual([20]);
    expect(result.current.rollHistory).toEqual([30]);
  });

  it("caps pose buffers at POSE_HISTORY_POINTS", () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < POSE_HISTORY_POINTS + 40; i++) result.current.onCameraPoseUpdate(pose(i));
    });
    expect(result.current.yawHistory).toHaveLength(POSE_HISTORY_POINTS);
    expect(result.current.yawHistory.at(-1)).toBe(POSE_HISTORY_POINTS + 39);
  });

  it("clears every pose buffer on reset", () => {
    const { result } = setup();
    act(() => result.current.onCameraPoseUpdate(pose(10)));
    act(() => result.current.resetPoseHistories());
    expect(result.current.yawHistory).toEqual([]);
    expect(result.current.pitchHistory).toEqual([]);
    expect(result.current.rollHistory).toEqual([]);
  });
});

describe("emiBin", () => {
  const binFor = (hz: number) =>
    setup({
      systemState: systemStateFixture({
        emi: {
          peak_frequency_hz: { value: hz, source: "measured", timestamp: 0 },
          rms_v: { value: 0.01, source: "measured", timestamp: 0 },
        },
      } as never),
    }).result.current.emiBin;

  it("maps the 1 kHz floor to the first bin", () => {
    expect(binFor(1e3)).toBe(0);
  });

  it("maps the 100 kHz ceiling to the last bin", () => {
    expect(binFor(1e5)).toBe(FFT_BINS - 1);
  });

  it("clamps below and above the decade window", () => {
    expect(binFor(1)).toBe(0);
    expect(binFor(1e9)).toBe(FFT_BINS - 1);
  });

  it("places 10 kHz at the log-scale midpoint", () => {
    expect(binFor(1e4)).toBe(Math.round((FFT_BINS - 1) / 2));
  });
});

describe("johnson noise ticking", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("produces JOHNSON_SAMPLES-long traces and a half-length spectrum", () => {
    const { result } = setup();
    expect(result.current.johnsonNoise).toHaveLength(240);
    expect(result.current.johnsonSpectrum).toHaveLength(120);
  });

  it("stops resampling when the dashboard is closed and nothing is expanded", () => {
    const { result } = setup({ showDashboard: false });
    const before = result.current.johnsonNoise;
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.johnsonNoise).toBe(before);
  });

  it("keeps resampling for an expanded noise card even when the dashboard is closed", () => {
    const { result } = setup({ showDashboard: false, expandedCard: "noiseSpec" });
    const before = result.current.johnsonNoise;
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.johnsonNoise).not.toBe(before);
  });
});
