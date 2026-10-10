import { lazy, Suspense, useEffect, useState } from "react";
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
import type { ShimFieldView } from "./ShimTray";

const ShimTrayView = lazy(() => import("./ShimTray").then((module) => ({ default: module.ShimTrayView })));

const FIELDS = [
  { key: "diameter_mm", label: "Diameter (mm)", min: 100, max: 300, step: 0.1, fallback: 203.3 },
  { key: "bottom_mm", label: "Bottom (mm)", min: -120, max: -10, step: 0.1, fallback: -48.5 },
  { key: "top_mm", label: "Top (mm)", min: 10, max: 120, step: 0.1, fallback: 48.5 },
  { key: "magnet_mm", label: "Magnet (mm)", min: 3, max: 15, step: 0.01, fallback: 6.35 },
  { key: "thickness_mm", label: "Thickness (mm)", min: 1, max: 8, step: 0.01, fallback: 3.18 },
  { key: "polarization_t", label: "Polarization (T)", min: 0.4, max: 1.6, step: 0.1, fallback: 1.2 },
  { key: "radial_spacing", label: "Radial spacing", min: 0.8, max: 2, step: 0.05, fallback: 1 },
  { key: "azimuthal_spacing", label: "Azimuthal spacing", min: 0.8, max: 2.5, step: 0.05, fallback: 1.25 },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const VIEWS: { id: ShimFieldView; title: string }[] = [
  { id: "before", title: "Measured" },
  { id: "after", title: "Shimmed" },
];

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
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
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

export function PassiveShimStudio({
  projectName,
  onAssembly,
}: {
  projectName: string;
  onAssembly?: () => void;
}) {
  const [draft, setDraft] = useState<Record<FieldKey, number>>({
    diameter_mm: 203.3,
    bottom_mm: -48.5,
    top_mm: 48.5,
    magnet_mm: 6.35,
    thickness_mm: 3.18,
    polarization_t: 1.2,
    radial_spacing: 1,
    azimuthal_spacing: 1.25,
  });
  const [centerMap, setCenterMap] = useState(true);
  const [upload, setUpload] = useState<ShimFieldMapUpload | null>(null);
  const [fieldMap, setFieldMap] = useState<ShimFieldSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShimSimulation | null>(null);
  const [view, setView] = useState<ShimFieldView>("before");
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedTo, setSavedTo] = useState("");
  const [error, setError] = useState("");

  const request: ShimRequest = { ...draft, center_map: centerMap, ...(upload ? { field_map: upload } : {}) };

  useEffect(() => {
    if (!savedTo) return;
    const hide = window.setTimeout(() => setSavedTo(""), 3200);
    return () => window.clearTimeout(hide);
  }, [savedTo]);

  async function inspect(next: ShimFieldMapUpload, center: boolean) {
    setLoading(true);
    setError("");
    try {
      const inspection = await inspectShimFieldMap(next, center);
      setUpload(next);
      setFieldMap(inspection.field);
      setResult(null);
      setView("before");
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
    setSavedTo("");
    setView("before");
    setError("");
  }

  async function onCenterChange(next: boolean) {
    setCenterMap(next);
    if (upload) await inspect(upload, next);
  }

  async function run() {
    setRunning(true);
    setError("");
    try {
      const next = await simulateShim(request);
      setResult(next);
      setSavedTo("");
      setView("after");
    } catch (err) {
      setResult(null);
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

  const placed = result ? result.n_positive + result.n_negative : 0;
  const shownField = result ? result.field : fieldMap;
  const trays = result
    ? { diameter_mm: result.diameter_mm, bottom_mm: result.bottom_mm, top_mm: result.top_mm }
    : { diameter_mm: draft.diameter_mm, bottom_mm: draft.bottom_mm, top_mm: draft.top_mm };

  return (
    <section className="studio-work" aria-label="Passive shimming">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Hardware</p>
        <h2>{projectName}</h2>
        <p>Load a measured field map, inspect it, then place passive shim magnets on two circular trays.</p>
        {onAssembly ? (
          <button type="button" className="studio-assembly-back" onClick={onAssembly}>
            Assembly
          </button>
        ) : null}
      </header>
      {savedTo ? (
        <p className="shim-toast" role="status" aria-label={`Saved to ${folderName(savedTo)}`} title={savedTo}>
          Saved to {folderName(savedTo)}
        </p>
      ) : null}
      <div className="studio-work-body shim-body">
        <div className="studio-work-panel shim-panel">
          <h3>Field map</h3>
          <p className="studio-work-note">
            A <code>.npy</code> of x, y, z in mm and B in mT. Without one, the trays shim a synthetic field.
          </p>
          <button type="button" className="mr0-run shim-file" onClick={() => void chooseFile()} disabled={loading}>
            {loading ? "Reading…" : fieldMap ? "Replace field map" : "Load field map"}
          </button>
          <label className="studio-param studio-param-check">
            <input type="checkbox" checked={centerMap} onChange={(event) => void onCenterChange(event.target.checked)} />
            Center the map between the trays
          </label>
          {fieldMap ? (
            <dl className="shim-stats" aria-label="Field map summary">
              <dt>File</dt>
              <dd>{fieldMap.source}</dd>
              <dt>Samples</dt>
              <dd>{fieldMap.samples.toLocaleString()}</dd>
              <dt>Mean</dt>
              <dd>{fieldMap.mean_mt.toFixed(3)} mT</dd>
              <dt>Peak to peak</dt>
              <dd>
                {fieldMap.p2p_mt.toFixed(3)} mT · {fieldMap.p2p_khz.toFixed(1)} kHz
              </dd>
              <dt>Std</dt>
              <dd>{Math.round(fieldMap.std_ppm).toLocaleString()} ppm</dd>
              <dt>X</dt>
              <dd>{formatMm(fieldMap.extent_mm.x)} mm</dd>
              <dt>Y</dt>
              <dd>{formatMm(fieldMap.extent_mm.y)} mm</dd>
              <dt>Z</dt>
              <dd>{formatMm(fieldMap.extent_mm.z)} mm</dd>
            </dl>
          ) : (
            <p className="studio-work-note">No field map loaded. The run uses the synthetic bore field.</p>
          )}
          {fieldMap ? (
            <button type="button" className="shim-clear" onClick={clearFieldMap}>
              Remove field map
            </button>
          ) : null}
        </div>
        <div className="shim-stage">
          <div className="studio-acq-view">
            {result || fieldMap ? (
              <div className={result?.field.after_mt ? "mr0-viewer has-switch" : "mr0-viewer"}>
                <Suspense fallback={<p className="studio-acq-empty">Drawing the trays…</p>}>
                  <ShimTrayView
                    trays={trays}
                    field={shownField}
                    view={view}
                    magnets={result?.magnets ?? []}
                    magnetSizeMm={result?.magnet_size_mm}
                  />
                </Suspense>
                {result?.field.after_mt ? (
                  <div className="mr0-switch" role="group" aria-label="Field view">
                    {VIEWS.map((item) => (
                      <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => setView(item.id)}>
                        {item.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="studio-acq-empty">
                {running ? "Shimming the bore field…" : "Load a field map to inspect it, or run with the synthetic field."}
              </p>
            )}
          </div>
        </div>
        <div className="studio-work-panel shim-panel shim-controls">
          <div className="studio-work-main-head">
            <h3>Passive shimming</h3>
            <p>
              {fieldMap
                ? `Shimming ${fieldMap.source} with iterated greedy search.`
                : "The bore field is synthetic until a field map is loaded."}
            </p>
          </div>
          <div className="studio-params">
            {FIELDS.map((field) => (
              <label key={field.key} className="studio-param">
                {field.label}
                <input
                  type="number"
                  aria-label={field.label}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={draft[field.key]}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setDraft((current) => ({
                      ...current,
                      [field.key]: Number.isFinite(next) ? Math.min(field.max, Math.max(field.min, next)) : field.fallback,
                    }));
                  }}
                />
              </label>
            ))}
          </div>
          <button type="button" className="mr0-run shim-file" onClick={run} disabled={running || loading || exporting}>
            {running ? "Shimming…" : "Run shimming"}
          </button>
          {result ? (
            <p className="coil-meta">
              {placed} {placed === 1 ? "magnet" : "magnets"} · {result.n_positive} positive · {result.n_negative} negative ·{" "}
              {Math.round(result.post_std_ppm)} ppm after, was {Math.round(result.pre_std_ppm)}
            </p>
          ) : null}
          {running ? <p role="status">Placing shim magnets on the trays.</p> : null}
          {loading ? <p role="status">Reading the field map.</p> : null}
          {error ? (
            <p className="mr0-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="shim-save">
            <button type="button" className="shim-clear" onClick={() => void saveTrays()} disabled={!result || exporting || running}>
              {exporting ? "Saving…" : "Save trays"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
