import { useProjectState } from "./ProjectPersistence";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bounds, OrbitControls, GizmoHelper, GizmoViewport, useBounds } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, DoubleSide, Triangle, Vector3, Color, SRGBColorSpace, Box3, LineBasicMaterial, LineSegments } from "three";
import { Download, RotateCcw, Crosshair, Activity } from "lucide-react";
import { useConsoleTheme, lightThemePalette } from "../consoleTheme";
import { saveBlob } from "../../desktop/saveFile";
import { fetchFemFields, type FemFields } from "../mri/api";
import { bounds, fieldColor, fieldTriangles, scalar, type Component, type Sample } from "./femFieldGeometry";
import "./femFieldPreview.css";
import { useFemDsv } from "./FemDsvControls";
const format = (n: number) => n === 0 ? "0" : Math.abs(n) < .001 || Math.abs(n) >= 10000 ? n.toExponential(3) : n.toPrecision(4);
type Probe = { point: number[]; vector: number[] };
function FieldSurface({ samples, component, range, wireframe, onProbe }: { samples: Sample[]; component: Component; range: number[]; wireframe: boolean; onProbe: (p: Probe) => void }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(samples.flatMap(s => s.point), 3));
    g.setAttribute("color", new Float32BufferAttribute(samples.flatMap(s => { const c = fieldColor(scalar(s.vector, component), range[0], range[1]); return new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace).toArray(); }), 3));
    return g;
  }, [samples, component, range]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  function probe(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    const i = (e.faceIndex ?? 0) * 3, tri = samples.slice(i, i + 3);
    if (tri.length !== 3) return;
    const weights = new Vector3();
    Triangle.getBarycoord(e.point, new Vector3(...tri[0].point), new Vector3(...tri[1].point), new Vector3(...tri[2].point), weights);
    onProbe({ point: e.point.toArray(), vector: [0, 1, 2].map(j => tri[0].vector[j] * weights.x + tri[1].vector[j] * weights.y + tri[2].vector[j] * weights.z) });
  }
  return <group><mesh geometry={geometry} onClick={probe}><meshBasicMaterial vertexColors side={DoubleSide} toneMapped={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} /></mesh>
    {wireframe && <mesh geometry={geometry}><meshBasicMaterial color="#151725" wireframe transparent opacity={.25} /></mesh>}</group>;
}
function FieldLines({ lines }: { lines: number[][] }) {
  const object = useMemo(() => {
    const positions: number[] = [];
    for (const line of lines) for (let i = 3; i < line.length; i += 3) positions.push(...line.slice(i - 3, i + 3));
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return new LineSegments(geometry, new LineBasicMaterial({ color: "#50a7db", transparent: true, opacity: .5, depthWrite: false }));
  }, [lines]);
  useEffect(() => () => { object.geometry.dispose(); object.material.dispose(); }, [object]);
  return <primitive object={object} />;
}
function FieldFraming({ data, focus, slice }: { data: FemFields; focus: boolean; slice: boolean }) {
  const framing = useBounds();
  useEffect(() => {
    const box = new Box3();
    const indices = focus ? new Set(data.groups.filter(g => g.name !== "air").flatMap(g => g.triangles)) : null;
    if (indices) for (const i of indices) box.expandByPoint(new Vector3(...data.points.slice(i * 3, i * 3 + 3)));
    else for (let i = 0; i < data.points.length; i += 3) box.expandByPoint(new Vector3(...data.points.slice(i, i + 3)));
    if (slice && focus) box.expandByScalar(box.getSize(new Vector3()).length() * .25);
    framing.refresh(box).clip().fit();
  }, [data, focus, slice, framing]);
  return null;
}
type CaptureRequest = { name: string; label: string; min: number; max: number };
function Capture({ request, done, onError }: { request: CaptureRequest | null; done: (request: null) => void; onError: (error: string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!request) return;
    gl.render(scene, camera);
    const canvas = document.createElement("canvas");
    canvas.width = gl.domElement.width; canvas.height = gl.domElement.height + 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0d1018"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(gl.domElement, 0, 0);
    ctx.font = "16px sans-serif"; ctx.fillStyle = "#e7e9f2";
    ctx.fillText(request.label, 20, canvas.height - 64);
    const gradient = ctx.createLinearGradient(20, 0, 260, 0);
    ["#1f2970", "#1f6eab", "#1fb3a6", "#a6d65e", "#fcde40"].forEach((c, i) => gradient.addColorStop(i / 4, c));
    ctx.fillStyle = gradient; ctx.fillRect(20, canvas.height - 48, 240, 10);
    ctx.fillStyle = "#e7e9f2"; ctx.fillText(format(request.min), 20, canvas.height - 16); ctx.fillText(format(request.max), 200, canvas.height - 16);
    canvas.toBlob(blob => { if (blob) void saveBlob(request.name, blob).catch(e => onError(`Image export failed: ${e.message || e}`)); else onError("Image export failed. Try again."); });
    done(null);
  }, [request, done, onError, gl, scene, camera]);
  return null;
}
export default function FemFieldPreview({ jobId, controlsHost }: { jobId: string; controlsHost?: HTMLElement | null }) {
  const [theme] = useConsoleTheme();
  const background = lightThemePalette(theme)?.bg ?? (theme === "mri4all" ? "#040919" : "#0a0b0e");
  const [data, setData] = useState<FemFields | null>(null), [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const dsv = useFemDsv(data, jobId);
  const [attempt, setAttempt] = useState(0);
  const [field, setField] = useProjectState<"B" | "H" | "A">(`fem.field.${jobId}.field`, "B"), [component, setComponent] = useProjectState<Component>(`fem.field.${jobId}.component`, "magnitude");
  const [mode, setMode] = useProjectState<"surface" | "slice">(`fem.field.${jobId}.mode`, "surface"), [axis, setAxis] = useProjectState(`fem.field.${jobId}.axis`, 1), [position, setPosition] = useProjectState(`fem.field.${jobId}.position`, 50);
  const [showLines, setShowLines] = useProjectState(`fem.field.${jobId}.showLines`, false);
  const [lines, setLines] = useState<number[][]>([]), [lineError, setLineError] = useState("");
  const [linesBusy, setLinesBusy] = useState(false);
  useEffect(() => {
    if (!data || !showLines) return;
    setLinesBusy(true); setLineError(""); setLines([]);
    const worker = new Worker(new URL("./femStreamlines.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => { setLines(event.data.lines || []); setLineError(event.data.error || ""); setLinesBusy(false); worker.terminate(); };
    worker.onerror = () => { setLineError("Field lines could not be generated for this result."); setLinesBusy(false); worker.terminate(); };
    worker.postMessage(data);
    return () => worker.terminate();
  }, [data, showLines]);
  const [focus, setFocus] = useProjectState(`fem.field.${jobId}.focus`, true);
  const [air, setAir] = useProjectState(`fem.field.${jobId}.air`, false), [wireframe, setWireframe] = useProjectState(`fem.field.${jobId}.wireframe`, true), [camera, setCamera] = useState(0);
  const [manual, setManual] = useProjectState(`fem.field.${jobId}.manual`, false), [low, setLow] = useProjectState(`fem.field.${jobId}.low`, "0"), [high, setHigh] = useProjectState(`fem.field.${jobId}.high`, "1");
  const [probe, setProbe] = useState<Probe | null>(null), [capture, setCapture] = useState<CaptureRequest | null>(null);
  useEffect(() => {
    let cancelled = false; setData(null); setError("");
    fetchFemFields(jobId).then(d => { if (!cancelled) setData(d); }).catch(e => { if (!cancelled) setError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [jobId, attempt]);
  const box = useMemo(() => data ? bounds(data.points) : { lo: [0, 0, 0], hi: [1, 1, 1] }, [data]);
  const offset = box.lo[axis] + (box.hi[axis] - box.lo[axis]) * position / 100;
  const samples = useMemo(() => data ? fieldTriangles(data, field, mode, axis, offset, air) : [], [data, field, mode, axis, offset, air]);
  const stats = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const s of samples) { const v = scalar(s.vector, component); min = Math.min(min, v); max = Math.max(max, v); }
    return samples.length ? [min, max] : [0, 0];
  }, [samples, component]);
  const validRange = low.trim() !== "" && high.trim() !== "" && Number.isFinite(+low) && Number.isFinite(+high) && +high > +low;
  const range = useMemo(() => manual && validRange ? [+low, +high] : stats, [manual, validRange, low, high, stats]);
  useEffect(() => { setProbe(null); }, [samples]);
  if (error) return <div className="fem-preview-empty" role="alert"><strong>Could not open field results</strong><p>{error}</p><button onClick={() => setAttempt(a => a + 1)}>Retry</button><small>Your downloadable results remain available in the inspector.</small></div>;
  if (!data) return <div className="fem-preview-empty" role="status"><Activity size={26} />Loading computed fields…</div>;
  const unit = data.fields[field].unit;
  const controls = <div className="fem-field-inspector" aria-label="Field explorer">
    <h2>Field Display</h2>
    {exportError && <p role="alert">{exportError}</p>}
    <label className="fem-control-label">Field quantity<select aria-label="Field quantity" value={field} onChange={e => { setField(e.target.value as typeof field); setManual(false); }}><option value="B">B · Magnetic flux density</option><option value="H">H · Magnetic field strength</option><option value="A">A · Magnetic vector potential</option></select></label>
    <label className="fem-control-label">Component<select aria-label="Field component" value={component} onChange={e => { setComponent(e.target.value as Component); setManual(false); }}><option value="magnitude">Magnitude |{field}|</option>{["x", "y", "z"].map(v => <option key={v} value={v}>{v.toUpperCase()} component</option>)}</select></label>
    <section className="fem-control-section"><h3>View Mode</h3><div className="fem-segment" aria-label="Field display">{(["surface", "slice"] as const).map(v => <button type="button" key={v} aria-pressed={mode === v} onClick={() => { setMode(v); setAir(v === "slice"); }}>{v === "surface" ? "Surfaces" : "Cross-section"}</button>)}</div></section>
    <details className="fem-section-settings" open={mode === "slice"}><summary>Cross-section settings</summary>
      <label className="fem-control-label">Section plane<select aria-label="Section plane" value={axis} onChange={e => setAxis(+e.target.value)}><option value={0}>YZ · X normal</option><option value={1}>XZ · Y normal</option><option value={2}>XY · Z normal</option></select></label>
      <label className="fem-control-label">Position <output>{"XYZ"[axis]} = {(offset * 1000).toFixed(2)} mm</output><input aria-label="Section position" type="range" min="0" max="100" step="0.1" value={position} onChange={e => setPosition(+e.target.value)} /></label><button type="button" onClick={() => setPosition(50)}>Center section</button>
      {mode === "surface" && <small>Select Cross-section to display a field slice.</small>}
    </details>
    <section className="fem-control-section fem-display-options"><h3>Display Options</h3>
      <label><input type="checkbox" checked={air} onChange={e => setAir(e.target.checked)} /> Include air</label>
      <label><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} /> Mesh edges</label>
      <label><input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} disabled={mode === "slice"} /> B field lines</label>
      {showLines && linesBusy && <small role="status">Tracing magnetic flux lines…</small>}
      {showLines && lineError && <small role="alert">{lineError}</small>}
      {showLines && !linesBusy && !lineError && !lines.length && <small>No field lines to display in this solution.</small>}
      <label><input type="checkbox" checked={focus} onChange={e => setFocus(e.target.checked)} /> Frame solids</label>
      <button type="button" className="fem-fit-button" onClick={() => setCamera(v => v + 1)}><RotateCcw size={13} /> Fit view</button>
    </section>
    <details className="fem-section-settings"><summary>Color range <span>{unit}</span></summary>
      <label className="fem-check-label"><input type="checkbox" checked={manual} onChange={e => { setManual(e.target.checked); setLow(String(stats[0])); setHigh(String(stats[1] || 1)); }} /> Fixed color range</label>
      {manual ? <><div className="fem-range-inputs"><label>Minimum<input aria-label="Color minimum" type="number" step="any" value={low} onChange={e => setLow(e.target.value)} /></label><label>Maximum<input aria-label="Color maximum" type="number" step="any" value={high} onChange={e => setHigh(e.target.value)} /></label></div>{!validRange && <small role="alert">Enter a maximum greater than the minimum. Using auto scale.</small>}</> : <small>Auto scale · displayed geometry</small>}
    </details>
    {dsv.controls}
    <section className="fem-control-section fem-probe-readout"><h3><Crosshair size={14} />Probe {probe && <button type="button" aria-label="Clear point inspection" onClick={() => setProbe(null)}>×</button>}</h3>
      <div className="fem-probe-value"><span>{field}{component === "magnitude" ? " magnitude" : component.toUpperCase()}</span><output>{probe ? format(scalar(probe.vector, component)) : "—"} <small>{unit}</small></output></div>
      <dl>{["X", "Y", "Z"].map((label, i) => <div key={label}><dt>{label}</dt><dd>{probe ? (probe.point[i] * 1000).toFixed(3) : "—"} <small>mm</small></dd></div>)}</dl>
      {probe ? <small>{field} XYZ: {probe.vector.map(format).join(", ")} {unit}</small> : <p>Click a colored surface to inspect the field.</p>}
    </section>
    <section className="fem-control-section"><h3>Export</h3><button type="button" className="fem-export-image" onClick={() => { setExportError(""); setCapture({ name: `elmer-${jobId.slice(0, 8)}-${field}-${component}.png`, label: `${field} · ${component} (${unit}) · ${mode === "slice" ? `${"XYZ"[axis]} = ${(offset * 1000).toFixed(2)} mm` : "Body surfaces"} · ${data.source}${dsv.annotation}`, min: range[0], max: range[1] }); }}><Download size={15} />Export image<span>PNG</span></button><small>Nodal field interpolation · {data.source}</small></section>
  </div>;
  return <div className={`fem-field-view ${controlsHost ? "is-docked" : "has-local-controls"}`} aria-label="Magnetic field visualization">
    <div className="fem-field-canvas"><Canvas key={`${camera}:${mode}:${axis}:${air}`} gl={{ preserveDrawingBuffer: true }} camera={{ position: mode === "surface" ? [1, -1, .6] : axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1], up: mode === "surface" || axis !== 2 ? [0, 0, 1] : [0, 1, 0], near: .00001, far: 10000 }}>
      <color attach="background" args={[background]} />
      <Bounds margin={1.2}><FieldFraming data={data} focus={focus} slice={mode === "slice"} /><FieldSurface samples={samples} component={component} range={range} wireframe={wireframe} onProbe={setProbe} /></Bounds>
      {showLines && mode === "surface" && <FieldLines lines={lines} />}
      {dsv.overlay}
      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-left" margin={[52, 52]}><GizmoViewport axisColors={["#ec8da1", "#8ed9ba", "#a9abfa"]} labelColor="black" /></GizmoHelper>
      <Capture request={capture} done={setCapture} onError={setExportError} />
    </Canvas></div>
    {controlsHost ? createPortal(controls, controlsHost) : <aside className="fem-local-controls">{controls}</aside>}
    <div className="fem-field-legend" aria-label="Field color scale"><strong>{component === "magnitude" ? `|${field}|` : `${field}${component.toUpperCase()}`} <span>({unit})</span></strong><div className="fem-legend-body"><div className="fem-color-ramp" /><div className="fem-legend-ticks">{[1, .8, .6, .4, .2, 0].map(t => <span key={t}>{format(range[0] + t * (range[1] - range[0]))}</span>)}</div></div><small>{manual && validRange ? "Fixed" : "Auto"}</small></div>
    {!samples.length && <div className="fem-no-section" role="status">No geometry intersects this section. Move the plane or include air.</div>}
  </div>;
}
