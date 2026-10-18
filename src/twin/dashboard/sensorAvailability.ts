import type { MeasurementBatch, SensorMeasurement, SystemState, TimestampedQuantity } from "../dtamTypes";

export function isRecentMeasurement(q: TimestampedQuantity | null | undefined, now = Date.now()): boolean {
  if (!q || q.source !== "measured" || !Number.isFinite(q.value)) return false;
  const age = now - Date.parse(q.timestamp);
  return Number.isFinite(age) && age >= -5000 && age < 30_000;
}

export function isUsableBatchMeasurement(m: SensorMeasurement | null | undefined, now = Date.now()): boolean {
  if (!m || !Number.isFinite(m.value)) return false;
  if (m.validity && m.validity !== "valid" && m.validity !== "suspect") return false;
  const age = now - Date.parse(m.timestamp);
  return Number.isFinite(age) && age >= -5000 && age < 30_000;
}

// A live API or nominal/estimated defaults alone do not establish sensor reception.
export function hasSensorMeasurements(
  state: SystemState | null,
  now = Date.now(),
  batch: MeasurementBatch | null = null,
): boolean {
  if (batch?.measurements.some((m) => isUsableBatchMeasurement(m, now))) return true;
  if (!state) return false;
  const quantities: (TimestampedQuantity | null | undefined)[] = [
    ...(state.thermal?.channels ?? []), ...(state.emi?.channels ?? []), ...(state.rf?.channels ?? []),
    state.thermal?.mean_magnet_temperature_c, state.thermal?.room_temperature_c,
    state.magnetic?.b0_t, state.emi?.rms_v, state.emi?.peak_frequency_hz,
    state.rf?.noise_floor_dbm_per_hz,
  ];
  return quantities.some(q => isRecentMeasurement(q, now));
}
