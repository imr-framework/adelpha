import { useEffect, useMemo, useState } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { FemFields } from "../mri/api";
import { useProjectState } from "./ProjectPersistence";
import { CONSOLE_THEMES, useConsoleTheme } from "../consoleTheme";
import { saveBlob } from "../../desktop/saveFile";
import { dsvCsv, validateDsv, type DsvConfig, type DsvResult } from "./femDsv";
const number = (v: number) => v === 0 ? "0" : v.toPrecision(5);
const initial: DsvConfig = { diameterMm: 5, centerMm: [0, 0, 0], component: "magnitude", resolution: 17 };
function DsvOutline({ config }: { config: DsvConfig }) {
  const [theme] = useConsoleTheme();
  const color = CONSOLE_THEMES.find(t => t.id === theme)!.accent;
  const geometry = useMemo(() => {
    const positions: number[] = [], radius = config.diameterMm / 2000, center = config.centerMm.map(v => v / 1000);
    for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 128; i++) for (const j of [i, i + 1]) {
      const p = [...center], angle = j / 128 * 2 * Math.PI;
      p[(axis + 1) % 3] += radius * Math.cos(angle); p[(axis + 2) % 3] += radius * Math.sin(angle); positions.push(...p);
    }
    const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(positions, 3)); return g;
  }, [config]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color={color} transparent opacity={.85} depthWrite={false} /></lineSegments>;
}
export function useFemDsv(data: FemFields | null, jobId: string) {
  // Project-wide region: keep identical coordinates when comparing solver runs.
  const [enabled, setEnabled] = useProjectState("fem.dsv.enabled", false);
  const [config, setConfig] = useProjectState<DsvConfig>("fem.dsv.config", initial);
  const [evaluation, setEvaluation] = useState<{ data: FemFields; config: DsvConfig; result?: DsvResult; error?: string } | null>(null);
  const [exportError, setExportError] = useState("");
  const invalid = validateDsv(config);
  const current = evaluation?.data === data && evaluation?.config === config ? evaluation : null;
  useEffect(() => {
    if (!data || !enabled || invalid) return;
    let worker: Worker | undefined, cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL("./femDsv.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = event => { if (!cancelled) setEvaluation({ data, config, ...event.data }); worker?.terminate(); };
        worker.onerror = () => { if (!cancelled) setEvaluation({ data, config, error: "DSV evaluation failed. Disable and enable DSV to retry." }); worker?.terminate(); };
        worker.postMessage({ data, config });
      } catch { if (!cancelled) setEvaluation({ data, config, error: "DSV evaluation is unavailable in this environment." }); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); worker?.terminate(); };
  }, [data, enabled, config, invalid]);
  const update = (patch: Partial<DsvConfig>) => { setConfig({ ...config, ...patch }); setExportError(""); };
  const result = current?.result;
  const controls = <details className="fem-section-settings fem-dsv-settings"><summary>DSV · Imaging volume</summary>
    <label className="fem-check-label"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setEvaluation(null); }} />Enable DSV</label>
    <small>Diameter of spherical volume. Evaluate B homogeneity in an air region without changing the solve.</small>
    {enabled && <>
      <label className="fem-control-label">Diameter (mm)<input aria-label="DSV diameter (mm)" type="number" min="0" step="any" value={Number.isFinite(config.diameterMm) ? config.diameterMm : ""} onChange={e => update({ diameterMm: e.target.valueAsNumber })} /></label>
      <div className="fem-dsv-center">{config.centerMm.map((value, i) => <label key={i}>{"XYZ"[i]} (mm)<input aria-label={`DSV center ${"XYZ"[i]} (mm)`} type="number" step="any" value={Number.isFinite(value) ? value : ""} onChange={e => update({ centerMm: config.centerMm.map((v, j) => i === j ? e.target.valueAsNumber : v) })} /></label>)}</div>
      <label className="fem-control-label">Homogeneity quantity<select aria-label="DSV quantity" value={config.component} onChange={e => update({ component: e.target.value as DsvConfig["component"] })}><option value="magnitude">Magnitude |B|</option>{["x", "y", "z"].map(v => <option key={v} value={v}>B{v.toUpperCase()}</option>)}</select></label>
      <label className="fem-control-label">Sampling resolution<select aria-label="DSV sampling resolution" value={config.resolution} onChange={e => update({ resolution: +e.target.value })}><option value={17}>Standard · 17 per axis</option><option value={25}>Fine · 25 per axis</option><option value={33}>Finer · 33 per axis</option></select></label>
      {invalid || current?.error ? <p role="alert">{invalid || current?.error}</p> : !result ? <p role="status">Evaluating DSV…</p> : <>
        <dl className="fem-dsv-stats">{[["Mean B (T)", number(result.mean)], ["Sampled minimum (T)", number(result.min)], ["Sampled maximum (T)", number(result.max)], ["Peak-to-peak (ppm)", result.ppmPeakToPeak === null ? "Undefined" : number(result.ppmPeakToPeak)], ["RMS variation (ppm)", result.ppmRms === null ? "Undefined" : number(result.ppmRms)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <small>{result.samples.length.toLocaleString()} volume + surface samples. Ppm uses |volume mean|; RMS is about the volume mean. {result.ppmRms === null && "Mean field is too close to zero for meaningful ppm."}</small>
        <button type="button" onClick={() => { if (!data) return; setExportError(""); void saveBlob(`elmer-${jobId.slice(0, 8)}-dsv.csv`, new Blob([dsvCsv(result, config, jobId, data.source)], { type: "text/csv" })).catch(e => setExportError(`DSV export failed: ${e.message || e}`)); }}>Export DSV samples · CSV</button>
      </>}
      {exportError && <p role="alert">{exportError}</p>}
      <small>Sampled estimates, not a homogeneity certification. Refine both sampling and FEM mesh; the sphere must remain inside air and clear of solids.</small>
    </>}
  </details>;
  return { controls, overlay: enabled && !invalid ? <DsvOutline config={config} /> : null,
    annotation: enabled && !invalid ? ` · DSV Ø${config.diameterMm} mm at (${config.centerMm.join(", ")}) mm` : "" };
}
