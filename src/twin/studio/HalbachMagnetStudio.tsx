import { saveBlob } from "../../desktop/saveFile";
import { useProjectState, useProjectRun, useProjectBusy } from "./ProjectPersistence";
import { ChevronDown, Download, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { designHalbach, exportHalbachCad, type HalbachDesign, type HalbachRequest } from "../mri/api";
import { HalbachGeometryDialog } from "./HalbachGeometryDialog";
import { halbachStl, halbachStlName } from "./halbachCad";
import { cloneGeometry, uniformGeometry, type HalbachGeometry } from "./mri1Geometry";
import {
  formatFixed,
  Metric,
  NumericField,
  ProjectPanel,
  SegmentedControl,
  WorkspaceShell,
} from "./workspace";

const HalbachLayoutView = lazy(() => import("./HalbachLayout").then((module) => ({ default: module.HalbachLayoutView })));

type Draft = {
  inner_radius_mm: number;
  magnet_mm: number;
  br_t: number;
  mur: number;
  magnets: number;
  rings: number;
  ring_sep_mm: number;
  outer_ring: boolean;
  outer_offset_mm: number;
  outer_extra: number;
  geometry: HalbachGeometry | null;
};

const DEFAULT_DRAFT: Draft = {
  inner_radius_mm: 80,
  magnet_mm: 12,
  br_t: 1.3,
  mur: 1,
  magnets: 16,
  rings: 5,
  ring_sep_mm: 22,
  outer_ring: true,
  outer_offset_mm: 21,
  outer_extra: 7,
  geometry: null,
};

function requestFrom(draft: Draft): HalbachRequest {
  return {
    inner_radius_mm: draft.inner_radius_mm,
    magnet_mm: draft.magnet_mm,
    br_t: draft.br_t,
    mur: draft.mur,
    magnets: draft.magnets,
    rings: draft.rings,
    ring_sep_mm: draft.ring_sep_mm,
    outer_ring: draft.outer_ring,
    outer_offset_mm: draft.outer_offset_mm,
    outer_extra: draft.outer_extra,
    geometry: draft.geometry,
  };
}

function requestKey(draft: Draft) {
  return JSON.stringify(requestFrom(draft));
}

function decodeB64(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function HalbachMagnetStudio({
  projectName,
  onAssembly,
  onClose,
}: {
  projectName: string;
  onAssembly?: () => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useProjectState<Draft>("magnet.draft", DEFAULT_DRAFT);
  const [result, setResult] = useProjectState<HalbachDesign | null>("magnet.result", null);
  const [resultKey, setResultKey] = useProjectState("magnet.resultKey", "");
  const [view, setView] = useProjectState<"magnets" | "assembly">("magnet.view", "magnets");
  const [showBore, setShowBore] = useProjectState("magnet.showBore", true);
  const [sliceIndex, setSliceIndex] = useProjectState("magnet.sliceIndex", 0);
  const [resetNonce, setResetNonce] = useState(0);
  const [resultsOpen, setResultsOpen] = useProjectState("magnet.resultsOpen", true);
  const [geometryOpen, setGeometryOpen] = useState(false);
  const [locallyRunning, setRunning] = useState(false);
  const [saving, setSaving] = useState("");
  const [comingSoon, setComingSoon] = useState("");
  const running = useProjectBusy() || locallyRunning;
  const [error, setError] = useProjectState("magnet.error", "");

  const request = requestFrom(draft);
  const currentKey = requestKey(draft);
  const stale = Boolean(result && resultKey && resultKey !== currentKey);
  const plates = result?.plates ?? [];
  const selectedSlice = Math.min(Math.max(sliceIndex, 0), Math.max(plates.length - 1, 0));
  const geometry = draft.geometry ?? uniformGeometry(draft);

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
    setComingSoon("");
  }

  const captureRun = useProjectRun("magnet");
  async function generate() {
    const archive = captureRun();
    setRunning(true);
    setError("");
    setComingSoon("");
    try {
      const next = await designHalbach(request);
      setResult(next);
      archive("Halbach array", { "magnet.result": next, "magnet.resultKey": currentKey });
      setResultKey(currentKey);
      setSliceIndex(0);
    } catch (err) {
      archive("Halbach array · failed", { "magnet.error": err instanceof Error ? err.message : "Design failed", "magnet.result": null });
      setResult(null);
      setResultKey("");
      setError(err instanceof Error ? err.message : "Halbach array design failed.");
    } finally {
      archive.cancel();
      setRunning(false);
    }
  }

  function runStudy() {
    setComingSoon("Magnet field simulation is coming soon.");
  }

  async function saveStl(target: "assembly" | "ring") {
    if (!result) return;
    setSaving(target === "assembly" ? "Saving assembly STL…" : "Saving slice STL…");
    setError("");
    try {
      const bytes = halbachStl({
        cubes: result.cubes,
        plates: result.plates ?? [],
        rods: result.rods ?? [],
        sliceIndex: target === "ring" ? selectedSlice : null,
      });
      await saveBlob(halbachStlName(target, selectedSlice), new Blob([bytes], { type: "model/stl" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save STL.");
    } finally {
      setSaving("");
    }
  }

  async function saveStep(target: "assembly" | "ring") {
    setSaving(target === "assembly" ? "Saving assembly STEP…" : "Saving slice STEP…");
    setError("");
    try {
      const file = await exportHalbachCad({ ...request, target, format: "step", slice_index: selectedSlice });
      await saveBlob(file.filename, new Blob([decodeB64(file.data_b64)], { type: file.media_type }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save STEP.");
    } finally {
      setSaving("");
    }
  }

  const busy = running || Boolean(saving);
  const catalog = Boolean(draft.geometry);

  return (
    <WorkspaceShell kind="magnet" label="Halbach array">
      <div className="ws-body">
        <main className="ws-viewer">
          <div className="ws-stage">
            {result ? (
              <Suspense fallback={<p className="ws-empty">Drawing the array…</p>}>
                <HalbachLayoutView
                  cubes={result.cubes}
                  plates={result.plates}
                  rods={result.rods}
                  innerRadiusMm={result.inner_radius_mm}
                  magnetMm={result.magnet_mm}
                  label={`${result.title} layout`}
                  view={view}
                  showBore={showBore}
                  resetNonce={resetNonce}
                />
              </Suspense>
            ) : (
              <p className="ws-empty">{running ? "Building the Halbach array…" : "Generate an array to place the magnet cubes."}</p>
            )}
          </div>
          <nav className="ws-viewbar" aria-label="Inspect design">
            <SegmentedControl
              label="Inspect design"
              className="ws-seg-ghost"
              value={view}
              options={[
                { id: "magnets", label: "Magnets", name: "Magnets view" },
                { id: "assembly", label: "Assembly", name: "Assembly view" },
              ]}
              onChange={setView}
            />
            <div className="ws-scene-tools">
              <span className="ws-small ws-muted">
                {view === "assembly" ? "Plates, stands, rods, and magnet cubes" : "Halbach cylinder · magnetization at 2θ"}
              </span>
              <div className="ws-row">
                {view === "magnets" ? (
                  <label className="ws-row ws-small">
                    <input type="checkbox" checked={showBore} onChange={(event) => setShowBore(event.target.checked)} />
                    Bore
                  </label>
                ) : null}
                <button type="button" className="ws-quiet" onClick={() => setResetNonce((value) => value + 1)}>
                  <RotateCcw aria-hidden="true" /> Reset view
                </button>
              </div>
            </div>
          </nav>
          <div className={`ws-overlay-bottom${resultsOpen ? "" : " is-collapsed"}`}>
            <div className="ws-caption">
              <span>
                {result
                  ? view === "assembly"
                    ? "Drag to rotate · slice plates, stands, and connection rods"
                    : "Drag to rotate · cube magnets on concentric rings"
                  : "Cube magnets appear after a generated array"}
              </span>
              <span>From HalbachMRIDesigner · field study is not run here</span>
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
                    {result ? result.magnet_count : "—"} cubes
                    <span className="ws-overlay-sep" aria-hidden="true">
                      ·
                    </span>
                    {result ? `${result.br_t} T` : "—"}
                  </span>
                </span>
              )}
              <ChevronDown aria-hidden="true" />
            </button>
            {resultsOpen ? (
              <div id="ws-run-results">
                <div className="ws-metrics">
                  <Metric label="Magnet cubes" value={result ? result.magnet_count : "—"} />
                  <Metric label="Slice plates" value={result ? result.slice_count ?? result.rings : "—"} />
                  <Metric
                    label="Bore"
                    value={result ? formatFixed(result.inner_radius_mm * 2, 1) : "—"}
                    unit={result ? "mm" : undefined}
                  />
                </div>
                <div className="ws-metric-note">
                  {result
                    ? stale
                      ? "Previous array · does not match the current draft"
                      : catalog
                        ? `${result.magnet_mm} mm cubes · Br ${formatFixed(result.br_t, 2)} T · ${result.geometry?.rings.length ?? 0} ring definitions`
                        : `${result.magnet_mm} mm cubes · Br ${formatFixed(result.br_t, 2)} T · ${result.outer_ring ? "inner and outer rings" : "single ring"}`
                    : running
                      ? "Building the Halbach array"
                      : "No generated array yet"}
                </div>
              </div>
            ) : null}
          </div>
        </main>
        <aside className="ws-inspector" aria-label="Halbach array setup">
          <ProjectPanel
            status={stale ? <span role="status">Draft · array outdated</span> : undefined}
            projectName={projectName}
            title="Halbach array design"
            onAssembly={onAssembly}
            onClose={onClose}
          />
          <div className="ws-sections">
          <section className="ws-section">
            <h3>Bore</h3>
            <NumericField
              label="Inner radius"
              unit="· mm"
              name="Inner radius (mm)"
              value={draft.inner_radius_mm}
              min={30}
              max={400}
              step={1}
              onChange={(value) => patch({ inner_radius_mm: value, geometry: null })}
            />
            <NumericField
              label="Ring spacing"
              unit="· mm"
              name="Ring spacing (mm)"
              value={draft.ring_sep_mm}
              min={8}
              max={80}
              step={1}
              onChange={(value) => patch({ ring_sep_mm: value, geometry: null })}
            />
            <NumericField
              label="Ring planes"
              name="Ring planes"
              value={draft.rings}
              min={1}
              max={23}
              step={1}
              onChange={(value) => patch({ rings: value, geometry: null })}
            />
          </section>
          <section className="ws-section">
            <h3>Magnets</h3>
            <NumericField
              label="Cube size"
              unit="· mm"
              name="Cube size (mm)"
              value={draft.magnet_mm}
              min={4}
              max={40}
              step={0.5}
              onChange={(value) => patch({ magnet_mm: value })}
            />
            <NumericField
              label="Inner magnets / ring"
              name="Inner magnets per ring"
              value={draft.magnets}
              min={6}
              max={80}
              step={1}
              onChange={(value) => patch({ magnets: value, geometry: null })}
            />
            <NumericField
              label="Remanence"
              unit="· T"
              name="Remanence (T)"
              value={draft.br_t}
              min={0.4}
              max={1.6}
              step={0.05}
              onChange={(value) => patch({ br_t: value })}
            />
            <label className="ws-row ws-small" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={draft.outer_ring}
                onChange={(event) => patch({ outer_ring: event.target.checked, geometry: null })}
              />
              Outer Halbach ring
            </label>
            {draft.outer_ring && !catalog ? (
              <>
                <NumericField
                  label="Outer offset"
                  unit="· mm"
                  name="Outer offset (mm)"
                  value={draft.outer_offset_mm}
                  min={10}
                  max={40}
                  step={1}
                  onChange={(value) => patch({ outer_offset_mm: value, geometry: null })}
                />
                <NumericField
                  label="Extra outer magnets"
                  name="Extra outer magnets"
                  value={draft.outer_extra}
                  min={0}
                  max={16}
                  step={1}
                  onChange={(value) => patch({ outer_extra: value, geometry: null })}
                />
              </>
            ) : null}
          </section>
          <section className="ws-section">
            <h3>Full geometry</h3>
            <p className="ws-muted ws-small">
              {catalog
                ? `${geometry.rings.length} ring definitions · ${geometry.slices.length} slice plates${geometry.mirrorSlices ? " · mirrored" : ""}`
                : "Uniform concentric rings. Open the geometry card for per-slice radii like mri1.json."}
            </p>
            <button type="button" className="ws-quiet" onClick={() => setGeometryOpen(true)}>
              <SlidersHorizontal aria-hidden="true" /> Edit geometry…
            </button>
          </section>
          <section className="ws-section">
            <h3>Export</h3>
            <p className="ws-muted ws-small">STL is built from the preview. STEP uses Gmsh when it is available.</p>
            {plates.length ? (
              <label className="ws-formrow">
                <span>Slice plate</span>
                <select
                  aria-label="Slice plate"
                  value={selectedSlice}
                  onChange={(event) => setSliceIndex(Number(event.target.value))}
                >
                  {plates.map((plate) => (
                    <option key={plate.index} value={plate.index}>
                      {plate.index} · z {formatFixed(plate.z * 1000, 0)} mm
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="ws-export-actions">
              <button type="button" className="ws-quiet" onClick={() => void saveStl("ring")} disabled={busy || stale || !result}>
                <Download aria-hidden="true" /> Slice STL
              </button>
              <button type="button" className="ws-quiet" onClick={() => void saveStl("assembly")} disabled={busy || stale || !result}>
                <Download aria-hidden="true" /> Assembly STL
              </button>
              <button type="button" className="ws-quiet" onClick={() => void saveStep("ring")} disabled={busy || stale || !result}>
                <Download aria-hidden="true" /> Slice STEP
              </button>
              <button type="button" className="ws-quiet" onClick={() => void saveStep("assembly")} disabled={busy || stale || !result}>
                <Download aria-hidden="true" /> Assembly STEP
              </button>
            </div>
          </section>
          <section className="ws-section">
            <details className="ws-details">
              <summary>Designer details</summary>
              <div className="ws-muted ws-small" style={{ marginTop: 8 }}>
                Engine · HalbachMRIDesigner. Magnetization at twice the ring azimuth, as in O&apos;Reilly et al., JMR 2019. This workspace places the cubes and mechanical plates. It does not solve the field.
              </div>
            </details>
          </section>
          </div>
          {comingSoon ? (
            <p className="ws-alert" role="status">
              {comingSoon}
            </p>
          ) : error ? (
            <p className="ws-alert" role="alert">
              {error}
            </p>
          ) : saving ? (
            <p className="ws-alert" role="status">
              {saving}
            </p>
          ) : running ? (
            <p className="ws-alert" role="status">
              Building the array.
            </p>
          ) : null}
          <div className="ws-runbar">
            <button type="button" className="ws-primary" onClick={() => void generate()} disabled={busy}>
              <Play aria-hidden="true" /> {running ? "Generating…" : "Generate array"}
            </button>
            <button type="button" className="ws-quiet" onClick={runStudy} disabled={busy}>
              Run study
            </button>
            {stale && <div className="ws-stale" role="status">Setup changed · generate to update</div>}
          </div>
        </aside>
      </div>
      {geometryOpen ? (
        <HalbachGeometryDialog
          geometry={geometry}
          magnetMm={draft.magnet_mm}
          brT={draft.br_t}
          mur={draft.mur}
          onCancel={() => setGeometryOpen(false)}
          onApply={(next) => {
            patch({
              geometry: cloneGeometry(next.geometry),
              magnet_mm: next.magnet_mm,
              br_t: next.br_t,
              mur: next.mur,
              inner_radius_mm: Math.min(...next.geometry.slices.map((slice) => slice.innerRadius)),
              rings: next.geometry.slices.length,
            });
            setGeometryOpen(false);
          }}
        />
      ) : null}
    </WorkspaceShell>
  );
}
