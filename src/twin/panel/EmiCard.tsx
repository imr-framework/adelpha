import type { SystemState } from "../dtamTypes";
import { formatHz, formatRmsV } from "../format";
import { InfoCard, MetricRow, QuantityRow } from "./metrics";

export function EmiCard({ emi }: { emi: SystemState["emi"] | null }) {
  return (
    <InfoCard title="EMI">
      <QuantityRow label="RMS" q={emi?.rms_v} format={(v) => formatRmsV(v)} />
      <QuantityRow
        label="Peak freq"
        q={emi?.peak_frequency_hz}
        format={(v) => formatHz(v)}
      />
      <MetricRow label="Class" value={emi?.classification_label ?? "—"} />
    </InfoCard>
  );
}
