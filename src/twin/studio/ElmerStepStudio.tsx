import { lazy, Suspense, useEffect, useState } from "react";
import { Upload, Play, Download, CheckCircle2, Layers3, Folder, Box, ChevronsLeft, ChevronsRight, LogOut, Settings2 } from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";
import { uploadFemStep, startFemJob, fetchFemJob, downloadFemJob, type FemUpload, type FemJob, type FemConfig } from "../mri/api";
import "./hardwareWorkspace.css";
import "./elmerStep.css";
import "./femDesk.css";
const FieldPreview = lazy(() => import("./FemFieldPreview"));
const MeshPreview = lazy(() => import("./FemMeshPreview"));
const StepPreview = lazy(() => import("./FemStepPreview"));
const previewFiles = new Map<string, File>();
const steps = ["Parts & roles", "Materials", "Geometry & mesh", "Physics", "Review & prepare"];

type Assignment = { kind: string; mu: number; br: number[] };
type Draft = { upload: FemUpload | null; assignments: Record<number, Assignment>; size: number; air: number; padding: number; transition: number; quadratic: boolean; changed: boolean; job: FemJob | null };
const initial: Draft = { upload: null, assignments: {}, size: 2, air: 12, padding: 60, transition: 20, quadratic: false, changed: false, job: null };
const active = (job: FemJob | null) => !!job && !["completed", "failed"].includes(job.status);
const labels: Record<FemJob["status"], string> = { queued: "Starting simulation", meshing: "Generating mesh", converting: "Preparing Elmer mesh", prepared: "Preparing solver", solving: "Solving magnetic field", completed: "Simulation complete", failed: "Simulation failed" };

export function ElmerStepStudio({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose?: () => void }) {
  const key = `adelpha-fem-step-${projectId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = sessionStorage.getItem(key); return saved ? { ...initial, ...JSON.parse(saved) } : initial; } catch { return initial; }
  });
  const [view, setView] = useState<"geometry" | "mesh" | "fields">(draft.job?.status === "completed" ? "fields" : "geometry");
  const [pane, setPane] = useState(draft.job?.status === "completed" ? 5 : 0);
  const [drawerOpen, setDrawerOpen] = useState(() => { try { return sessionStorage.getItem(`fem-drawer-${projectId}`) !== "closed"; } catch { return true; } });
  const [fieldHost, setFieldHost] = useState<HTMLDivElement | null>(null);
  const [meshHost, setMeshHost] = useState<HTMLDivElement | null>(null);
  function toggleDrawer() { setDrawerOpen(open => { try { sessionStorage.setItem(`fem-drawer-${projectId}`, open ? "closed" : "open"); } catch { /* Optional preference. */ } return !open; }); }
  function setup(index: number) { setPane(index); }
  const [previewFile, setPreviewFile] = useState<File | null>(() => previewFiles.get(projectId) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const running = active(draft.job);
  const locked = busy || running;
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* Storage may be disabled. */ } }, [draft, key]);
  useEffect(() => {
    if (!draft.job || !active(draft.job)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = draft.job.id;
    async function poll() {
      try {
        const job = await fetchFemJob(id);
        if (!stopped) { setDraft(old => ({ ...old, job })); setError(""); if (job.status === "completed") { setView("fields"); setPane(5); } }
      } catch (err) { if (!stopped) setError(`Could not refresh simulation status. Retrying… ${message(err)}`); }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [draft.job?.id, running]);
  function update(values: Partial<Draft>) { setDraft(old => ({ ...old, ...values, changed: !!old.job })); }
  function assign(index: number, patch: Partial<Assignment>) {
    update({ assignments: { ...draft.assignments, [index]: { ...draft.assignments[index], ...patch } } });
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(step|stp)$/i.test(file.name)) { setError("Choose a .step or .stp file."); return; }
    if (!file.size || file.size > 100 * 1024 * 1024) { setError("Choose a nonempty STEP file smaller than 100 MB."); return; }
    setBusy(true);
    // A rejected replacement must never leave an older solid model runnable
    // beneath the new file's surface preview.
    setDraft(old => ({ ...old, upload: null, assignments: {}, job: null, changed: false }));
    setView("geometry");
    setPreviewFile(file); previewFiles.set(projectId, file);
    try {
      const data = await uploadFemStep(file);
      setDraft(old => ({ ...old, upload: data, job: null, changed: false, assignments: Object.fromEntries(data.solids.map(s => [s.index, { kind: "", mu: 1, br: [0, 0, 0] }])) }));
      setPane(1);
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  const assigned = draft.upload?.solids.every(s => {
    const a = draft.assignments[s.index];
    return a?.kind && Number.isFinite(a.mu) && a.mu > 0 && a.br.every(Number.isFinite) && (a.kind !== "magnet" || a.br.some(v => v !== 0));
  });
  const meshValid = [draft.size, draft.air, draft.padding, draft.transition].every(v => Number.isFinite(v) && v > 0) && draft.air >= draft.size;
  async function run() {
    if (!draft.upload || !assigned || !meshValid || locked) return;
    setBusy(true); setError("");
    const config: FemConfig = {
      materials: Object.fromEntries(draft.upload.solids.map(s => [`solid_${s.index}`, { relative_permeability: draft.assignments[s.index].mu, remanence: draft.assignments[s.index].br }])),
      regions: draft.upload.solids.map(s => ({ name: `solid_${s.index}`, solids: [s.index], material: `solid_${s.index}` })),
      mesh: { size: draft.size / 1000, air_size: draft.air / 1000, air_padding: draft.padding / 1000, transition: draft.transition / 1000 },
      solver: { quadratic: draft.quadratic, tolerance: 1e-9, max_iterations: 5000 },
    };
    try { const job = await startFemJob(draft.upload.id, config); setDraft(old => ({ ...old, job, changed: false })); setPane(5); setView("geometry"); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function download() {
    if (!draft.job) return;
    setDownloading(true);
    try { await downloadFemJob(draft.job.id); } catch (err) { setError(message(err)); } finally { setDownloading(false); }
  }
  const uploadPanel = (<section className="elmer-card"><h3><Upload size={18} /> 1. Import STEP geometry</h3>
        <p>Upload a magnet or assembly, then assign a material to each solid.</p>
        <label className="elmer-upload">{busy ? "Processing…" : draft.upload ? "Replace STEP file" : "Choose STEP file"}
          <input aria-label="STEP file" type="file" accept=".step,.stp" disabled={locked} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        </label><small>.step or .stp · up to 100 MB · closed solids</small>
        {draft.upload && <div className="elmer-file"><Layers3 size={20} /><div><strong>{draft.upload.filename}</strong><span>{draft.upload.solids.length} solid{draft.upload.solids.length === 1 ? "" : "s"} · STEP units converted automatically</span></div></div>}
      </section>);
  const materialsPanel = (<section className="elmer-card"><h3>2. Assign magnetic properties</h3><p>Remanence components are in tesla along the assembly’s global X, Y and Z axes.</p>
        {!draft.upload ? <div className="elmer-empty">Your imported solids will appear here.</div> : <fieldset disabled={locked} className="elmer-solids">{draft.upload.solids.map(s => {
          const a = draft.assignments[s.index];
          return <article className="elmer-solid" key={s.index}>
            <div><strong>Solid {s.index}</strong><span title={s.label}>{s.label || "Unnamed solid"}</span><small>{[0, 1, 2].map(i => ((s.bounds_m[i + 3] - s.bounds_m[i]) * 1000).toFixed(2)).join(" × ")} mm</small></div>
            <label>Material<select aria-label={`Solid ${s.index} material`} value={a.kind} onChange={e => assign(s.index, { kind: e.target.value, mu: e.target.value === "magnet" ? 1.05 : e.target.value === "yoke" ? 100 : 1, br: e.target.value === "magnet" ? [0, 0, 1.2] : [0, 0, 0] })}>
              <option value="">Choose material…</option><option value="magnet">Permanent magnet</option><option value="yoke">Linear magnetic yoke</option><option value="passive">Nonmagnetic solid</option>
            </select></label>
            {a.kind && <div className="elmer-properties"><NumberInput label={`Solid ${s.index} relative permeability`} caption="Relative permeability μr" value={a.mu} onChange={mu => assign(s.index, { mu })} />
              {a.kind === "magnet" && ["X", "Y", "Z"].map((axis, index) => <NumberInput key={axis} label={`Solid ${s.index} remanence ${axis}`} caption={`Br ${axis} (T)`} value={a.br[index]} onChange={value => assign(s.index, { br: a.br.map((old, i) => i === index ? value : old) })} />)}</div>}
          </article>;
        })}</fieldset>}
      </section>);
  const meshPanel = (<section className="elmer-card"><h3>3. Mesh & solve</h3><fieldset disabled={locked}>
        <NumberInput label="Part mesh size (mm)" value={draft.size} onChange={size => update({ size })} />
        <NumberInput label="Air mesh size (mm)" value={draft.air} onChange={air => update({ air })} />
        <NumberInput label="Air padding (mm)" value={draft.padding} onChange={padding => update({ padding })} />
        <NumberInput label="Refinement transition (mm)" value={draft.transition} onChange={transition => update({ transition })} />
        <label className="elmer-check"><input type="checkbox" checked={draft.quadratic} onChange={e => update({ quadratic: e.target.checked })} /> Quadratic field approximation</label>
      </fieldset><p>Use smaller elements around small magnets and gaps. Check accuracy by refining the mesh and increasing the air padding.</p>
        {!meshValid && <p role="alert">Sizes must be positive. Air mesh size must be at least the part mesh size.</p>}
        {draft.upload && !assigned && <p>Assign every solid a material. Magnets need a nonzero remanence vector; permeability must be positive.</p>}

      </section>);
  const resultsPanel = (<section className="elmer-card" aria-label="Simulation results"><h3>Results</h3>
        <div role="status" className="elmer-status">{draft.job?.status === "completed" && <CheckCircle2 size={18} />}{draft.job ? labels[draft.job.status] : "Ready when you are"}</div>
        {running && <p>You can leave this screen and return while the simulation runs.</p>}
        {draft.changed && <p>Settings have changed since the last run. Run again to update results.</p>}
        {draft.job?.mesh && <dl><dt>Mesh nodes</dt><dd>{draft.job.mesh.nodes.toLocaleString()}</dd><dt>Tetrahedra</dt><dd>{draft.job.mesh.tetrahedra.toLocaleString()}</dd><dt>Minimum mesh quality</dt><dd>{draft.job.mesh.quality.minimum.toFixed(3)}</dd></dl>}
        {draft.job?.status === "completed" && <p>Magnetic flux density B, field strength H and vector potential A are ready. Select Results to explore field colors, cross-sections and point values directly in the viewport.</p>}
        {draft.job?.error && <p role="alert">{draft.job.error}</p>}
        {draft.job && !running && <button type="button" disabled={downloading} onClick={() => void download()}><Download size={16} />{downloading ? "Downloading…" : draft.job.status === "completed" ? "Download results & logs" : "Download diagnostic logs"}</button>}
      </section>);
  const physicsPanel = <div className="elmer-card"><h3>Magnetostatics · Elmer</h3><p>Linear, static magnetic fields with a surrounding air domain. Remanence is specified in the assembly’s global axes.</p><p>Yoke saturation, hysteresis and time-varying currents are not included.</p></div>;
  const reviewPanel = <div className="elmer-card"><h3>Review & prepare</h3><p>{draft.upload?.filename || "Choose a STEP file first."}</p><p>{draft.upload?.solids.length ?? 0} solids · {assigned ? "Materials assigned" : "Assign every solid a material"}</p><p>Part mesh: {draft.size} mm · Air padding: {draft.padding} mm</p><p>{meshValid ? "Mesh settings ready." : "Correct the mesh settings before running."}</p><p>Elmer will generate the mesh, check element quality, and solve for B, H and A.</p></div>;
  const showingFields = view === "fields" && draft.job?.status === "completed";
  const showingMesh = view === "mesh" && !!draft.job?.mesh_available;
  return <div className={`studio-study hardware-workspace is-preparing fem-step-workspace fem-desk ${drawerOpen ? "" : "is-drawer-collapsed"}`} aria-label="FEM STEP simulation">
    <aside className="fem-project-drawer" aria-label="Project drawer">
      <div className="fem-drawer-heading">{drawerOpen && <><Folder size={17} /><span>Project</span></>}
        <button type="button" className="fem-icon-button" aria-label={drawerOpen ? "Collapse project drawer" : "Expand project drawer"} aria-expanded={drawerOpen} aria-controls="fem-project-content" onClick={toggleDrawer}>{drawerOpen ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}</button>
      </div>
      {drawerOpen ? <><div id="fem-project-content" className="fem-drawer-content">
        <button className="fem-source-row" type="button" onClick={() => setup(0)}><Box size={18} /><span>{draft.upload?.filename || "Import STEP file"}</span></button>
        <details className="fem-tree-section" open><summary><Layers3 size={16} />Assembly {draft.upload && <small>{draft.upload.solids.length}</small>}</summary>
          {draft.upload ? <ul>{draft.upload.solids.map(solid => <li key={solid.index}><button type="button" onClick={() => setup(1)}><Box size={16} /><span>Solid {solid.index}<small>{draft.assignments[solid.index]?.kind === "magnet" ? "Permanent magnet" : draft.assignments[solid.index]?.kind === "yoke" ? "Magnetic yoke" : draft.assignments[solid.index]?.kind === "passive" ? "Nonmagnetic solid" : "Needs material"}</small></span></button></li>)}</ul> : <p className="study-muted">Import a STEP assembly to begin.</p>}
        </details>
        <details className="fem-tree-section" open={!draft.job}><summary><Settings2 size={16} />Setup</summary><nav aria-label="Study preparation">{steps.map((label, index) => <button className="fem-setup-link" type="button" key={label} aria-current={pane === index ? "step" : undefined} onClick={() => setup(index)}>{label}</button>)}</nav></details>
        <button type="button" className="fem-tree-link" onClick={() => { setup(2); if (draft.job?.mesh_available) setView("mesh"); }}><Layers3 size={16} />Mesh</button>
      </div><div className="fem-study-identity"><small>CURRENT STUDY</small><h2 title={projectName}>{projectName}</h2><span>FEM · Elmer</span>{onClose && <button type="button" className="fem-close-project" disabled={busy} onClick={onClose}><LogOut size={13} />Close project</button>}</div></> : <div className="fem-drawer-rail"><button className="fem-icon-button" aria-label="Open project setup" title="Project setup" onClick={() => { toggleDrawer(); setup(0); }}><Folder size={18} /></button><button className="fem-icon-button" aria-label="Open materials" title="Materials" onClick={() => setup(1)}><Box size={18} /></button><span title={projectName} className="fem-rail-study">{projectName}</span></div>}
    </aside>
    <div className="studio-study-viewport fem-desk-viewport">
      <nav className="fem-view-tabs" aria-label="Simulation view">
        <button type="button" aria-label="CAD view" aria-pressed={view === "geometry"} onClick={() => { setView("geometry"); if (pane === 5) setPane(0); }}>CAD</button>
        <button type="button" aria-label="Mesh view" disabled={!draft.job?.mesh_available} aria-pressed={view === "mesh"} onClick={() => { setView("mesh"); setPane(5); }}>Mesh</button>
        <button type="button" aria-pressed={view === "fields"} onClick={() => { setPane(5); if (draft.job?.status === "completed") setView("fields"); }}>Results</button>
      </nav>
      {draft.changed && draft.job && <div className="fem-stale-notice">Showing the last run · setup has changed</div>}
      <div className="fem-desk-stage"><ErrorBoundary resetKey={`${view}:${draft.job?.id}:${previewFile?.name}:${previewFile?.lastModified}`} fallback={<div className="fem-preview-empty" role="status">Preview unavailable. You can still import your STEP file and run the simulation.</div>}><Suspense fallback={<div className="fem-preview-empty">Loading preview…</div>}>{showingFields ? <FieldPreview key={draft.job!.id} jobId={draft.job!.id} controlsHost={fieldHost} /> : showingMesh ? <MeshPreview jobId={draft.job!.id} controlsHost={meshHost} /> : <StepPreview file={previewFile} />}</Suspense></ErrorBoundary></div>
      {view !== "fields" && <span className="fem-viewport-hint">{showingMesh ? "Volume mesh · surface triangles" : "STEP geometry · surface preview"}</span>}
    </div>
    <aside className="fem-desk-inspector" aria-label="Inspector"><div className="study-setup-content elmer-step-controls">
      {!(showingFields && pane === 5) && <h2>{showingMesh && pane === 5 ? "Mesh inspection" : steps[pane] || "Results"}</h2>}
      <div ref={setFieldHost} hidden={!showingFields || pane !== 5} />
      <div ref={setMeshHost} hidden={!showingMesh || pane !== 5} />
      {!(showingFields && pane === 5) && <>{pane === 0 ? uploadPanel : pane === 1 ? materialsPanel : pane === 2 ? meshPanel : pane === 3 ? physicsPanel : pane === 4 ? reviewPanel : resultsPanel}</>}
      {showingFields && pane === 5 && <section className="fem-result-download"><h3>Results</h3><button type="button" disabled={downloading} onClick={() => void download()}><Download size={15} />{downloading ? "Downloading…" : "Download results & logs"}<small aria-hidden="true">ZIP</small></button></section>}
      {error && <div className="elmer-error" role="alert">{error}</div>}
    </div><footer className="study-setup-footer">
      {pane < 4 && <button className="studio-ghost" type="button" onClick={() => setPane(pane + 1)}>Continue to {steps[pane + 1].toLowerCase()}</button>}
      <button className="mr0-run" type="button" disabled={locked || !assigned || !meshValid} onClick={() => void run()}><Play size={14} />{running ? "Simulation running…" : "Run simulation"}</button>
    </footer></aside>
    <footer className="study-statusbar fem-desk-status"><span><span className={`fem-status-dot ${draft.job?.status === "completed" ? "is-complete" : ""}`} />{draft.job ? labels[draft.job.status] : "Prepare your STEP study"}</span><span>{draft.job?.mesh && <><span>Elements: {draft.job.mesh.tetrahedra.toLocaleString()}</span><span>Nodes: {draft.job.mesh.nodes.toLocaleString()}</span></>}<span>Units: mm · {draft.upload?.solids.length ?? 0} solids</span></span></footer>
  </div>;
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function NumberInput({ label, caption, value, onChange }: { label: string; caption?: string; value: number; onChange: (value: number) => void }) {
  return <label className="elmer-number">{caption || label}<input type="number" step="any" aria-label={label} value={Number.isFinite(value) ? value : ""} onChange={e => onChange(e.target.value === "" ? NaN : Number(e.target.value))} /></label>;
}
