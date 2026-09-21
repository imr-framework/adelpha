import type { SystemState } from "../../dtamTypes";
import { formatTempC } from "../../format";
import { InfoCard, MetricRow, QuantityRow } from "../metrics";

export function ThermalCard({ thermal }: { thermal: SystemState["thermal"] | null }) {
  return (
    <InfoCard title="Thermal">
      <QuantityRow
        label="Mean magnet"
        q={thermal?.mean_magnet_temperature_c}
        format={(v) => formatTempC(v)}
      />
      <QuantityRow
        label="Room"
        q={thermal?.room_temperature_c}
        format={(v) => formatTempC(v)}
      />
      <QuantityRow
        label="ΔT vs ref"
        q={thermal?.delta_magnet_temperature_c}
        format={(v) => formatTempC(v)}
      />
      <MetricRow
        label="Reference"
        value={
          thermal?.reference_magnet_temperature_c != null
            ? formatTempC(thermal.reference_magnet_temperature_c, 1)
            : "—"
        }
      />
      <QuantityRow
        label="Gradient"
        q={thermal?.thermal_gradient_c}
        format={(v) => formatTempC(v)}
      />
      <QuantityRow
        label="Predicted mean"
        q={thermal?.predicted_mean_magnet_temperature_c}
        format={(v) => formatTempC(v)}
      />
      {thermal?.channels?.length ? (
        <details className="metric-group" open>
          <summary className="metric-group-summary">Channels</summary>
          <div className="metric-group-body">
            {thermal.channels.map((ch) => (
              <QuantityRow
                key={ch.channel_id ?? ch.timestamp}
                label={ch.channel_id ?? "channel"}
                q={ch}
                format={(v) => formatTempC(v)}
                nested
              />
            ))}
          </div>
        </details>
      ) : null}
    </InfoCard>
  );
}
