import type { ReactNode } from "react";

import type { QuantitySource, TimestampedQuantity } from "../../dtamTypes";
import { formatConfidence, sourceClass, sourceMonogram } from "../../format";

export function InfoCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="info-card">
      <h2 className="info-card-title">{title}</h2>
      <div className="info-card-body">{children}</div>
      {footer ? <div className="info-card-footer">{footer}</div> : null}
    </section>
  );
}

export function MetricRow({
  label,
  value,
  source,
  confidence,
  nested,
}: {
  label: string;
  value: string;
  source?: QuantitySource | null;
  confidence?: string | null;
  nested?: boolean;
}) {
  return (
    <div className={`metric-row${nested ? " metric-row-nested" : ""}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-meta">
        <span className="metric-value">{value}</span>
        {source ? (
          <span
            className={`src-badge ${sourceClass(source)}`}
            title={source}
            aria-label={source}
          >
            {sourceMonogram(source)}
          </span>
        ) : null}
        {confidence ? <span className="metric-conf">{confidence}</span> : null}
      </div>
    </div>
  );
}

export function QuantityRow({
  label,
  q,
  format,
  bare,
  bareSource = "nominal",
  nested,
}: {
  label: string;
  q?: TimestampedQuantity | null;
  format: (v: number) => string;
  bare?: string | null;
  bareSource?: QuantitySource;
  nested?: boolean;
}) {
  if (bare != null) {
    return <MetricRow label={label} value={bare} source={bareSource} nested={nested} />;
  }
  if (!q) {
    return <MetricRow label={label} value="—" nested={nested} />;
  }
  return (
    <MetricRow
      label={label}
      value={format(q.value)}
      source={q.source}
      confidence={formatConfidence(q) || null}
      nested={nested}
    />
  );
}
