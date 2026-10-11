import { ArrowRight, ChevronDown, ChevronRight, Play, RotateCcw } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { simulateCoil, type CoilRequest, type CoilSimulation } from "../mri/api";
import {
  formatFixed,
  Metric,
  NumericField,
  ProjectMenu,
  SegmentedControl,
  WorkspaceShell,
} from "./workspace";

const CoilLayoutView = lazy(() => import("./CoilLayout").then((module) => ({ default: module.CoilLayoutView })));

const SHAPES = [
  { id: "cylinder", name: "Cylinder" },
  { id: "planar", name: "Planar" },
  { id: "biplanar", name: "Biplanar" },
  { id: "circular", name: "Circular" },
] as const;

const AXES = [
  { id: "x", name: "X gradient", label: "X" },
  { id: "y", name: "Y gradient", label: "Y" },
  { id: "z", name: "Z gradient", label: "Z" },
] as const;

type ShapeId = (typeof SHAPES)[number]["id"];
type AxisId = (typeof AXES)[number]["id"];
type CoilView = "3d" | "layout" | "quality";

type Draft = {
  radius_mm: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  gap_mm: number;
  levels: number;
  gradient_mt_m: number;
};

const DEFAULT_DRAFT: Draft = {
  radius_mm: 140,
  length_mm: 280,
  width_mm: 250,
  height_mm: 250,
  gap_mm: 200,
  levels: 10,
  gradient_mt_m: 10,
};

function requestKey(shape: ShapeId, axis: AxisId, draft: Draft) {
  return JSON.stringify({ shape, axis, ...draft });
}

function dimensionNote(shape: ShapeId) {
  return shape === "biplanar"
    ? "Two plates. Gap is the distance between them."
    : "Dimensions describe the winding support.";
}

function errorPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function errorDefinition(result: CoilSimulation) {
  if (result.error_definition) return result.error_definition;
  if (result.mean_field_error != null) return "Mean relative error, layout versus target";
  return null;
}

function targetRegionRadiusMm(result: CoilSimulation) {
  const value =
    result.target_region_radius_mm ??
    (result.shape === "cylinder"
      ? Math.min(result.radius_mm * 0.45, result.length_mm * 0.22)
      : result.shape === "circular"
        ? result.radius_mm * 0.35
        : result.shape === "biplanar"
          ? Math.min(Math.min(result.width_mm, result.height_mm) * 0.28, result.gap_mm * 0.35)
          : result.shape === "planar"
            ? Math.min(result.width_mm, result.height_mm) * 0.28
            : null);
  return value != null && Number.isFinite(value) ? value : null;
}

function diagnosticCopy(result: CoilSimulation) {
  const definition = errorDefinition(result);
  const region = targetRegionRadiusMm(result);
  if (!definition) return "Error definition unavailable for this run.";
  if (region == null || !Number.isFinite(region)) {
    return `${definition}. Evaluation region unavailable for this run.`;
  }
  return `${definition}. Evaluation region · radius ${formatFixed(region, 1)} mm.`;
}

export function GradientCoilStudio({
  projectName,
  onAssembly,
  onClose,
}: {
  projectName: string;
  onAssembly?: () => void;
  onClose?: () => void;
}) {
  const [shape, setShape] = useState<ShapeId>("cylinder");
  const [axis, setAxis] = useState<AxisId>("y");
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [result, setResult] = useState<CoilSimulation | null>(null);
  const [resultKey, setResultKey] = useState("");
  const [view, setView] = useState<CoilView>("3d");
  const [showFormer, setShowFormer] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const request: CoilRequest = {
    shape,
    axis,
    radius_mm: draft.radius_mm,
    length_mm: draft.length_mm,
    width_mm: draft.width_mm,
    height_mm: draft.height_mm,
    gap_mm: draft.gap_mm,
    levels: draft.levels,
    gradient_mt_m: draft.gradient_mt_m,
  };
  const currentKey = requestKey(shape, axis, draft);
  const stale = Boolean(result && resultKey && resultKey !== currentKey);
  const coil = AXES.find((item) => item.id === axis) ?? AXES[1];
  const former = SHAPES.find((item) => item.id === shape) ?? SHAPES[0];
  const reportedError = result ? errorPercent(result.mean_field_error) : null;

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function run() {
    setRunning(true);
    setError("");
    try {
      const next = await simulateCoil(request);
      setResult(next);
      setResultKey(currentKey);
    } catch (err) {
      setResult(null);
      setResultKey("");
      setError(err instanceof Error ? err.message : "Gradient coil simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  const status = running
    ? "Running"
    : error
      ? "Failed"
      : result
        ? stale
          ? "Draft · results outdated"
          : reportedError != null
            ? "Result · review required"
            : "Result"
        : "Setup";

  return (
    <WorkspaceShell
      kind="gradient"
      label="Gradient coils"
      projectName={projectName}
      title="Gradient coil design"
      status={<span className="ws-pill">{status}</span>}
      actions={<ProjectMenu onAssembly={onAssembly} onClose={onClose} />}
    >
      <div className="ws-body">
        <main className="ws-viewer">
          <div className="ws-stage">
            {view === "quality" ? (
              <section className="ws-quality">
                <h2>Understand the result.</h2>
                {result ? (
                  <>
                    <p>Values reported by the connected solver for this completed run.</p>
                    <div className="ws-qrow">
                      <span>Mean error</span>
                      <strong className={reportedError != null && reportedError > 0 ? "ws-warning" : undefined}>
                        {reportedError != null ? `${reportedError}%` : "Not reported"}
                      </strong>
                    </div>
                    <div className="ws-qrow">
                      <span>Error definition</span>
                      <span className="ws-muted">{errorDefinition(result) ?? "Error definition unavailable for this run."}</span>
                    </div>
                    <div className="ws-qrow">
                      <span>Evaluation region</span>
                      <span className="ws-muted">
                        {targetRegionRadiusMm(result) != null
                          ? `Spherical target · radius ${formatFixed(targetRegionRadiusMm(result), 1)} mm`
                          : "Evaluation region unavailable for this run."}
                      </span>
                    </div>
                    <div className="ws-qrow">
                      <span>Acceptance threshold</span>
                      <span className="ws-muted">Not specified</span>
                    </div>
                    {result.achieved_mt_m != null ? (
                      <p>
                        Achieved efficiency {result.achieved_mt_m} mT/m/A against a target of {result.gradient_mt_m} mT/m.
                      </p>
                    ) : (
                      <p>A target-versus-achieved field comparison is unavailable for this run.</p>
                    )}
                  </>
                ) : (
                  <p>Run a design to compare the target and achieved field over the solver’s evaluation region.</p>
                )}
              </section>
            ) : view === "layout" ? (
              result ? (
                <figure className="ws-surface">
                  <img src={`data:image/png;base64,${result.surface_png}`} alt={`${result.title} surface`} />
                </figure>
              ) : (
                <p className="ws-empty">{running ? "Simulating the winding…" : "Surface layout appears after a completed run."}</p>
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
              <p className="ws-empty">{running ? "Simulating the winding…" : "Run a design to generate windings."}</p>
            )}
          </div>
          <nav className="ws-viewbar" aria-label="Inspect design">
            <SegmentedControl
              label="Inspect design"
              className="ws-seg-ghost"
              value={view}
              options={[
                { id: "3d", label: "3D windings" },
                { id: "layout", label: "Surface layout" },
                { id: "quality", label: "Field quality" },
              ]}
              onChange={setView}
            />
            {view === "3d" ? (
              <div className="ws-scene-tools">
                <span className="ws-small ws-muted">
                  {former.name} · {coil.label} gradient
                </span>
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
                <span>{result ? "Drag to rotate · winding paths" : "Former and windings appear after a completed run"}</span>
                <span>
                  Windings <span style={{ color: "#baa6f7" }}>━</span> · former in translucent grey
                </span>
              </div>
            ) : null}
            {view === "layout" && result ? (
              <div className="ws-caption">
                <span>
                  {result.shape === "cylinder"
                    ? "Unwrapped support · solver surface parameterization"
                    : "Face-on support · solver surface parameterization"}
                </span>
                <span>Not a fabrication-ready wire path</span>
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
                    {result ? result.loop_count : "—"} loops
                    <span className="ws-overlay-sep" aria-hidden="true">
                      ·
                    </span>
                    {result?.achieved_mt_m != null ? `${result.achieved_mt_m} mT/m/A` : "—"}
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
                      <strong>Review the reported {reportedError}% mean error</strong>
                      <p>{diagnosticCopy(result)}</p>
                    </div>
                    <button type="button" onClick={() => setView("quality")}>
                      Inspect quality <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                <div className="ws-metrics">
                  <Metric label="Generated loops" value={result ? result.loop_count : "—"} />
                  <div className="ws-metric">
                    <div className="ws-metric-label">Efficiency</div>
                    <div className="ws-metric-value">{result?.achieved_mt_m != null ? result.achieved_mt_m : "—"}</div>
                    <div className="ws-metric-label">mT/m/A</div>
                  </div>
                  <Metric
                    label="Reported mean error"
                    value={reportedError != null ? reportedError : "—"}
                    unit={reportedError != null ? "%" : undefined}
                    warning={reportedError != null}
                  />
                </div>
                <div className="ws-metric-note">
                  {result
                    ? stale
                      ? "Previous result · does not evaluate the current draft"
                      : `${result.shape}, ${result.axis.toUpperCase()}, target ${result.gradient_mt_m} mT/m, ${result.levels} levels`
                    : running
                      ? "Running pyCoilGen"
                      : "No completed run yet"}
                </div>
              </div>
            ) : null}
          </div>
        </main>
        <aside className="ws-inspector" aria-label="Gradient coil setup">
          <section className="ws-section">
            <h3>Former</h3>
            <div className="ws-former-grid">
              {SHAPES.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === shape} onClick={() => setShape(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          </section>
          <section className="ws-section">
            <h3>Gradient direction</h3>
            <SegmentedControl
              label="Gradient direction"
              className="ws-axis"
              value={axis}
              options={AXES.map((item) => ({ id: item.id, label: item.label, name: item.name }))}
              onChange={setAxis}
            />
            <div className="ws-muted ws-small" style={{ marginTop: 8 }}>
              Target variation along {coil.label}
            </div>
            <NumericField
              label="Target"
              unit="· mT/m"
              name="Gradient (mT/m)"
              value={draft.gradient_mt_m}
              min={1}
              max={40}
              step={1}
              onChange={(value) => patch({ gradient_mt_m: value })}
            />
          </section>
          <section className="ws-section">
            <h3>Dimensions</h3>
            {shape === "cylinder" || shape === "circular" ? (
              <NumericField
                label="Radius"
                unit="· mm"
                name="Radius (mm)"
                value={draft.radius_mm}
                min={80}
                max={300}
                step={1}
                onChange={(value) => patch({ radius_mm: value })}
              />
            ) : (
              <NumericField
                label="Width"
                unit="· mm"
                name="Width (mm)"
                value={draft.width_mm}
                min={80}
                max={500}
                step={1}
                onChange={(value) => patch({ width_mm: value })}
              />
            )}
            {shape === "cylinder" ? (
              <NumericField
                label="Length"
                unit="· mm"
                name="Length (mm)"
                value={draft.length_mm}
                min={120}
                max={600}
                step={1}
                onChange={(value) => patch({ length_mm: value })}
              />
            ) : shape !== "circular" ? (
              <NumericField
                label="Height"
                unit="· mm"
                name="Height (mm)"
                value={draft.height_mm}
                min={80}
                max={500}
                step={1}
                onChange={(value) => patch({ height_mm: value })}
              />
            ) : null}
            {shape === "biplanar" ? (
              <NumericField
                label="Plate gap"
                unit="· mm"
                name="Gap (mm)"
                value={draft.gap_mm}
                min={40}
                max={400}
                step={1}
                onChange={(value) => patch({ gap_mm: value })}
              />
            ) : null}
            <div className="ws-muted ws-small">{dimensionNote(shape)}</div>
          </section>
          <section className="ws-section">
            <NumericField
              label="Contour levels"
              name="Levels"
              value={draft.levels}
              min={4}
              max={20}
              step={1}
              onChange={(value) => patch({ levels: value })}
            />
            <details className="ws-details">
              <summary>
                <ChevronRight className="ws-chevron" aria-hidden="true" />
                Solver details
              </summary>
              <div className="ws-muted ws-small" style={{ marginTop: 8 }}>
                Engine · pyCoilGen
                <br />
                Contour levels and generated loop count are shown separately.
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
            <div className="ws-stale" role="status">
              {stale ? "Setup changed · run to evaluate" : result ? "Showing the completed run" : "No completed run yet"}
            </div>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
