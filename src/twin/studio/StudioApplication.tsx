import { ProjectPanel } from "./workspace";
import { useProjectState, useProjectRun, useProjectBusy } from "./ProjectPersistence";
import { useEffect, useRef, useState } from "react";
import { requestUseAcquisitionParameters } from "../acquisitionHandoff";
import { fetchSequences, simulateMr0, type Mr0Request, type Mr0Simulation } from "../mri/api";
import type { ParameterProperty, SequenceInfo, SeqTab } from "../mri/types";
import "./studioWork.css";
import "./mrzeroWorkspace.css";

const STUDIO_SEQUENCE_IDS = ["se_2D", "tse_3D"] as const;
type SequenceId = (typeof STUDIO_SEQUENCE_IDS)[number];

const TAB_LABEL: Record<SeqTab, string> = {
  sequence: "Sequence",
  adjustments: "Adjustments",
  system: "System",
  processing: "Processing",
  other: "Other",
};

function field(title: string, value: unknown, extra: Partial<ParameterProperty> = {}): ParameterProperty {
  const type = typeof value === "boolean" ? "boolean" : typeof value === "number" ? "integer" : "string";
  return { title, type, default: value, tab: "sequence", ...extra };
}

const FALLBACK_SEQUENCES: SequenceInfo[] = [
  {
    id: "se_2D",
    name: "2D Spin-Echo",
    description: "",
    adjustment: false,
    defaults: {
      TE: 5,
      TR: 100,
      NSA: 1,
      FOV: 64,
      Orientation: "Axial",
      Base_Resolution: 64,
      BW: 16000,
      Trajectory: "Cartesian",
      PE_Ordering: "Center_out",
      PF: 1,
      view_traj: false,
    },
    parameter_schema: {
      type: "object",
      properties: {
        TE: field("TE", 5, { unit: "ms", minimum: 0 }),
        TR: field("TR", 100, { unit: "ms", minimum: 0 }),
        NSA: field("Averages", 1, { minimum: 1 }),
        FOV: field("FOV", 64, { unit: "mm", minimum: 1 }),
        Orientation: field("Orientation", "Axial", { enum: ["Axial", "Sagittal", "Coronal"] }),
        Base_Resolution: field("Base Resolution", 64, { minimum: 8 }),
        BW: field("BW", 16000, { unit: "Hz" }),
        Trajectory: field("Trajectory", "Cartesian", { enum: ["Cartesian", "Radial"] }),
        PE_Ordering: field("PE Ordering", "Center_out"),
        PF: field("Partial Fourier", 1, { tab: "processing" }),
        view_traj: field("View trajectory", false, { tab: "other" }),
      },
    },
  },
  {
    id: "tse_3D",
    name: "3D Turbo Spin-Echo",
    description: "volumetric 3D TSE acquisition with Cartesian sampling",
    adjustment: false,
    defaults: {
      TE: 15,
      TR: 1000,
      ETL: 8,
      NSA: 1,
      Orientation: "Axial",
      FOV: 15,
      Base_Resolution: 32,
      Slices: 8,
      BW: 32000,
      Trajectory: "Cartesian",
      Ordering: "center_out",
      Plot_Timing: false,
    },
    parameter_schema: {
      type: "object",
      properties: {
        TE: field("TE", 15, { unit: "ms", minimum: 0 }),
        TR: field("TR", 1000, { unit: "ms", minimum: 0 }),
        ETL: field("ETL", 8, { minimum: 1 }),
        NSA: field("Averages", 1, { minimum: 1 }),
        Orientation: field("Orientation", "Axial", { enum: ["Axial", "Sagittal", "Coronal"] }),
        FOV: field("FOV", 15, { unit: "mm", minimum: 1 }),
        Base_Resolution: field("Base Resolution", 32, { minimum: 8 }),
        Slices: field("Slices", 8, { minimum: 1 }),
        BW: field("BW", 32000, { unit: "Hz" }),
        Trajectory: field("Trajectory", "Cartesian", { enum: ["Cartesian", "Radial"] }),
        Ordering: field("Ordering", "center_out", { enum: ["center_out", "linear_up", "linear_down"] }),
        Plot_Timing: field("Plot Sequence Timing", false),
      },
    },
  },
];

function draftsFrom(list: SequenceInfo[]) {
  return Object.fromEntries(list.map((item) => [item.id, { ...item.defaults }]));
}

function asNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function AcquisitionStudio({ projectName, onClose }: { projectName: string; onClose?: () => void }) {
  const [catalog, setCatalog] = useState(FALLBACK_SEQUENCES);
  const [drafts, setDrafts] = useProjectState<Record<string, Record<string, unknown>>>("acquisition.drafts", () => draftsFrom(FALLBACK_SEQUENCES));
  const [sequenceId, setSequenceId] = useProjectState<SequenceId>("acquisition.sequenceId", "se_2D");
  const [locallyRunning, setRunning] = useState(false);
  const running = useProjectBusy() || locallyRunning;
  const [error, setError] = useProjectState("acquisition.error", "");
  const [result, setResult] = useProjectState<Mr0Simulation | null>("acquisition.result", null);
  const sequence = catalog.find((item) => item.id === sequenceId) ?? catalog[0];
  const draft = drafts[sequence.id] ?? sequence.defaults;
  const properties = sequence.parameter_schema?.properties ?? {};
  const timingKeys = ["TE", "TR", "NSA", "ETL"];
  const samplingKeys = ["FOV", "Base_Resolution", "BW", "Orientation", "Trajectory", "Slices"];
  const renderFields = (keys: string[]) => keys.filter((key) => properties[key]).map((key) => (
    <SchemaField key={key} name={key} prop={properties[key]} value={draft[key] ?? properties[key].default} onChange={setParam} />
  ));
  const advanced = Object.entries(properties).filter(([key]) => !timingKeys.includes(key) && !samplingKeys.includes(key));

  useEffect(() => {
    let cancel = false;
    fetchSequences()
      .then((rows) => {
        if (cancel) return;
        const next = FALLBACK_SEQUENCES.map((item) => rows.find((row) => row.id === item.id) ?? item);
        setCatalog(next);
        setDrafts(current => ({ ...draftsFrom(next), ...current }));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  function chooseSequence(next: SequenceId) {
    setSequenceId(next);
    setResult(null);
    setError("");
  }

  function setParam(key: string, value: unknown) {
    setResult(null);
    setError("");
    setDrafts((current) => ({
      ...current,
      [sequence.id]: { ...(current[sequence.id] ?? sequence.defaults), [key]: value },
    }));
  }

  const fov = asNumber(draft.FOV, 0);
  const base = asNumber(draft.Base_Resolution, 0);
  const bandwidthHz = asNumber(draft.BW, 0);
  const request: Mr0Request = {
    sequence: sequence.id as Mr0Request["sequence"],
    b0_t: 0.5,
    inhomogeneity_ppm: 20,
    gmax_mt_m: 15,
    tr_ms: asNumber(draft.TR, 80),
    te_ms: asNumber(draft.TE, 16),
    flip_deg: 90,
    averages: asNumber(draft.NSA, 1),
    voxel_mm: fov > 0 && base > 0 ? fov / base : 8,
    bandwidth_hz: bandwidthHz > 0 && base > 0 ? bandwidthHz / base : 160,
    etl: sequence.id === "tse_3D" ? asNumber(draft.ETL, 8) : 1,
  };

  const captureRun = useProjectRun("acquisition");
  async function run() {
    if (request.te_ms <= 0 || request.tr_ms <= request.te_ms || fov <= 0 || base <= 0 || bandwidthHz <= 0) {
      setError("Use positive timing and sampling values, with TR greater than TE.");
      return;
    }
    const archive = captureRun();
    setRunning(true);
    setResult(null);
    setError("");
    try {
      const next = await simulateMr0(request);
      setResult(next);
      archive("Acquisition", { "acquisition.result": next });
    } catch (err) {
      archive("Acquisition · failed", { "acquisition.error": err instanceof Error ? err.message : "Simulation failed", "acquisition.result": null });
      setResult(null);
      setError(err instanceof Error ? err.message : "MRZero simulation failed.");
    } finally {
      archive.cancel();
      setRunning(false);
    }
  }

  return (
    <section className="studio-work mrzero-workspace" aria-label="Acquisition">
      <div className="mrzero-body">
        <section className="mrzero-imaging" aria-label="Simulation results">
          <div className="mrzero-image-panel">
            <h2>Simulated slice</h2>
            {result ? <SliceViewer result={result} /> : <div className="mrzero-placeholder" aria-busy={running}>
              <h3>{running ? "Simulating your slice" : "A Bloch simulator"}</h3>
              <p>{running ? "Running the Bloch simulation. Results will appear when it finishes." : "Choose a sequence, adjust its parameters, and run the simulation."}</p>
            </div>}
            {result ? <div className="mrzero-image-metrics"><span>SNR {Math.round(result.snr)}</span><span>Matrix {result.matrix} × {result.matrix}</span><span>Scan time {result.scan_time_s.toFixed(1)} s</span></div> : null}
          </div>
        </section>
        <form className="mrzero-inspector" onSubmit={(event) => { event.preventDefault(); void run(); }}>
          <ProjectPanel projectName={projectName} title="Acquisition · MRZero" status={<span className="mrzero-status" role="status"><i className={result ? "is-complete" : ""} />{running ? "Simulating…" : error ? "Simulation failed" : result ? "Complete" : "Ready to configure"}</span>} onClose={onClose} />
          <div className="mrzero-inspector-content">
            <h2>Simulation parameters</h2>
            <p className="mrzero-description">Design a low-field pulse sequence and simulate one brain slice with MRZero.</p>
            <fieldset disabled={running} className="mrzero-fields">
              <legend className="mrzero-sr-only">Simulation parameters</legend>
              <label className="studio-param mrzero-sequence"><span>Sequence</span><select value={sequenceId} onChange={(event) => chooseSequence(event.target.value as SequenceId)}>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className="mrzero-parameters">{renderFields(["TE", "TR", "NSA", "FOV", "Base_Resolution", "BW", "Orientation", "Trajectory", "ETL", "Slices"])}</div>
              {advanced.length ? <details className="mrzero-advanced"><summary>Advanced parameters</summary>
                {Object.entries(TAB_LABEL).map(([group, label]) => {
                  const entries = advanced.filter(([, prop]) => (prop.tab || "sequence") === group);
                  return entries.length ? <section key={group}><h3>{label}</h3>{entries.map(([key, prop]) => <SchemaField key={key} name={key} prop={prop} value={draft[key] ?? prop.default} onChange={setParam} />)}</section> : null;
                })}
              </details> : null}
            </fieldset>
            <section className="mrzero-context"><h3>Simulation context <span>(read-only)</span></h3><dl><div><dt>Main field strength</dt><dd>{request.b0_t} T</dd></div><div><dt>Field error</dt><dd>{request.inhomogeneity_ppm} ppm</dd></div><div><dt>Gradient amplitude limit</dt><dd>{request.gmax_mt_m} mT/m</dd></div></dl></section>
          </div>
          <div className="mrzero-actions">
            {error ? <p className="mr0-error" role="alert">{error}</p> : null}
            <button
              type="button"
              className="mrzero-secondary"
              disabled={running}
              onClick={() => requestUseAcquisitionParameters({ sequence: sequence.id, protocol_name: projectName, parameters: { ...draft } })}
            >
              Use parameters
            </button>
            <button type="submit" className="mr0-run" disabled={running}>{running ? "Simulating…" : "Run simulation"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

const SLICE_VIEWS = ["uniform", "noise", "field"] as const;
type SliceViewId = (typeof SLICE_VIEWS)[number];

function sliceViews(result: Mr0Simulation) {
  const signal = isSignalResult(result);
  return [
    {
      id: "uniform" as const,
      title: signal ? "Signal" : "Uniform",
      detail: signal ? signalDetail(result) : `${result.matrix} × ${result.matrix}`,
      image: result.image,
    },
    { id: "noise" as const, title: "Noise", detail: `SNR ${Math.round(result.snr)}`, image: result.noisy_image },
    {
      id: "field" as const,
      title: "Field error",
      detail: `${result.inhomogeneity_ppm} ppm`,
      image: result.inhomogeneous_image,
    },
  ];
}

function isSignalResult(result: Mr0Simulation) {
  return result.sequence_id === "rf_se" || result.sequence_id === "se_1D" || result.image?.height === 1;
}

function signalDetail(result: Mr0Simulation) {
  const samples = result.image?.width ?? result.echo.length;
  return result.sequence_id === "se_1D" ? `${samples} samples · projection` : `${samples} samples`;
}

function signalSamples(image: Mr0Simulation["image"]) {
  if (!image) return [];
  const count = image.height === 1 ? image.width : image.width === 1 ? image.height : image.values.length;
  return image.values.slice(0, count);
}

function SliceViewer({ result }: { result: Mr0Simulation }) {
  const [viewId, setViewId] = useState<SliceViewId>("uniform");
  const range = result.image ? displayWindow(result.image.values) : { lo: 0, hi: 1 };
  const views = sliceViews(result);
  const view = views.find((item) => item.id === viewId) ?? views[0];
  const signal = isSignalResult(result);

  return (
    <div className="mr0-viewer">
      <figure className="mr0-stage">
        {signal ? (
          <SignalPlot samples={signalSamples(view.image)} label={view.title} fill />
        ) : view.image ? (
          <Mr0Image image={view.image} range={range} label={view.title} />
        ) : null}
        <div className="mr0-anno mr0-anno-tl">
          <span>{view.detail}</span>
        </div>
      </figure>
      <div className="mr0-switch" role="group" aria-label={signal ? "Signal" : "Slice"}>
        {views.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === view.id} onClick={() => setViewId(item.id)}>
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function displayWindow(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (finite.length < 2) return { lo: 0, hi: 1 };
  const at = (fraction: number) => finite[Math.min(finite.length - 1, Math.floor(fraction * (finite.length - 1)))];
  const lo = at(0.08);
  const hi = at(0.995);
  return { lo, hi: Math.max(hi, lo + 1e-6) };
}

/** Canvas y=0 is the top; MRZero / numpy row 0 is the inferior edge (`origin='lower'`). */
export function sliceSourceIndex(x: number, y: number, width: number, height: number) {
  return (height - 1 - y) * width + x;
}

function Mr0Image({
  image,
  range,
  label,
}: {
  image: NonNullable<Mr0Simulation["image"]>;
  range: { lo: number; hi: number };
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const sourceContext = context2d(source);
    if (!sourceContext) return;
    const pixels = sourceContext.createImageData(image.width, image.height);
    const span = Math.max(range.hi - range.lo, 1e-6);
    const count = Math.min(image.values.length, image.width * image.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const src = sliceSourceIndex(x, y, image.width, image.height);
        if (src >= count) continue;
        const shade = Math.max(0, Math.min(255, Math.round(((image.values[src] - range.lo) / span) * 255)));
        const offset = (y * image.width + x) * 4;
        pixels.data[offset] = shade;
        pixels.data[offset + 1] = shade;
        pixels.data[offset + 2] = shade;
        pixels.data[offset + 3] = 255;
      }
    }
    sourceContext.putImageData(pixels, 0, 0);

    const paint = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      node.width = Math.round(width * dpr);
      node.height = Math.round(height * dpr);
      const context = context2d(node);
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#090a0d";
      context.fillRect(0, 0, width, height);
      const scale = Math.min(width / image.width, height / image.height);
      const drawnWidth = image.width * scale;
      const drawnHeight = image.height * scale;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
    };

    paint();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paint);
    observer.observe(host);
    return () => observer.disconnect();
  }, [image, range]);

  return <canvas ref={canvas} aria-label={label} />;
}

function context2d(node: HTMLCanvasElement) {
  try {
    return node.getContext("2d");
  } catch {
    return null;
  }
}

function SignalPlot({ samples, label = "Center echo magnitude", fill = false }: { samples: number[]; label?: string; fill?: boolean }) {
  if (samples.length < 2) return null;
  const width = 480;
  const height = fill ? 220 : 84;
  const padX = 2;
  const padY = fill ? 16 : 8;
  const peak = Math.max(...samples, 1e-12);
  const coords = samples.map((sample, index) => {
    const x = padX + (index / (samples.length - 1)) * (width - padX * 2);
    const y = height - padY - (sample / peak) * (height - padY * 2);
    return { x, y };
  });
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${coords[0].x.toFixed(1)},${height - padY} ${line} ${coords[coords.length - 1].x.toFixed(1)},${height - padY}`;
  const peakIndex = samples.reduce((best, sample, index) => (sample > samples[best] ? index : best), 0);
  const peakPoint = coords[peakIndex];
  const grid = [0.25, 0.5, 0.75].map((fraction) => {
    const y = height - padY - fraction * (height - padY * 2);
    return y.toFixed(1);
  });

  return (
    <svg
      className={fill ? "mr0-plot mr0-plot-fill" : "mr0-plot"}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {grid.map((y) => (
        <line key={y} x1={padX} x2={width - padX} y1={y} y2={y} stroke="var(--theme-border, rgba(255,255,255,0.08))" />
      ))}
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="var(--theme-border, rgba(255,255,255,0.2))" />
      <polygon points={area} fill="var(--theme-accent-soft, rgba(159,223,255,0.16))" />
      <polyline points={line} fill="none" stroke="var(--theme-accent, #9fdfff)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={peakPoint.x.toFixed(1)} cy={peakPoint.y.toFixed(1)} r="3" fill="var(--theme-accent, #f4f5f7)" />
    </svg>
  );
}

function SchemaField({
  name,
  prop,
  value,
  onChange,
}: {
  name: string;
  prop: ParameterProperty;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const label = prop.unit ? `${prop.title || name} (${prop.unit})` : prop.title || name;
  if (prop.type === "boolean") {
    return (
      <label className="studio-param studio-param-check">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(name, event.target.checked)} />
        <span>{prop.title || name}</span>
      </label>
    );
  }
  if (prop.enum?.length) {
    return (
      <label className="studio-param">
        <span>{label}</span>
        <select value={String(value ?? "")} onChange={(event) => onChange(name, event.target.value)}>
          {prop.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const numeric = prop.type === "integer" || prop.type === "number";
  return (
    <label className="studio-param">
      <span>{label}</span>
      <input
        type={numeric ? "number" : "text"}
        min={prop.minimum}
        max={prop.maximum}
        step={prop.step ?? (prop.type === "integer" ? 1 : undefined)}
        value={value == null ? "" : String(value)}
        onChange={(event) => {
          if (!numeric) {
            onChange(name, event.target.value);
            return;
          }
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(name, next);
        }}
      />
    </label>
  );
}
