import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HeadPose } from "../../CameraFeed";
import type { SystemState } from "../../dtamTypes";
import type { TwinTelemetry } from "../../types";
import { dftMagnitudeSpectrum, sampleJohnsonNoise } from "../noiseMath";
import type { DashboardCard } from "../types";

export const HISTORY_POINTS = 140;
export const POSE_HISTORY_POINTS = 160;
export const FFT_BINS = 72;
/** Samples in the Johnson/thermal noise time-domain trace. */
export const JOHNSON_SAMPLES = 240;

export type DashboardSeries = ReturnType<typeof useDashboardSeries>;

/**
 * Every live trace the dashboard draws: magnet temperature, Johnson noise and
 * its spectrum, the synthetic MRI spectrum, and head pose. Pose samples are
 * dropped while the dashboard is hidden so the camera does not drive renders
 * nobody is looking at.
 */
export function useDashboardSeries({
  telemetry,
  systemState,
  showDashboard,
  expandedCard,
}: {
  telemetry: TwinTelemetry;
  systemState: SystemState | null;
  showDashboard: boolean;
  expandedCard: DashboardCard | null;
}) {
  const [yawHistory, setYawHistory] = useState<number[]>([]);
  const [pitchHistory, setPitchHistory] = useState<number[]>([]);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [timeHistory, setTimeHistory] = useState<number[]>([]);

  useEffect(() => {
    setTempHistory((s) => [...s.slice(-HISTORY_POINTS + 1), telemetry.magnet_temp_C]);
    setTimeHistory((s) => [...s.slice(-HISTORY_POINTS + 1), telemetry.device_time_ms]);
  }, [telemetry.device_time_ms, telemetry.magnet_temp_C]);

  const rangeStart = timeHistory[0] ?? telemetry.device_time_ms;
  const rangeEnd = timeHistory[timeHistory.length - 1] ?? telemetry.device_time_ms;

  const peakHz = systemState?.emi?.peak_frequency_hz?.value ?? 50_000;
  const emiRms = systemState?.emi?.rms_v?.value ?? 0.01;
  const phase = telemetry.device_time_ms / 1000;
  const johnsonTempC =
    systemState?.thermal?.mean_magnet_temperature_c?.value ?? telemetry.magnet_temp_C;

  const [johnsonNoise, setJohnsonNoise] = useState(() =>
    sampleJohnsonNoise(johnsonTempC, JOHNSON_SAMPLES),
  );

  // Live random thermal noise while the dashboard (or related card) is visible.
  useEffect(() => {
    if (!showDashboard && expandedCard !== "noiseSpec" && expandedCard !== "noiseTime") return;
    const tick = () => setJohnsonNoise(sampleJohnsonNoise(johnsonTempC, JOHNSON_SAMPLES));
    tick();
    const id = window.setInterval(tick, 90);
    return () => window.clearInterval(id);
  }, [showDashboard, expandedCard, johnsonTempC]);

  const johnsonAbsMax = Math.max(0.15, ...johnsonNoise.map((v) => Math.abs(v))) * 1.15;
  const johnsonMin = -johnsonAbsMax;
  const johnsonMax = johnsonAbsMax;

  const johnsonSpectrum = useMemo(() => dftMagnitudeSpectrum(johnsonNoise), [johnsonNoise]);
  const johnsonSpecMax = Math.max(0.02, ...johnsonSpectrum) * 1.12;

  // Map peak frequency into FFT bin for highlight (log-ish 1 kHz–100 kHz).
  const emiBin = useMemo(() => {
    const lo = Math.log10(1e3);
    const hi = Math.log10(1e5);
    const t = (Math.log10(Math.max(peakHz, 1e3)) - lo) / (hi - lo);
    return Math.round(Math.min(1, Math.max(0, t)) * (FFT_BINS - 1));
  }, [peakHz]);

  const mriSpectrum = useMemo(
    () =>
      Array.from({ length: FFT_BINS }, (_, i) => {
        const f = i / FFT_BINS;
        const carrier = 0.12 + 0.45 * Math.exp(-Math.pow((f - 0.48) / 0.09, 2));
        const sideA = 0.18 * Math.exp(-Math.pow((f - 0.27) / 0.05, 2));
        const sideB = 0.14 * Math.exp(-Math.pow((f - 0.68) / 0.06, 2));
        const shimmer = 0.03 * Math.sin(phase * 4 + i * 0.25);
        const emiHit = Math.abs(i - emiBin) <= 1 ? 0.35 * Math.min(1.5, emiRms / 0.01) : 0;
        return Math.max(0.01, carrier + sideA + sideB + shimmer + emiHit);
      }),
    [phase, emiBin, emiRms],
  );

  const mriSpecMin = 0;
  const mriSpecMax = Math.max(0.2, ...mriSpectrum) * 1.05;

  const tempMin = Math.min(20, ...tempHistory, telemetry.magnet_temp_C) - 0.5;
  const tempMax = Math.max(26, ...tempHistory, telemetry.magnet_temp_C) + 0.5;

  const showDashboardRef = useRef(showDashboard);
  showDashboardRef.current = showDashboard;

  const onCameraPoseUpdate = useCallback((pose: HeadPose) => {
    if (!showDashboardRef.current) return;
    setYawHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.yaw]);
    setPitchHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.pitch]);
    setRollHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.roll]);
  }, []);

  const resetPoseHistories = useCallback(() => {
    setYawHistory([]);
    setPitchHistory([]);
    setRollHistory([]);
  }, []);

  const yawMin = Math.min(-30, ...yawHistory, -5) - 2;
  const yawMax = Math.max(30, ...yawHistory, 5) + 2;
  const pitchMin = Math.min(-30, ...pitchHistory, -5) - 2;
  const pitchMax = Math.max(30, ...pitchHistory, 5) + 2;
  const rollMin = Math.min(-30, ...rollHistory, -5) - 2;
  const rollMax = Math.max(30, ...rollHistory, 5) + 2;

  return {
    tempHistory,
    tempMin,
    tempMax,
    rangeStart,
    rangeEnd,
    peakHz,
    johnsonTempC,
    johnsonNoise,
    johnsonMin,
    johnsonMax,
    johnsonSpectrum,
    johnsonSpecMax,
    emiBin,
    mriSpectrum,
    mriSpecMin,
    mriSpecMax,
    yawHistory,
    yawMin,
    yawMax,
    pitchHistory,
    pitchMin,
    pitchMax,
    rollHistory,
    rollMin,
    rollMax,
    onCameraPoseUpdate,
    resetPoseHistories,
  };
}
