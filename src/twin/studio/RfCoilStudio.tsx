import { useProjectState, useProjectRun, useProjectBusy } from "./ProjectPersistence";
import { ArrowRight, ChevronDown, ChevronRight, Download, Play, RotateCcw } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { saveBlob } from "../../desktop/saveFile";
import { simulateRfCoil, type RfCoilRequest, type RfCoilSimulation } from "../mri/api";
import { windingStl } from "./coilStl";
import {
  formatFixed,
  Metric,
  NumericField,
  ProjectPanel,
  SegmentedControl,
  WorkspaceShell,
} from "./workspace";

const CoilLayoutView = lazy(() => import("./CoilLayout").then((module) => ({ default: module.CoilLayoutView })));

type RfView = "3d" | "layout" | "quality";

type Draft = {
  radius_mm: number;
  length_mm: number;
  former_mm: number;
  grooves: number;
  freq_mhz: number;
  allow_bucking: boolean;
  n_max: number;
};

const DEFAULT_DRAFT: Draft = {
  radius_mm: 30,
  length_mm: 180,
  former_mm: 5,
  grooves: 45,
  freq_mhz: 10.64,
  allow_bucking: true,
  n_max: 1,
};

function requestKey(draft: Draft) {
  return JSON.stringify(draft);
}

function errorPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function RfCoilStudio({
  projectName,
  onClose,
}: {
  projectName: string;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useProjectState<Draft>("rf.draft", DEFAULT_DRAFT);
  const [result, setResult] = useProjectState<RfCoilSimulation | null>("rf.result", null);
  const [resultKey, setResultKey] = useProjectState("rf.resultKey", "");
  const [view, setView] = useProjectState<RfView>("rf.view", "3d");
  const [showFormer, setShowFormer] = useProjectState("rf.showFormer", true);
  const [resetNonce, setResetNonce] = useState(0);
  const [resultsOpen, setResultsOpen] = useProjectState("rf.resultsOpen", true);
  const [locallyRunning, setRunning] = useState(false);
  const [savingStl, setSavingStl] = useState(false);
  const running = useProjectBusy() || locallyRunning;
  const [error, setError] = useProjectState("rf.error", "");

  const request: RfCoilRequest = {
    radius_mm: draft.radius_mm,
    length_mm: draft.length_mm,
    former_mm: draft.former_mm,
    grooves: draft.grooves,
    freq_mhz: draft.freq_mhz,
    allow_bucking: draft.allow_bucking,
    n_max: draft.n_max,
  };
  const currentKey = requestKey(draft);
  const stale = Boolean(result && resultKey && resultKey !== currentKey);
  const reportedError = result ? errorPercent(result.mean_field_error) : null;
  const fieldFigure = result?.field_png || result?.surface_png;

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  const captureRun = useProjectRun("rf");
  async function run() {
    const archive = captureRun();
    setRunning(true);
    setError("");
    try {
      const next = await simulateRfCoil(request);
      setResult(next);
      archive("RF coil", { "rf.result": next, "rf.resultKey": currentKey });
      setResultKey(currentKey);
    } catch (err) {
      archive("RF coil · failed", { "rf.error": err instanceof Error ? err.message : "Simulation failed", "rf.result": null });
      setResult(null);
      setResultKey("");
      setError(err instanceof Error ? err.message : "RF coil simulation failed.");
    } finally {
      archive.cancel();
      setRunning(false);
    }
  }

  async function saveStl() {
    if (!result?.layout?.wires?.length) return;
    setSavingStl(true);
    setError("");
    try {
      const saved = await saveBlob(
        "rf-solenoid.stl",
        new Blob([windingStl(result.layout)], { type: "model/stl" }),
      );
      if (saved == null) return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The winding STL could not be saved.");
    } finally {
      setSavingStl(false);
    }
  }

  return (
    <WorkspaceShell kind="rf" label="RF coils">
      <div className="ws-body">
        <main className="ws-viewer">
          <div className="ws-stage">
            {view === "quality" ? (
              result && fieldFigure ? (
                <figure className="ws-surface">
                  <img src={`data:image/png;base64,${fieldFigure}`} alt={`${result.title} field quality`} />
                </figure>
              ) : (
                <section className="ws-quality">
                  <h2>Understand the result.</h2>
                  {result ? (
                    <>
                      <p>Values reported by the connected solver for this completed run.</p>
                      <div className="ws-qrow">
                        <span>Max relative error</span>
                        <strong className={reportedError != null && reportedError > 0 ? "ws-warning" : undefined}>
                          {reportedError != null ? `${reportedError}%` : "Not reported"}
                        </strong>
                      </div>
                      <div className="ws-qrow">
                        <span>Error definition</span>
                        <span className="ws-muted">{result.error_definition ?? "Error definition unavailable for this run."}</span>
                      </div>
                    </>
                  ) : (
                    <p>Run a design to compare the target and achieved on-axis B1.</p>
                  )}
                </section>
              )
            ) : view === "layout" ? (
              result?.layout_png ? (
                <figure className="ws-surface">
                  <img src={`data:image/png;base64,${result.layout_png}`} alt={`${result.title} side view`} />
                </figure>
              ) : (
                <p className="ws-empty">{running ? "Optimizing the winding…" : "Side view appears after a completed run."}</p>
              )
            ) : result ? (
              <Suspense fallback={<p className="ws-empty">Drawing the winding…</p>}>
                <CoilLayoutView
                  layout={result.layout}
                  label={`${result.title} layout`}
                  showFormer={showFormer}
                  resetNonce={resetNonce}
                />
              </Suspense>
            ) : (
              <p className="ws-empty">{running ? "Optimizing the winding…" : "Run a design to place solenoid turns."}</p>
            )}
          </div>
          <nav className="ws-viewbar" aria-label="Inspect design">
            <SegmentedControl
              label="Inspect design"
              className="ws-seg-ghost"
              value={view}
              options={[
                { id: "3d", label: "3D windings" },
                { id: "layout", label: "Side view" },
                { id: "quality", label: "Field quality" },
              ]}
              onChange={setView}
            />
            {view === "3d" ? (
              <div className="ws-scene-tools">
                <span className="ws-small ws-muted">Solenoid · bore along Z</span>
                <div className="ws-row">
                  <label className="ws-row ws-small">
                    <input type="checkbox" checked={showFormer} onChange={(event) => setShowFormer(event.target.checked)} />
                    Former
                  </label>
                  <button type="button" className="ws-quiet" onClick={() => setResetNonce((value) => value + 1)}>
                    <RotateCcw aria-hidden="true" /> Reset view
                  </button>
                </div>
              </div>
            ) : null}
          </nav>
          <div className={`ws-overlay-bottom${resultsOpen ? "" : " is-collapsed"}`}>
            {view === "3d" ? (
              <div className="ws-caption">
                <span>{result ? "Drag to rotate · closed circular turns" : "Former and windings appear after a completed run"}</span>
                <span>
                  Forward <span style={{ color: "#6ea8ff" }}>━</span> bucking <span style={{ color: "#e07070" }}>━</span> · former in translucent grey
                </span>
              </div>
            ) : null}
            {view === "layout" && result ? (
              <div className="ws-caption">
                <span>Axial section · former and AWG 20 turns</span>
                <span>Closed winding loops · millimetre STL after a completed run</span>
              </div>
            ) : null}
            <button
              type="button"
              className="ws-quiet ws-overlay-toggle"
              aria-expanded={resultsOpen}
              aria-controls="ws-run-results"
              aria-label={resultsOpen ? "Hide results" : "Show results"}
              onClick={() => setResultsOpen((open) => !open)}
            >
              {resultsOpen ? null : (
                <span className="ws-overlay-compact">
                  <span>
                    {result ? result.loop_count : "—"} turns
                    <span className="ws-overlay-sep" aria-hidden="true">
                      ·
                    </span>
                    {result?.inductance_uh != null ? `${result.inductance_uh} µH` : "—"}
                    <span className="ws-overlay-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className={reportedError != null ? "ws-warning" : undefined}>
                      {reportedError != null ? `${reportedError}%` : "—"}
                    </span>
                  </span>
                </span>
              )}
              <ChevronDown aria-hidden="true" />
            </button>
            {resultsOpen ? (
              <div id="ws-run-results">
                {result && reportedError != null && !stale && view !== "quality" ? (
                  <div className="ws-notice">
                    <div>
                      <strong>Review the reported {reportedError}% max error</strong>
                      <p>{result.error_definition ?? "On-axis B1 relative to the uniform target."}</p>
                    </div>
                    <button type="button" onClick={() => setView("quality")}>
                      Inspect quality <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                <div className="ws-metrics">
                  <Metric label="Generated turns" value={result ? result.loop_count : "—"} />
                  <Metric
                    label="Inductance"
                    value={result?.inductance_uh != null ? formatFixed(result.inductance_uh, 2) : "—"}
                    unit={result?.inductance_uh != null ? "µH" : undefined}
                  />
                  <Metric
                    label="Reported max error"
                    value={reportedError != null ? reportedError : "—"}
                    unit={reportedError != null ? "%" : undefined}
                    warning={reportedError != null}
                  />
                </div>
                <div className="ws-metric-note">
                  {result
                    ? stale
                      ? "Previous result · does not evaluate the current draft"
                      : `ID ${formatFixed(result.radius_mm * 2, 1)} mm · ${result.grooves} grooves · ${formatFixed(result.freq_mhz, 2)} MHz · Q ${result.q_factor != null ? formatFixed(result.q_factor, 0) : "—"} · C ${result.tuning_pf != null ? formatFixed(result.tuning_pf, 0) : "—"} pF`
                    : running
                      ? "Running RF coil optimizer"
                      : "No completed run yet"}
                </div>
              </div>
            ) : null}
          </div>
        </main>
        <aside className="ws-inspector" aria-label="RF coil setup">
          <ProjectPanel status={stale ? <span role="status">Draft · results outdated</span> : undefined} projectName={projectName} title="RF coil design" onClose={onClose} />
          <section className="ws-section">
            <h3>Former</h3>
            <NumericField
              label="Inner radius"
              unit="· mm"
              name="Inner radius (mm)"
              value={draft.radius_mm}
              min={10}
              max={150}
              step={1}
              onChange={(value) => patch({ radius_mm: value })}
            />
            <NumericField
              label="Length"
              unit="· mm"
              name="Length (mm)"
              value={draft.length_mm}
              min={40}
              max={400}
              step={1}
              onChange={(value) => patch({ length_mm: value })}
            />
            <NumericField
              label="Wall thickness"
              unit="· mm"
              name="Former thickness (mm)"
              value={draft.former_mm}
              min={1}
              max={20}
              step={0.5}
              onChange={(value) => patch({ former_mm: value })}
            />
            <div className="ws-muted ws-small">Inner radius is the sample bore. Windings sit outside the former wall.</div>
          </section>
          <section className="ws-section">
            <h3>Windings</h3>
            <NumericField
              label="Grooves"
              name="Grooves"
              value={draft.grooves}
              min={8}
              max={80}
              step={1}
              onChange={(value) => patch({ grooves: value })}
            />
            <NumericField
              label="Max turns / groove"
              name="Max turns per groove"
              value={draft.n_max}
              min={1}
              max={4}
              step={1}
              onChange={(value) => patch({ n_max: value })}
            />
            <label className="ws-row ws-small" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={draft.allow_bucking}
                onChange={(event) => patch({ allow_bucking: event.target.checked })}
              />
              Allow bucking turns
            </label>
          </section>
          <section className="ws-section">
            <h3>RF</h3>
            <NumericField
              label="Frequency"
              unit="· MHz"
              name="Frequency (MHz)"
              value={draft.freq_mhz}
              min={0.5}
              max={128}
              step={0.01}
              onChange={(value) => patch({ freq_mhz: value })}
            />
            <details className="ws-details">
              <summary>
                <ChevronRight className="ws-chevron" aria-hidden="true" />
                Solver details
              </summary>
              <div className="ws-muted ws-small" style={{ marginTop: 8 }}>
                Engine · VUIIS RF coil builder
                <br />
                Integer linear program for uniform on-axis B1 (HiGHS, or CBC if installed). AWG 20 wire. Not a birdcage solver.
              </div>
            </details>
          </section>
          {error ? (
            <p className="ws-alert" role="alert">
              {error}
            </p>
          ) : running ? (
            <p className="ws-alert" role="status">
              Building the winding.
            </p>
          ) : null}
          <div className="ws-runbar">
            <button type="button" className="ws-primary" onClick={() => void run()} disabled={running}>
              <Play aria-hidden="true" /> {running ? "Designing…" : "Run design"}
            </button>
            <button
              type="button"
              className="ws-quiet"
              onClick={() => void saveStl()}
              disabled={running || savingStl || stale || !(result?.layout?.wires?.length)}
            >
              <Download aria-hidden="true" /> {savingStl ? "Saving…" : "Save STL"}
            </button>
            {stale && <div className="ws-stale" role="status">Setup changed · run to evaluate</div>}
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
