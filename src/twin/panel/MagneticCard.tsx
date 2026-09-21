import type { SystemState } from "../dtamTypes";
import { formatB0T, formatFreqMHz } from "../format";
import { InfoCard, QuantityRow } from "./metrics";

export function MagneticCard({ magnetic }: { magnetic: SystemState["magnetic"] | null }) {
  return (
    <InfoCard
      title="Magnetic / B₀"
      footer={
        <p className="physics-note">
          Thermal → B₀: ΔB₀ ≈ α<sub>T</sub> · ΔT (default α<sub>T</sub> ≈ −5×10⁻⁵ T/°C).
          Frequency in MHz.
        </p>
      }
    >
      <QuantityRow
        label="Nominal B₀"
        bare={magnetic ? formatB0T(magnetic.nominal_b0_t) : null}
        format={formatB0T}
      />
      <QuantityRow label="Estimated B₀" q={magnetic?.b0_t} format={formatB0T} />
      <QuantityRow label="ΔB₀" q={magnetic?.delta_b0_t} format={formatB0T} />
      <QuantityRow
        label="f₀"
        q={magnetic?.resonant_frequency_mhz}
        format={(v) => formatFreqMHz(v)}
      />
      <QuantityRow label="Predicted B₀" q={magnetic?.predicted_b0_t} format={formatB0T} />
      <QuantityRow
        label="Predicted f₀"
        q={magnetic?.predicted_frequency_mhz}
        format={(v) => formatFreqMHz(v)}
      />
    </InfoCard>
  );
}
