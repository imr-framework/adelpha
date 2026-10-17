/** Keep the target cadence under frame jitter; skip missed slots, never catch up with duplicate samples. */
export function nextInferenceDeadline(now: number, previous: number, interval: number): number {
  if (previous <= 0) return now + interval;
  return previous + Math.max(1, Math.floor((now - previous) / interval) + 1) * interval;
}
