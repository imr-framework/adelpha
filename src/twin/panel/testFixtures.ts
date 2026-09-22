import type { TimestampedQuantity } from "../dtamTypes";

export const q = (
  value: number,
  over: Partial<TimestampedQuantity> = {},
): TimestampedQuantity => ({
  value,
  unit: "degC",
  source: "measured",
  timestamp: "2026-01-01T00:00:00Z",
  confidence: null,
  uncertainty_std: null,
  model_version: null,
  channel_id: null,
  ...over,
});
