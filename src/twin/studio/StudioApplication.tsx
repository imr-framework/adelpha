import { useEffect, useRef, useState } from "react";
import { fetchSequences, simulateKoma, type KomaRequest, type KomaSimulation } from "../mri/api";
import type { SequenceInfo } from "../mri/types";
import "./studioWork.css";

const SEQUENCES = [
  {
    id: "se",
    name: "Spin echo",
    summary: "90° excitation and a 180° refocusing pulse. The low-field workhorse.",
    tr: 80,
    te: 16,
    flip: 90,
  },
  {
    id: "gre",
    name: "Gradient echo",
    summary: "Spoiled GRE. Short TR, T1 or T2* contrast.",
    tr: 30,
    te: 8,
    flip: 40,
  },
  {
    id: "fse",
    name: "Fast spin echo",
    summary: "Four echoes per shot. TE is the echo spacing.",
    tr: 160,
    te: 16,
    flip: 90,
  },
  {
    id: "bssfp",
    name: "Balanced SSFP",
    summary: "Fully balanced readout. TE stays at half of TR.",
    tr: 12,
    te: 6,
    flip: 50,
  },
] as const;

const FOV_MM = 220;
const MATRIX_MIN = 20;
const MATRIX_MAX = 28;
const ECHO_TRAIN = 4;

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

type SequenceId = (typeof SEQUENCES)[number]["id"];

function matrixSize(voxelMm: number) {
  return Math.min(MATRIX_MAX, Math.max(MATRIX_MIN, Math.round(FOV_MM / voxelMm)));
}

function scanSeconds(sequence: SequenceId, trMs: number, voxelMm: number, averages: number) {
  const matrix = matrixSize(voxelMm);
  const shots = sequence === "fse" ? Math.ceil(matrix / ECHO_TRAIN) : matrix;
  return (trMs / 1000) * shots * averages;
}

export function AcquisitionStudio({ projectName }: { projectName: string }) {
  const [sequenceId, setSequenceId] = useState<SequenceId>("se");
  const [scanner, setScanner] = useState<SequenceInfo[] | null>(null);
  const [tr, setTr] = useState(80);
  const [te, setTe] = useState(16);
  const [flip, setFlip] = useState(90);
  const [field, setField] = useState(0.5);
  const [inhomogeneity, setInhomogeneity] = useState(20);
  const [gradient, setGradient] = useState(15);
  const [averages, setAverages] = useState(1);
  const [voxel, setVoxel] = useState(8);
  const [bandwidth, setBandwidth] = useState(160);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<KomaSimulation | null>(null);
  const sequence = SEQUENCES.find((item) => item.id === sequenceId) ?? SEQUENCES[0];
  const echoTime = sequenceId === "bssfp" ? tr / 2 : Math.min(te, tr);
  const matrix = matrixSize(voxel);
  const scan = scanSeconds(sequenceId, tr, voxel, averages);

  useEffect(() => {
    let cancel = false;
    fetchSequences()
      .then((rows) => {
        if (!cancel) setScanner(rows.filter((row) => !row.adjustment));
      })
      .catch(() => {
        if (!cancel) setScanner(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  function chooseSequence(next: SequenceId) {
    const preset = SEQUENCES.find((item) => item.id === next) ?? SEQUENCES[0];
    setSequenceId(next);
    setTr(preset.tr);
    setTe(preset.te);
    setFlip(preset.flip);
  }

  const request: KomaRequest = {
    sequence: sequenceId,
    b0_t: field,
    inhomogeneity_ppm: inhomogeneity,
    gmax_mt_m: gradient,
    tr_ms: tr,
    te_ms: echoTime,
    flip_deg: flip,
    averages,
    voxel_mm: voxel,
    bandwidth_hz: bandwidth,
  };

  async function run() {
    setRunning(true);
    setError("");
    try {
      setResult(await simulateKoma(request));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "KomaMRI simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio-work" aria-label="Acquisition">
      <header className="studio-work-bar">
        <p className="studio-work-kicker">Acquisition</p>
        <h2>{projectName}</h2>
        <p>Design a low-field pulse sequence and simulate one brain slice.</p>
      </header>
      <div className="studio-work-body">
        <div className="studio-work-panel">
          <h3>Pulse sequences</h3>
          <ul className="studio-work-list">
            {SEQUENCES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === sequenceId}
                  onClick={() => chooseSequence(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.summary}</span>
                </button>
              </li>
            ))}
          </ul>
          <h3>On this scanner</h3>
          {scanner === null ? (
            <p className="studio-work-note">Scanner sequences are unavailable.</p>
          ) : scanner.length === 0 ? (
            <p className="studio-work-note">The scanner has no sequences loaded.</p>
          ) : (
            <ul className="studio-work-list">
              {scanner.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => applyScannerSequence(item, setTr, setTe, setFlip)}>
                    <strong>{item.name}</strong>
                    <span>{item.description || item.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="studio-work-panel studio-work-main studio-acq">
          <div className="studio-acq-controls">
            <div className="studio-work-main-head">
              <h3>{sequence.name}</h3>
              <p>{sequence.summary}</p>
            </div>
            <h3>Scanner</h3>
            <div className="studio-params">
              <NumberField label="Field" unit="T" value={field} min={0.05} max={1} step={0.05} onChange={setField} />
              <NumberField label="Field error" unit="ppm" value={inhomogeneity} min={0} max={80} step={1} onChange={setInhomogeneity} />
              <NumberField label="Gradient" unit="mT/m" value={gradient} min={5} max={40} step={1} onChange={setGradient} />
            </div>
            <h3>Contrast</h3>
            <div className="studio-params">
              <NumberField
                label="TR"
                unit="ms"
                value={tr}
                min={4}
                max={400}
                onChange={(next) => {
                  setTr(next);
                  setTe((current) => Math.min(current, next));
                }}
              />
              <NumberField
                label={sequenceId === "fse" ? "Echo spacing" : "TE"}
                unit="ms"
                value={echoTime}
                min={1}
                max={tr}
                disabled={sequenceId === "bssfp"}
                onChange={setTe}
              />
              <NumberField label="Flip angle" unit="°" value={flip} min={5} max={180} onChange={setFlip} />
            </div>
            <h3>Signal</h3>
            <div className="studio-params">
              <NumberField label="Averages" unit="" value={averages} min={1} max={8} step={1} onChange={setAverages} />
              <NumberField label="Voxel size" unit="mm" value={voxel} min={6} max={12} step={0.5} onChange={setVoxel} />
              <NumberField label="Bandwidth" unit="Hz/px" value={bandwidth} min={40} max={400} step={10} onChange={setBandwidth} />
            </div>
            <p className="studio-work-note">
              {matrix} × {matrix} · {(FOV_MM / matrix).toFixed(1)} mm · {FOV_MM} mm field of view · {scan.toFixed(1)} s
            </p>
            <button type="button" className="koma-run" onClick={run} disabled={running}>
              {running ? "Simulating…" : "Run simulation"}
            </button>
            {result ? <CenterEcho result={result} /> : null}
            {running ? (
              <p role="status">Running the Bloch simulation. A longer TR or a second field-error pass takes longer.</p>
            ) : null}
            {error ? (
              <p className="koma-error" role="alert">
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

function sliceViews(result: KomaSimulation) {
  return [
    { id: "uniform" as const, title: "Uniform", detail: `${result.matrix} × ${result.matrix}`, image: result.image },
    { id: "noise" as const, title: "Noise", detail: `SNR ${Math.round(result.snr)}`, image: result.noisy_image },
    {
      id: "field" as const,
      title: "Field error",
      detail: `${result.inhomogeneity_ppm} ppm`,
      image: result.inhomogeneous_image,
    },
  ];
}

function SliceViewer({ result }: { result: KomaSimulation }) {
  const [viewId, setViewId] = useState<SliceViewId>("uniform");
  const range = result.image ? displayWindow(result.image.values) : { lo: 0, hi: 1 };
  const views = sliceViews(result);
  const view = views.find((item) => item.id === viewId) ?? views[0];

  return (
    <div className="koma-viewer">
      <figure className="koma-stage">
        {view.image ? <KomaImage image={view.image} range={range} label={view.title} /> : null}
        <div className="koma-anno koma-anno-tl">
          <span>{view.detail}</span>
        </div>
      </figure>
      <div className="koma-switch" role="group" aria-label="Slice">
        {views.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === view.id} onClick={() => setViewId(item.id)}>
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function CenterEcho({ result }: { result: KomaSimulation }) {
  return (
    <figure className="koma-echo">
      <div className="koma-echo-head">
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

function KomaImage({
  image,
  range,
  label,
}: {
  image: NonNullable<KomaSimulation["image"]>;
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

function SignalPlot({ samples }: { samples: number[] }) {
  if (samples.length < 2) return null;
  const width = 480;
  const height = 84;
  const padX = 2;
  const padY = 8;
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
    <svg className="koma-plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Center echo magnitude">
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

function applyScannerSequence(
  sequence: SequenceInfo,
  setTr: (value: number) => void,
  setTe: (value: number) => void,
  setFlip: (value: number) => void,
) {
  const tr = numberDefault(sequence.defaults, ["TR", "tr", "RepetitionTime"]);
  const te = numberDefault(sequence.defaults, ["TE", "te", "EchoTime"]);
  const flip = numberDefault(sequence.defaults, ["FA", "flip", "FlipAngle"]);
  if (tr != null) setTr(tr);
  if (te != null) setTe(te);
  if (flip != null) setFlip(flip);
}

function numberDefault(defaults: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = defaults[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
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
