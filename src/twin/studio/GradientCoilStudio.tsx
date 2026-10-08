import { lazy, Suspense, useState } from "react";
import { simulateCoil, type CoilRequest, type CoilSimulation } from "../mri/api";

const CoilLayoutView = lazy(() => import("./CoilLayout").then((module) => ({ default: module.CoilLayoutView })));

const SHAPES = [
  { id: "cylinder", name: "Cylinder", description: "Winding on a cylindrical former." },
  { id: "planar", name: "Planar", description: "One flat rectangular plate." },
  { id: "biplanar", name: "Biplanar", description: "Two parallel plates." },
  { id: "circular", name: "Circular", description: "One flat circular plate." },
] as const;

const AXES = [
  { id: "x", name: "X gradient", description: "Transverse field that varies along x." },
  { id: "y", name: "Y gradient", description: "Transverse field that varies along y." },
  { id: "z", name: "Z gradient", description: "Longitudinal field that varies along the bore." },
] as const;

type ShapeId = (typeof SHAPES)[number]["id"];
type AxisId = (typeof AXES)[number]["id"];

const FIELDS = [
  { key: "radius_mm", label: "Radius (mm)", min: 80, max: 300, step: 1, fallback: 140 },
  { key: "length_mm", label: "Length (mm)", min: 120, max: 600, step: 1, fallback: 280 },
  { key: "width_mm", label: "Width (mm)", min: 80, max: 500, step: 1, fallback: 250 },
  { key: "height_mm", label: "Height (mm)", min: 80, max: 500, step: 1, fallback: 250 },
  { key: "gap_mm", label: "Gap (mm)", min: 40, max: 400, step: 1, fallback: 200 },
  { key: "levels", label: "Levels", min: 4, max: 20, step: 1, fallback: 10 },
  { key: "gradient_mt_m", label: "Gradient (mT/m)", min: 1, max: 40, step: 1, fallback: 10 },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const SHAPE_FIELDS: Record<ShapeId, FieldKey[]> = {
  cylinder: ["radius_mm", "length_mm", "levels", "gradient_mt_m"],
  planar: ["width_mm", "height_mm", "levels", "gradient_mt_m"],
  biplanar: ["width_mm", "height_mm", "gap_mm", "levels", "gradient_mt_m"],
  circular: ["radius_mm", "levels", "gradient_mt_m"],
};

export function GradientCoilStudio({
  projectName,
  onAssembly,
}: {
  projectName: string;
  onAssembly?: () => void;
}) {
  const [shape, setShape] = useState<ShapeId>("cylinder");
  const [axis, setAxis] = useState<AxisId>("y");
  const [draft, setDraft] = useState<Record<FieldKey, number>>({
    radius_mm: 140,
    length_mm: 280,
    width_mm: 250,
    height_mm: 250,
    gap_mm: 200,
    levels: 10,
    gradient_mt_m: 10,
  });
  const [result, setResult] = useState<CoilSimulation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const coil = AXES.find((item) => item.id === axis) ?? AXES[1];
  const former = SHAPES.find((item) => item.id === shape) ?? SHAPES[0];
  const fields = FIELDS.filter((field) => SHAPE_FIELDS[shape].includes(field.key));

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

  async function run() {
    setRunning(true);
    setError("");
    try {
      setResult(await simulateCoil(request));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Gradient coil simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio-work" aria-label="Gradient coils">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Hardware</p>
        <h2>{projectName}</h2>
        <p>Design a cylinder, planar, biplanar, or circular gradient winding with pyCoilGen.</p>
        {onAssembly ? (
          <button type="button" className="studio-assembly-back" onClick={onAssembly}>
            Assembly
          </button>
        ) : null}
      </header>
      <div className="studio-work-body">
        <div className="studio-work-panel">
          <h3>Former</h3>
          <ul className="studio-work-list">
            {SHAPES.map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={item.id === shape} onClick={() => setShape(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <h3>Gradient</h3>
          <ul className="studio-work-list">
            {AXES.map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={item.id === axis} onClick={() => setAxis(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="studio-work-panel studio-work-main studio-acq">
          <div className="studio-acq-controls">
            <div className="studio-work-main-head">
              <h3>{coil.name}</h3>
              <p>
                {former.name}. {coil.description}
              </p>
            </div>
            <div className="studio-params">
              {fields.map((field) => (
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
              {running ? "Simulating…" : "Run simulation"}
            </button>
            {result ? (
              <p className="coil-meta">
                {result.loop_count} {result.loop_count === 1 ? "loop" : "loops"}
                {result.achieved_mt_m != null ? ` · ${result.achieved_mt_m} mT/m/A` : ""}
                {result.mean_field_error != null ? ` · mean error ${Math.round(result.mean_field_error * 100)}%` : ""}
              </p>
            ) : null}
            {running ? <p role="status">Building the winding.</p> : null}
            {error ? (
              <p className="mr0-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="studio-acq-view">
            {result ? (
              <CoilFigures result={result} />
            ) : (
              <p className="studio-acq-empty">{running ? "Simulating the winding…" : "The winding appears here."}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const FIGURES = [
  { id: "orbit", title: "Orbit" },
  { id: "layout", title: "3D layout" },
  { id: "surface", title: "Surface" },
] as const;

function CoilFigures({ result }: { result: CoilSimulation }) {
  const [view, setView] = useState<(typeof FIGURES)[number]["id"]>("orbit");
  return (
    <div className="mr0-viewer">
      {view === "orbit" ? (
        <Suspense fallback={<p className="studio-acq-empty">Drawing the winding…</p>}>
          <CoilLayoutView layout={result.layout} label={`${result.title} layout`} />
        </Suspense>
      ) : (
        <figure className="mr0-stage coil-figure">
          <img
            src={`data:image/png;base64,${view === "layout" ? result.layout_png : result.surface_png}`}
            alt={view === "layout" ? `${result.title} 3D layout` : `${result.title} surface`}
          />
        </figure>
      )}
      <div className="mr0-switch" role="group" aria-label="Coil figure">
        {FIGURES.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => setView(item.id)}>
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );
}
