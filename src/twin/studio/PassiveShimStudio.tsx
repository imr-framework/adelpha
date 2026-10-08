import { lazy, Suspense, useState } from "react";
import { simulateShim, type ShimRequest, type ShimSimulation } from "../mri/api";

const ShimTrayView = lazy(() => import("./ShimTray").then((module) => ({ default: module.ShimTrayView })));

const FIELDS = [
  { key: "diameter_mm", label: "Diameter (mm)", min: 100, max: 250, step: 0.1, fallback: 152 },
  { key: "offset_mm", label: "Tray offset (mm)", min: 30, max: 80, step: 0.1, fallback: 48.5 },
  { key: "dsv_mm", label: "DSV (mm)", min: 40, max: 90, step: 1, fallback: 70 },
  { key: "candidates", label: "Candidates per tray", min: 8, max: 40, step: 1, fallback: 20 },
  { key: "steps", label: "Search steps", min: 10, max: 80, step: 1, fallback: 40 },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function PassiveShimStudio({
  projectName,
  onAssembly,
}: {
  projectName: string;
  onAssembly?: () => void;
}) {
  const [draft, setDraft] = useState<Record<FieldKey, number>>({
    diameter_mm: 152,
    offset_mm: 48.5,
    dsv_mm: 70,
    candidates: 20,
    steps: 40,
  });
  const [result, setResult] = useState<ShimSimulation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const request: ShimRequest = {
    diameter_mm: draft.diameter_mm,
    offset_mm: draft.offset_mm,
    dsv_mm: draft.dsv_mm,
    candidates: draft.candidates,
    steps: draft.steps,
  };

  async function run() {
    setRunning(true);
    setError("");
    try {
      setResult(await simulateShim(request));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Passive shimming failed.");
    } finally {
      setRunning(false);
    }
  }

  const placed = result ? result.n_positive + result.n_negative : 0;

  return (
    <section className="studio-work" aria-label="Passive shimming">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Hardware</p>
        <h2>{projectName}</h2>
        <p>Place passive shim magnets on two circular trays.</p>
        {onAssembly ? (
          <button type="button" className="studio-assembly-back" onClick={onAssembly}>
            Assembly
          </button>
        ) : null}
      </header>
      <div className="studio-work-body">
        <div className="studio-work-panel">
          <h3>Shim trays</h3>
          <p className="studio-work-note">
            Two plates, one above and one below the bore. Magnets are N45, 6.35 mm square and 3.18 mm thick.
          </p>
        </div>
        <div className="studio-work-panel studio-work-main studio-acq">
          <div className="studio-acq-controls">
            <div className="studio-work-main-head">
              <h3>Passive shimming</h3>
              <p>The bore field is synthetic, so this run does not need a measured map.</p>
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
            <button type="button" className="mr0-run" onClick={run} disabled={running}>
              {running ? "Shimming…" : "Run shimming"}
            </button>
            {result ? (
              <p className="coil-meta">
                {placed} {placed === 1 ? "magnet" : "magnets"} · {result.n_positive} positive · {result.n_negative} negative ·{" "}
                {Math.round(result.post_std_ppm)} ppm after, was {Math.round(result.pre_std_ppm)}
              </p>
            ) : null}
            {running ? <p role="status">Placing shim magnets on the trays.</p> : null}
            {error ? (
              <p className="mr0-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="studio-acq-view">
            {result ? (
              <Suspense fallback={<p className="studio-acq-empty">Drawing the trays…</p>}>
                <ShimTrayView result={result} />
              </Suspense>
            ) : (
              <p className="studio-acq-empty">{running ? "Shimming the bore field…" : "The shim trays appear here."}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
