import { useState } from "react";

import type { AssessMode, TwinAssessment } from "../dtamTypes";
import { requestAssess } from "../telemetryStore";
import { InfoCard, MetricRow } from "./metrics";

export function AssessCard({
  assessBusy,
  connected,
  lastAssessment,
}: {
  assessBusy: boolean;
  connected: boolean;
  lastAssessment: TwinAssessment | null;
}) {
  const [assessMode, setAssessMode] = useState<AssessMode>("observe");
  const [assessError, setAssessError] = useState<string | null>(null);

  async function onAssess() {
    setAssessError(null);
    try {
      await requestAssess(assessMode);
    } catch (err) {
      setAssessError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <InfoCard title="Assess">
      <label className="control">
        <span>Mode</span>
        <select
          className="assess-mode-select"
          value={assessMode}
          onChange={(e) => setAssessMode(e.target.value as AssessMode)}
        >
          <option value="observe">observe</option>
          <option value="recommend">recommend</option>
        </select>
      </label>
      <button
        type="button"
        className="action-btn"
        disabled={assessBusy || !connected}
        onClick={() => void onAssess()}
      >
        {assessBusy ? "Assessing…" : "Assess live twin"}
      </button>
      {assessError ? <div className="error-banner">{assessError}</div> : null}
      {lastAssessment ? (
        <div className="assess-summary">
          <MetricRow
            label="Status"
            value={String(lastAssessment.overall_status ?? "—")}
          />
          <MetricRow
            label="Confidence"
            value={
              lastAssessment.overall_confidence != null
                ? `${(lastAssessment.overall_confidence * 100).toFixed(0)}%`
                : "—"
            }
          />
          <MetricRow
            label="Findings"
            value={String(lastAssessment.findings?.length ?? 0)}
          />
          <MetricRow
            label="Agents"
            value={(lastAssessment.activated_agents ?? []).join(", ") || "—"}
          />
          {lastAssessment.explanation ? (
            <p className="physics-note">{lastAssessment.explanation}</p>
          ) : null}
          {lastAssessment.findings?.length ? (
            <ul className="notes-list">
              {lastAssessment.findings.slice(0, 5).map((f, i) => (
                <li key={`${f.code ?? "f"}-${i}`}>
                  {f.severity ? `[${f.severity}] ` : ""}
                  {f.summary ?? f.code ?? "finding"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </InfoCard>
  );
}
