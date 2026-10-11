import { ChevronDown, ChevronRight, FileCheck2, Focus, Play } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { pickExportDirectory } from "../../desktop/pickExportDirectory";
import { pickFieldMapFile } from "../../desktop/pickFieldMapFile";
import { isTauri } from "../../desktop/runtime";
import { saveBlob } from "../../desktop/saveFile";
import {
  exportShimTrays,
  inspectShimFieldMap,
  simulateShim,
  type ShimFieldMapUpload,
  type ShimFieldSummary,
  type ShimRequest,
  type ShimSimulation,
} from "../mri/api";
import type { ShimFieldView, ShimFraming, ShimSceneMode, ShimTrayFocus } from "./ShimTray";
import { shimFieldScale } from "./ShimTray";
import {
  formatCount,
  formatFixed,
  Metric,
  NumericField,
  ProjectMenu,
  SegmentedControl,
  WorkspaceShell,
} from "./workspace";

const ShimTrayView = lazy(() => import("./ShimTray").then((module) => ({ default: module.ShimTrayView })));

type Draft = {
  diameter_mm: number;
  bottom_mm: number;
  top_mm: number;
  magnet_mm: number;
  thickness_mm: number;
  polarization_t: number;
  radial_spacing: number;
  azimuthal_spacing: number;
};

const DEFAULT_DRAFT: Draft = {
  diameter_mm: 203.3,
  bottom_mm: -48.5,
  top_mm: 48.5,
  magnet_mm: 6.35,
  thickness_mm: 3.18,
  polarization_t: 1.2,
  radial_spacing: 1,
  azimuthal_spacing: 1.25,
};

function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("The field map could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

async function readUpload(file: File): Promise<ShimFieldMapUpload> {
  const bytes = new Uint8Array(await readBytes(file));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { name: file.name, data_b64: btoa(binary) };
}

function formatMm(range: number[]): string {
  return `${range[0].toFixed(1)} to ${range[1].toFixed(1)}`;
}

function folderName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function decodeFile(data_b64: string): Uint8Array {
  const binary = atob(data_b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function exportRequest(result: ShimSimulation, centerMap: boolean): ShimRequest & { states: number[] } {
  return {
    diameter_mm: result.diameter_mm,
    bottom_mm: result.bottom_mm,
    top_mm: result.top_mm,
    magnet_mm: result.magnet_mm,
    thickness_mm: result.thickness_mm,
    polarization_t: result.polarization_t,
    radial_spacing: result.radial_spacing,
    azimuthal_spacing: result.azimuthal_spacing,
    center_map: centerMap,
    states: result.states,
  };
}

function setupKey(draft: Draft, centerMap: boolean, uploadName: string | null) {
  return JSON.stringify({ ...draft, center_map: centerMap, field_map: uploadName });
}

function extentSpan(field: ShimFieldSummary) {
  const x = field.extent_mm.x[1] - field.extent_mm.x[0];
  const y = field.extent_mm.y[1] - field.extent_mm.y[0];
  const z = field.extent_mm.z[1] - field.extent_mm.z[0];
  return `${x.toFixed(0)} × ${y.toFixed(0)} × ${z.toFixed(0)} mm`;
}

export function PassiveShimStudio({
  projectName,
  onAssembly,
  onClose,
}: {
  projectName: string;
  onAssembly?: () => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [symmetric, setSymmetric] = useState(true);
  const [centerMap, setCenterMap] = useState(true);
  const [upload, setUpload] = useState<ShimFieldMapUpload | null>(null);
  const [fieldMap, setFieldMap] = useState<ShimFieldSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShimSimulation | null>(null);
  const [resultKey, setResultKey] = useState("");
  const [panel, setPanel] = useState<"setup" | "results">("setup");
  const [view, setView] = useState<ShimFieldView>("before");
  const [mode, setMode] = useState<ShimSceneMode>("3d");
  const [showTrays, setShowTrays] = useState(true);
  const [framing, setFraming] = useState<ShimFraming>("field");
  const [fitNonce, setFitNonce] = useState(0);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [trayFocus, setTrayFocus] = useState<ShimTrayFocus>("both");
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");

  const request: ShimRequest = { ...draft, center_map: centerMap, ...(upload ? { field_map: upload } : {}) };
  const currentKey = setupKey(draft, centerMap, upload?.name ?? null);
  const stale = Boolean(result && resultKey && resultKey !== currentKey);
  const separation = draft.top_mm - draft.bottom_mm;
  const shownField = result ? result.field : fieldMap;
  const trays = result && !stale
    ? { diameter_mm: result.diameter_mm, bottom_mm: result.bottom_mm, top_mm: result.top_mm }
    : { diameter_mm: draft.diameter_mm, bottom_mm: draft.bottom_mm, top_mm: draft.top_mm };
  const scale = useMemo(() => shimFieldScale(shownField, view), [shownField, view]);
  const metricsField = result ?? fieldMap;
  const placed = result ? result.n_positive + result.n_negative : 0;
  const improvement = result && result.pre_std_ppm > 0 ? ((result.pre_std_ppm - result.post_std_ppm) / result.pre_std_ppm) * 100 : 0;

  useEffect(() => {
    if (!savedTo) return;
    const hide = window.setTimeout(() => setSavedTo(""), 3200);
    return () => window.clearTimeout(hide);
  }, [savedTo]);

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
    setTrayFocus("both");
  }

  function setSeparation(next: number) {
    if (symmetric) {
      patch({ bottom_mm: -next / 2, top_mm: next / 2 });
      return;
    }
    patch({ top_mm: draft.bottom_mm + next });
  }

  function setSymmetricAboutCenter(next: boolean) {
    setSymmetric(next);
    if (next) {
      const gap = draft.top_mm - draft.bottom_mm;
      patch({ bottom_mm: -gap / 2, top_mm: gap / 2 });
    }
  }

  async function inspect(next: ShimFieldMapUpload, center: boolean) {
    setLoading(true);
    setError("");
    try {
      const inspection = await inspectShimFieldMap(next, center);
      setUpload(next);
      setFieldMap(inspection.field);
      setResult(null);
      setResultKey("");
      setPanel("setup");
      setView("before");
      setTrayFocus("both");
      setFraming("field");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The field map could not be read.");
    } finally {
      setLoading(false);
    }
  }

  async function chooseFile() {
    setError("");
    try {
      const file = await pickFieldMapFile();
      if (!file) return;
      await inspect(await readUpload(file), centerMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The field map could not be read.");
    }
  }

  function clearFieldMap() {
    setUpload(null);
    setFieldMap(null);
    setResult(null);
    setResultKey("");
    setSavedTo("");
    setPanel("setup");
    setView("before");
    setTrayFocus("both");
    setError("");
  }

  async function onCenterChange(next: boolean) {
    setCenterMap(next);
    if (upload) await inspect(upload, next);
  }

  async function run() {
    if (draft.top_mm <= draft.bottom_mm) {
      setError("Set a valid tray separation before running.");
      return;
    }
    setRunning(true);
    setError("");
    try {
      const next = await simulateShim(request);
      setResult(next);
      setResultKey(setupKey(draft, centerMap, upload?.name ?? null));
      setSavedTo("");
      setView("after");
      setPanel("results");
      setTrayFocus("both");
    } catch (err) {
      setResult(null);
      setResultKey("");
      setError(err instanceof Error ? err.message : "Passive shimming failed.");
    } finally {
      setRunning(false);
    }
  }

  async function saveTrays() {
    if (!result) return;
    setError("");
    setSavedTo("");
    try {
      const folder = await pickExportDirectory();
      if (isTauri() && !folder) return;
      setExporting(true);
      const payload = await exportShimTrays({
        ...exportRequest(result, centerMap),
        ...(folder ? { destination: folder } : {}),
      });
      if (payload.folder) {
        setSavedTo(payload.folder);
        return;
      }
      for (const file of payload.files) {
        if (!file.data_b64) continue;
        await saveBlob(file.name, new Blob([decodeFile(file.data_b64)]));
      }
      setSavedTo(payload.files.map((file) => file.name).join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The trays could not be saved.");
    } finally {
      setExporting(false);
    }
  }

  const status = running ? "Running" : result ? (stale ? "Draft · results outdated" : panel === "results" ? "Run 01" : "Setup") : "Setup";
  const badge = result && panel === "results" ? "Review" : fieldMap ? "Measured field" : "Synthetic field";

  return (
    <WorkspaceShell
      kind="shim"
      label="Passive shimming"
      projectName={projectName}
      title="Passive shimming"
      status={<span className="ws-muted ws-small">{status}</span>}
      actions={<ProjectMenu onAssembly={onAssembly} onClose={onClose} />}
    >
      {savedTo ? (
        <p className="ws-toast shim-toast" role="status" aria-label={`Saved to ${folderName(savedTo)}`} title={savedTo}>
          Saved to {folderName(savedTo)}
        </p>
      ) : null}
      <div className="ws-body">
        <main className="ws-viewer" aria-label="Field inspection">
          <div className="ws-stage">
            <div className="ws-scene">
              {result || fieldMap ? (
                <Suspense fallback={<p className="ws-empty">Drawing the trays…</p>}>
                  <ShimTrayView
                    trays={trays}
                    field={shownField}
                    view={view}
                    magnets={result ? result.magnets : []}
                    magnetSizeMm={result?.magnet_size_mm}
                    showTrays={showTrays}
                    mode={mode}
                    trayFocus={trayFocus}
                    framing={framing}
                    fitNonce={fitNonce}
                  />
                </Suspense>
              ) : (
                <p className="ws-empty">
                  {running ? "Shimming the bore field…" : "Load a field map to inspect it, or run with the synthetic field."}
                </p>
              )}
            </div>
          </div>
          <nav className="ws-viewbar">
            <SegmentedControl
              label="Field view"
              value={mode}
              options={[
                { id: "3d", label: "3D" },
                { id: "slice", label: "Slice" },
              ]}
              onChange={(next) => {
                setMode(next);
                setTrayFocus("both");
              }}
            />
            {result?.field.after_mt ? (
              <SegmentedControl
                label="Compare field"
                value={view}
                options={[
                  { id: "before", label: "Before" },
                  { id: "after", label: "After" },
                ]}
                onChange={setView}
              />
            ) : null}
            <div className="ws-scene-tools">
              <label className="ws-row ws-small">
                <input type="checkbox" checked={showTrays} onChange={(event) => setShowTrays(event.target.checked)} />
                Trays
              </label>
              <button
                type="button"
                className="ws-quiet"
                onClick={() => {
                  setFraming("field");
                  setTrayFocus("both");
                  setFitNonce((value) => value + 1);
                }}
              >
                <Focus aria-hidden="true" /> Fit field
              </button>
            </div>
          </nav>
          <div className={`ws-overlay-bottom${resultsOpen ? "" : " is-collapsed"}`}>
            {shownField && scale ? (
              <div className="ws-legend">
                <span>ΔB from {formatFixed(scale.mean, 3)} mT</span>
                <span>−{formatFixed(scale.half, 2)}</span>
                <span className="ws-scale" />
                <span>+{formatFixed(scale.half, 2)} mT</span>
              </div>
            ) : null}
            <div className="ws-scenefoot">
              <span>
                {mode === "slice"
                  ? "Axial slice · same fixed color scale"
                  : shownField
                    ? `All ${shownField.samples.toLocaleString()} samples · ${framing === "field" ? "field-centered view" : "assembly view"}`
                    : "No field samples yet"}
              </span>
              <span>
                Ø {trays.diameter_mm} mm · {formatFixed(trays.top_mm - trays.bottom_mm, 1)} mm separation
              </span>
            </div>
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
                    {metricsField
                      ? `${formatCount(result && view === "after" ? result.post_std_ppm : ("std_ppm" in metricsField ? metricsField.std_ppm : metricsField.pre_std_ppm))} ppm`
                      : "—"}
                    <span className="ws-overlay-sep" aria-hidden="true">
                      ·
                    </span>
                    {metricsField
                      ? `${formatFixed(result && view === "after" ? result.post_p2p_mt : ("p2p_mt" in metricsField ? metricsField.p2p_mt : metricsField.pre_p2p_mt), 3)} mT`
                      : "—"}
                  </span>
                </span>
              )}
              <ChevronDown aria-hidden="true" />
            </button>
            {resultsOpen ? (
              <div id="ws-run-results">
                <div className="ws-metrics" aria-live="polite">
                  <Metric
                    label="Field variation · standard deviation"
                    value={metricsField ? formatCount(result && view === "after" ? result.post_std_ppm : ("std_ppm" in metricsField ? metricsField.std_ppm : metricsField.pre_std_ppm)) : "—"}
                    unit="ppm"
                    previous={result && view === "after" ? formatCount(result.pre_std_ppm) : undefined}
                  />
                  <Metric
                    label="Peak to peak"
                    value={metricsField ? formatFixed(result && view === "after" ? result.post_p2p_mt : ("p2p_mt" in metricsField ? metricsField.p2p_mt : metricsField.pre_p2p_mt), 3) : "—"}
                    unit="mT"
                    previous={result && view === "after" ? formatFixed(result.pre_p2p_mt, 3) : undefined}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </main>
        <aside className="ws-inspector" aria-label="Shimming setup and results">
          <div className="ws-panel-head">
            <span>{panel === "results" ? "Results" : "Setup"}</span>
            <span className="ws-pill">{badge}</span>
          </div>
          {panel === "setup" ? (
            <div className="ws-sections">
              <section className="ws-section">
                <h3>Field map</h3>
                {fieldMap ? (
                  <div className="ws-file">
                    <FileCheck2 aria-hidden="true" />
                    <div>
                      <div>{fieldMap.source}</div>
                      <div className="ws-muted ws-small">
                        {fieldMap.samples.toLocaleString()} samples · {extentSpan(fieldMap)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="ws-muted">No field map loaded. The run uses the synthetic bore field.</p>
                    <button type="button" onClick={() => void chooseFile()} disabled={loading} style={{ marginTop: 12 }}>
                      {loading ? "Reading…" : "Load field map"}
                    </button>
                  </>
                )}
                <details className="ws-details">
                  <summary>
                    <ChevronRight className="ws-chevron" aria-hidden="true" />
                    Details & alignment
                  </summary>
                  <div className="ws-detail">
                    {fieldMap ? (
                      <div className="ws-details-grid" aria-label="Field map summary">
                        <span>Samples</span>
                        <span>{fieldMap.samples.toLocaleString()}</span>
                        <span>Mean field</span>
                        <span>{formatFixed(fieldMap.mean_mt, 3)} mT</span>
                        <span>X / Y / Z bounds</span>
                        <span>
                          {formatMm(fieldMap.extent_mm.x)} / {formatMm(fieldMap.extent_mm.y)} / {formatMm(fieldMap.extent_mm.z)} mm
                        </span>
                        <span>Coordinates</span>
                        <span>mm</span>
                        <span>Field values</span>
                        <span>mT</span>
                        <span>Peak to peak</span>
                        <span>
                          {formatFixed(fieldMap.p2p_mt, 3)} mT · {fieldMap.p2p_khz.toFixed(1)} kHz
                        </span>
                        <span>Std</span>
                        <span>{formatCount(fieldMap.std_ppm)} ppm</span>
                      </div>
                    ) : (
                      <p className="ws-muted ws-small">A .npy of x, y, z in mm and B in mT.</p>
                    )}
                    <label className="ws-row ws-small" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={centerMap}
                        onChange={(event) => void onCenterChange(event.target.checked)}
                        aria-label="Center the map between the trays"
                      />
                      Center between trays
                    </label>
                    {fieldMap ? (
                      <div className="ws-row" style={{ marginTop: 12 }}>
                        <button type="button" onClick={() => void chooseFile()} disabled={loading}>
                          {loading ? "Reading…" : "Replace field map"}
                        </button>
                        <button type="button" className="ws-quiet" onClick={clearFieldMap}>
                          Remove field map
                        </button>
                      </div>
                    ) : null}
                  </div>
                </details>
              </section>
              <section className="ws-section">
                <h3>Tray geometry</h3>
                <NumericField
                  label="Diameter"
                  unit="mm"
                  name="Diameter (mm)"
                  value={draft.diameter_mm}
                  min={100}
                  max={300}
                  step={0.1}
                  onChange={(value) => patch({ diameter_mm: value })}
                />
                <NumericField
                  label="Separation"
                  unit="mm"
                  name="Separation (mm)"
                  value={Number(separation.toFixed(1))}
                  min={20}
                  max={240}
                  step={0.1}
                  onChange={setSeparation}
                />
                <label className="ws-row ws-small">
                  <input type="checkbox" checked={symmetric} onChange={(event) => setSymmetricAboutCenter(event.target.checked)} />
                  Symmetric about field center
                </label>
              </section>
              <section className="ws-section">
                <h3>Shim magnets</h3>
                <div>
                  Ø {draft.magnet_mm} × {draft.thickness_mm} mm
                </div>
                <div className="ws-muted ws-small">Polarization {draft.polarization_t} T</div>
                <details className="ws-details">
                  <summary>
                    <ChevronRight className="ws-chevron" aria-hidden="true" />
                    Magnet & search settings
                  </summary>
                  <div className="ws-detail">
                    <NumericField
                      label="Diameter"
                      unit="· mm"
                      name="Magnet (mm)"
                      value={draft.magnet_mm}
                      min={3}
                      max={15}
                      step={0.01}
                      onChange={(value) => patch({ magnet_mm: value })}
                    />
                    <NumericField
                      label="Thickness"
                      unit="· mm"
                      name="Thickness (mm)"
                      value={draft.thickness_mm}
                      min={1}
                      max={8}
                      step={0.01}
                      onChange={(value) => patch({ thickness_mm: value })}
                    />
                    <NumericField
                      label="Polarization"
                      unit="· T"
                      name="Polarization (T)"
                      value={draft.polarization_t}
                      min={0.4}
                      max={1.6}
                      step={0.1}
                      onChange={(value) => patch({ polarization_t: value })}
                    />
                    <NumericField
                      label="Radial spacing"
                      unit="*"
                      name="Radial spacing"
                      value={draft.radial_spacing}
                      min={0.8}
                      max={2}
                      step={0.05}
                      onChange={(value) => patch({ radial_spacing: value })}
                    />
                    <NumericField
                      label="Azimuthal spacing"
                      unit="*"
                      name="Azimuthal spacing"
                      value={draft.azimuthal_spacing}
                      min={0.8}
                      max={2.5}
                      step={0.05}
                      onChange={(value) => patch({ azimuthal_spacing: value })}
                    />
                    <div className="ws-muted ws-small">*Existing spacing values from the solver adapter.</div>
                    <div className="ws-muted ws-small" style={{ marginTop: 10 }}>
                      Search · Iterated greedy
                    </div>
                  </div>
                </details>
                <details className="ws-details" open={!symmetric}>
                  <summary>
                    <ChevronRight className="ws-chevron" aria-hidden="true" />
                    Tray positions
                  </summary>
                  <div className="ws-detail">
                    <NumericField
                      label="Bottom z"
                      unit="· mm"
                      name="Bottom (mm)"
                      value={draft.bottom_mm}
                      min={-120}
                      max={-10}
                      step={0.1}
                      onChange={(value) => {
                        setSymmetric(false);
                        patch({ bottom_mm: value });
                      }}
                    />
                    <NumericField
                      label="Top z"
                      unit="· mm"
                      name="Top (mm)"
                      value={draft.top_mm}
                      min={10}
                      max={120}
                      step={0.1}
                      onChange={(value) => {
                        setSymmetric(false);
                        patch({ top_mm: value });
                      }}
                    />
                  </div>
                </details>
              </section>
            </div>
          ) : result ? (
            <div className="ws-sections">
              <section className="ws-section">
                <h3>Run 01</h3>
                <div className="ws-result-note">
                  {stale ? "Setup changed · this result belongs to the previous inputs." : "Completed run · same sample region."}
                </div>
                <div className="ws-result-big">
                  {formatFixed(Math.abs(improvement), 1)}% <span>{improvement >= 0 ? "less variation" : "more variation"}</span>
                </div>
                <div className="ws-muted ws-small">Standard deviation · same sample region</div>
              </section>
              <section className="ws-section">
                <h3>Field comparison</h3>
                <div className="ws-details-grid">
                  <span />
                  <span>Before → After</span>
                  <span>Std · ppm</span>
                  <span>
                    {formatCount(result.pre_std_ppm)} → {formatCount(result.post_std_ppm)}
                  </span>
                  <span>Peak to peak · mT</span>
                  <span>
                    {formatFixed(result.pre_p2p_mt, 3)} → {formatFixed(result.post_p2p_mt, 3)}
                  </span>
                </div>
                <p className="coil-meta" style={{ marginTop: 12 }}>
                  {placed} {placed === 1 ? "magnet" : "magnets"} · {result.n_positive} positive · {result.n_negative} negative ·{" "}
                  {formatCount(result.post_std_ppm)} ppm after, was {formatCount(result.pre_std_ppm)}
                </p>
              </section>
              <section className="ws-section">
                <h3>Review placement</h3>
                <div className="ws-muted">Inspect magnets on each tray before exporting.</div>
                <div className="ws-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    aria-pressed={trayFocus === "top"}
                    onClick={() => {
                      setMode("3d");
                      setTrayFocus("top");
                    }}
                  >
                    Top tray
                  </button>
                  <button
                    type="button"
                    aria-pressed={trayFocus === "bottom"}
                    onClick={() => {
                      setMode("3d");
                      setTrayFocus("bottom");
                    }}
                  >
                    Bottom tray
                  </button>
                </div>
              </section>
            </div>
          ) : null}
          {error ? (
            <p className="ws-alert" role="alert">
              {error}
            </p>
          ) : running ? (
            <p className="ws-alert" role="status">
              Placing shim magnets on the trays.
            </p>
          ) : loading ? (
            <p className="ws-alert" role="status">
              Reading the field map.
            </p>
          ) : null}
          <div className="ws-runbar">
            {panel === "results" && result ? (
              <>
                <button type="button" className="ws-primary" onClick={() => void saveTrays()} disabled={exporting || running}>
                  {exporting ? "Saving…" : "Export trays & report"}
                </button>
                <p className="ws-run-note">Includes geometry, placements and run settings</p>
                <button type="button" style={{ width: "100%", marginTop: 6 }} onClick={() => setPanel("setup")}>
                  Edit setup
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ws-primary" onClick={() => void run()} disabled={running || loading || exporting}>
                  <Play aria-hidden="true" />
                  <span>{running ? "Shimming…" : "Run shimming"}</span>
                </button>
                <p className="ws-run-note">
                  {stale
                    ? "Setup changed · this result belongs to the previous inputs."
                    : fieldMap
                      ? "Uses the current field map and tray setup"
                      : "Uses the synthetic bore field and tray setup"}
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
