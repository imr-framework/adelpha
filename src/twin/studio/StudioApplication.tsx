import { useEffect, useRef, useState } from "react";
import { fetchSequences, simulateMr0, type Mr0Request, type Mr0Simulation } from "../mri/api";
import type { ParameterProperty, SequenceInfo, SeqTab } from "../mri/types";
import "./studioWork.css";

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

const METHODS = [
  {
    id: "fft",
    name: "Cartesian FFT",
    summary: "Inverse Fourier transform of a Cartesian k-space grid.",
  },
  {
    id: "grid",
    name: "Gridding",
    summary: "Resample non-Cartesian readouts onto a Cartesian grid, then FFT.",
  },
  {
    id: "sense",
    name: "SENSE",
    summary: "Unfold aliased images with coil sensitivity maps.",
  },
  {
    id: "grappa",
    name: "GRAPPA",
    summary: "Fill missing k-space lines from a kernel trained on ACS lines.",
  },
] as const;

export function AcquisitionStudio({ projectName }: { projectName: string }) {
  const [catalog, setCatalog] = useState(FALLBACK_SEQUENCES);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>(() => draftsFrom(FALLBACK_SEQUENCES));
  const [sequenceId, setSequenceId] = useState<SequenceId>("se_2D");
  const [tab, setTab] = useState<SeqTab>("sequence");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Mr0Simulation | null>(null);
  const sequence = catalog.find((item) => item.id === sequenceId) ?? catalog[0];
  const draft = drafts[sequence.id] ?? sequence.defaults;
  const properties = sequence.parameter_schema?.properties ?? {};
  const tabs = (Object.keys(TAB_LABEL) as SeqTab[]).filter((item) =>
    Object.values(properties).some((prop) => (prop.tab || "sequence") === item),
  );
  const activeTab = tabs.includes(tab) ? tab : "sequence";
  const fields = Object.entries(properties).filter(([, prop]) => (prop.tab || "sequence") === activeTab);

  useEffect(() => {
    let cancel = false;
    fetchSequences()
      .then((rows) => {
        if (cancel) return;
        const next = FALLBACK_SEQUENCES.map((item) => rows.find((row) => row.id === item.id) ?? item);
        setCatalog(next);
        setDrafts(draftsFrom(next));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  function chooseSequence(next: SequenceId) {
    setSequenceId(next);
    setTab("sequence");
  }

  function setParam(key: string, value: unknown) {
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

  async function run() {
    setRunning(true);
    setError("");
    try {
      setResult(await simulateMr0(request));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "MRZero simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio-work" aria-label="Acquisition">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Acquisition</p>
        <h2>{projectName}</h2>
        <p>Design a low-field pulse sequence and simulate one brain slice with MRZero.</p>
      </header>
      <div className="studio-work-body">
        <div className="studio-work-panel">
          <h3>Pulse sequences</h3>
          <ul className="studio-work-list">
            {catalog.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === sequenceId}
                  onClick={() => chooseSequence(item.id as SequenceId)}
                >
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
              <h3>{sequence.name}</h3>
              <p>{sequence.description}</p>
            </div>
            {tabs.length > 1 ? (
              <div className="studio-param-tabs" role="tablist" aria-label="Sequence parameters">
                {tabs.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={item === activeTab}
                    onClick={() => setTab(item)}
                  >
                    {TAB_LABEL[item]}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="studio-params" role="tabpanel">
              {fields.map(([key, prop]) => (
                <SchemaField
                  key={key}
                  name={key}
                  prop={prop}
                  value={draft[key] ?? prop.default}
                  onChange={setParam}
                />
              ))}
            </div>
            <button type="button" className="mr0-run" onClick={run} disabled={running}>
              {running ? "Simulating…" : "Run simulation"}
            </button>
            {result ? <CenterEcho result={result} /> : null}
            {running ? (
              <p role="status">Running the Bloch simulation. A longer TR or a second field-error pass takes longer.</p>
            ) : null}
            {error ? (
              <p className="mr0-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="studio-acq-view">
            {result ? (
              <SliceViewer result={result} />
            ) : (
              <p className="studio-acq-empty">{running ? "Simulating the slice…" : "The simulated slice appears here."}</p>
            )}
          </div>
        </div>
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

function CenterEcho({ result }: { result: Mr0Simulation }) {
  return (
    <figure className="mr0-echo">
      <div className="mr0-echo-head">
        <figcaption>Center echo</figcaption>
        <p>
          {result.phantom} · {result.spins.toLocaleString()} spins · {result.scan_time_s.toFixed(1)} s scan
        </p>
      </div>
      {result.reconstruction_error ? <p>Reconstruction did not finish.</p> : null}
      <SignalPlot samples={result.echo} />
    </figure>
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
    for (let index = 0; index < count; index += 1) {
      const shade = Math.max(0, Math.min(255, Math.round(((image.values[index] - range.lo) / span) * 255)));
      const offset = index * 4;
      pixels.data[offset] = shade;
      pixels.data[offset + 1] = shade;
      pixels.data[offset + 2] = shade;
      pixels.data[offset + 3] = 255;
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
        <line key={y} x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
      ))}
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="rgba(255,255,255,0.2)" />
      <polygon points={area} fill="rgba(159,223,255,0.16)" />
      <polyline points={line} fill="none" stroke="#9fdfff" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={peakPoint.x.toFixed(1)} cy={peakPoint.y.toFixed(1)} r="3" fill="#f4f5f7" />
    </svg>
  );
}

type MethodId = (typeof METHODS)[number]["id"];

export function ReconstructionStudio({ projectName }: { projectName: string }) {
  const [methodId, setMethodId] = useState<MethodId>("fft");
  const [matrix, setMatrix] = useState(128);
  const [acceleration, setAcceleration] = useState(2);
  const [trajectory, setTrajectory] = useState<"radial" | "spiral">("radial");
  const method = METHODS.find((item) => item.id === methodId) ?? METHODS[0];

  return (
    <section className="studio-work" aria-label="Reconstruction">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Reconstruction</p>
        <h2>{projectName}</h2>
        <p>Choose how acquired k-space becomes an image. This project does not edit hardware.</p>
      </header>
      <div className="studio-work-body">
        <div className="studio-work-panel">
          <h3>Method</h3>
          <ul className="studio-work-list">
            {METHODS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === methodId}
                  onClick={() => setMethodId(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="studio-work-panel studio-work-main">
          <div className="studio-work-main-head">
            <h3>{method.name}</h3>
            <p>{method.summary}</p>
          </div>
          <ReconSketch methodId={methodId} matrix={matrix} trajectory={trajectory} />
          <p className="studio-work-note">No acquired data is attached to this project yet.</p>
          <div className="studio-params">
            <NumberField label="Matrix" unit="" value={matrix} min={32} max={512} onChange={setMatrix} />
            {methodId === "sense" || methodId === "grappa" ? (
              <NumberField
                label="Acceleration"
                unit="×"
                value={acceleration}
                min={2}
                max={8}
                onChange={setAcceleration}
              />
            ) : null}
            {methodId === "grid" ? (
              <label className="studio-param">
                <span>Trajectory</span>
                <select value={trajectory} onChange={(event) => setTrajectory(event.target.value as "radial" | "spiral")}>
                  <option value="radial">Radial</option>
                  <option value="spiral">Spiral</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </div>
    </section>
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

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const name = unit ? `${label} (${unit})` : label;
  return (
    <label className="studio-param">
      <span>{name}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

function ReconSketch({
  methodId,
  matrix,
  trajectory,
}: {
  methodId: MethodId;
  matrix: number;
  trajectory: "radial" | "spiral";
}) {
  const lines = Math.max(4, Math.min(10, Math.round(matrix / 64)));
  return (
    <svg className="studio-sketch" viewBox="0 0 320 160" role="img" aria-label="Reconstruction layout">
      <rect width="320" height="160" fill="#2b2e34" />
      {methodId === "grid" && trajectory === "spiral" ? (
        <path
          d="M160 80 m0 -6 a6 6 0 1 1 -0.1 0 M160 80 m0 -16 a16 16 0 1 1 -0.2 0 M160 80 m0 -28 a28 28 0 1 1 -0.3 0 M160 80 m0 -42 a42 42 0 1 1 -0.4 0"
          fill="none"
          stroke="#9fdfff"
          strokeWidth="1.4"
        />
      ) : methodId === "grid" ? (
        Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI;
          const x2 = 160 + Math.cos(angle) * 52;
          const y2 = 80 + Math.sin(angle) * 52;
          const x1 = 160 - Math.cos(angle) * 52;
          const y1 = 80 - Math.sin(angle) * 52;
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9fdfff" strokeWidth="1.2" />;
        })
      ) : (
        Array.from({ length: lines }, (_, index) => {
          const y = 28 + (index * 104) / (lines - 1);
          const gap = methodId === "fft" ? 0 : index % 2 === 0 ? 0 : 18;
          return (
            <line
              key={index}
              x1={70 + gap}
              y1={y}
              x2={250 - gap}
              y2={y}
              stroke={index % 2 === 0 || methodId === "fft" ? "#f4f5f7" : "rgba(159,223,255,0.35)"}
              strokeWidth="1.4"
            />
          );
        })
      )}
    </svg>
  );
}
