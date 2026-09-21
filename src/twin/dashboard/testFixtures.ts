import { renderHook } from "@testing-library/react";

import type { SystemState } from "../dtamTypes";
import { useDashboardSeries } from "./useDashboardSeries";
import type { TwinTelemetry } from "../types";

export function telemetryFixture(over: Partial<TwinTelemetry> = {}): TwinTelemetry {
  return {
    b0_mT: 48,
    b0_setpoint_mT: 48,
    homogeneity_ppm: 0,
    magnet_temp_C: 23,
    electronics_temp_C: 22,
    avg_power_W: 0,
    sequence_active: false,
    door_interlock_ok: true,
    gradient_rms_mTm: 0,
    emi_dBuV: 40,
    noise_floor_dB: -100,
    device_time_ms: 1_700_000_000_000,
    ...over,
  };
}

export function systemStateFixture(over: Partial<SystemState> = {}): SystemState {
  return {
    emi: {
      peak_frequency_hz: { value: 50_000, source: "measured", timestamp: 0 },
      rms_v: { value: 0.01, source: "measured", timestamp: 0 },
    },
    thermal: {
      mean_magnet_temperature_c: { value: 25, source: "measured", timestamp: 0 },
    },
    ...over,
  } as SystemState;
}

/**
 * A fully-populated DashboardSeries for component tests. `showDashboard`
 * matters: pose sampling and the Johnson-noise interval are both gated on it.
 */
export function seriesFixture({ showDashboard = true }: { showDashboard?: boolean } = {}) {
  const { result } = renderHook(() =>
    useDashboardSeries({
      telemetry: telemetryFixture(),
      systemState: systemStateFixture(),
      showDashboard,
      expandedCard: null,
    }),
  );
  return result.current;
}
