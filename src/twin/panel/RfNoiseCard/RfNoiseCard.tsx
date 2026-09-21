import type { SystemState } from "../../dtamTypes";
import { formatHz, formatNoiseFloor } from "../../format";
import { InfoCard, MetricRow, QuantityRow } from "../metrics";

export function RfNoiseCard({ rf }: { rf: SystemState["rf"] | null }) {
  return (
    <InfoCard title="RF noise">
      <QuantityRow
        label="Noise floor"
        q={rf?.noise_floor_dbm_per_hz}
        format={(v) => formatNoiseFloor(v)}
      />
      <MetricRow
        label="Bandwidth"
        value={rf?.noise_bandwidth_hz != null ? formatHz(rf.noise_bandwidth_hz) : "—"}
      />
      <QuantityRow
        label="SNR est."
        q={rf?.snr_estimate_db}
        format={(v) => `${v.toFixed(2)} dB`}
      />
    </InfoCard>
  );
}
