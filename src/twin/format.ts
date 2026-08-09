import type { QuantitySource, TimestampedQuantity } from "./dtamTypes";

export function formatTempC(v: number | null | undefined, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)} °C`;
}

export function formatB0T(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toExponential(6)} T`;
}

export function formatFreqMHz(v: number | null | undefined, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)} MHz`;
}

export function formatHz(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} kHz`;
  return `${v.toFixed(1)} Hz`;
}

export function formatRmsV(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toExponential(3)} V`;
}

export function formatNoiseFloor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)} dBm/Hz`;
}

export function formatConfidence(q: TimestampedQuantity | null | undefined): string {
  if (!q || q.confidence == null) return "";
  return `conf ${(q.confidence * 100).toFixed(0)}%`;
}

export function quantityLabel(q: TimestampedQuantity | null | undefined, format: (v: number) => string): string {
  if (!q) return "—";
  return format(q.value);
}

export function sourceClass(source: QuantitySource | undefined): string {
  switch (source) {
    case "measured":
      return "src-measured";
    case "estimated":
      return "src-estimated";
    case "predicted":
      return "src-predicted";
    case "nominal":
      return "src-nominal";
    default:
      return "";
  }
}

/** Single-letter monogram for compact source rings (M/E/P/N). */
export function sourceMonogram(source: QuantitySource | undefined): string {
  switch (source) {
    case "measured":
      return "M";
    case "estimated":
      return "E";
    case "predicted":
      return "P";
    case "nominal":
      return "N";
    default:
      return "?";
  }
}

export function formatIsoTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString();
}
