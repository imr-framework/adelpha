import { Eye, EyeOff, FlaskConical } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { simulateMagnetStudy, type MagnetStudyResult } from "../mri/api";
import {
  listPartsForScanner,
  resolvePartBinding,
  usePartInspectorStore,
} from "../partInspectorStore";
import { useEngineeringStore } from "../engineeringStore";
import { useScannerModel } from "../scannerModel";
import { useAssemblyGeometryStore } from "./assemblyGeometryStore";
import { livePhysicalParts } from "./assemblyModel";
import { ENGINEERING_ROLES, roleLabel, type EngineeringRole } from "./engineering";
import {
  includedParts,
  physicalModelKey,
  validateForFem,
  validateForMagnet,
  type GeometryIssue,
  type PhysicalPart,
} from "./geometryPrep";
import {
  exampleHalbachParts,
  makeSnapshot,
  newRunId,
  snapshotRequest,
  useHardwareStudyStore,
  type FieldQuantity,
  type HardwareStudyKind,
  type HardwareStudyRun,
  type StudySection,
  type SetupStep,
} from "./hardwareStudyStore";

import { preparationKey, settingsIssues } from "./studyPreparation";
import "./hardwareWorkspace.css";

const NO_IDS: string[] = [];
const NO_INSTANCES: import("./geometryPrep").AssemblyInstance[] = [];

const SECTIONS: { id: StudySection; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "geometry", label: "Geometry & mesh" },
  { id: "physics", label: "Physics" },
  { id: "results", label: "Results" },
  { id: "diagnostics", label: "Diagnostics" },
];

const SETUP_STEPS: { id: SetupStep; label: string }[] = [
  { id: "parts", label: "Parts & roles" },
  { id: "materials", label: "Materials" },
  { id: "geometry", label: "Geometry & mesh" },
  { id: "physics", label: "Physics" },
  { id: "review", label: "Review & prepare" },
];

const QUANTITIES: { id: FieldQuantity; label: string }[] = [
  { id: "magnitude", label: "|B|" },
  { id: "bx", label: "Bx" },
  { id: "by", label: "By" },
  { id: "bz", label: "Bz" },
  { id: "delta", label: "ΔB" },
];

export function HardwareStudyStudio({
  projectId,
  projectName,
  study,
  viewport,
  onClose,
}: {
  viewport?: ReactNode;
  onClose?: () => void;
  projectId: string;
  projectName: string;
  study: HardwareStudyKind;
}) {
  const [scannerId] = useScannerModel();
  const modelLabel = useEngineeringStore((s) => s.modelLabel);
  const [search, setSearch] = useState("");
  const catalog = usePartInspectorStore((s) => s.catalog);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const hidden = usePartInspectorStore((s) => s.hidden[scannerId] ?? NO_IDS);
  const selection = usePartInspectorStore((s) => s.selection);
  const instances = useAssemblyGeometryStore((s) => s.instances[scannerId] ?? NO_INSTANCES);
  const setPartsInSimulation = usePartInspectorStore((s) => s.setPartsInSimulation);
  const hidePart = usePartInspectorStore((s) => s.hidePart);
  const showPart = usePartInspectorStore((s) => s.showPart);
  const selectPart = usePartInspectorStore((s) => s.selectPart);
  const patchEngineering = usePartInspectorStore((s) => s.patchEngineering);
  const projects = useHardwareStudyStore((s) => s.projects);
  const record = useMemo(
    () => useHardwareStudyStore.getState().record(projectId, study),
    [projectId, projects[projectId], study],
  );
  const parts = useMemo(
    () => livePhysicalParts(scannerId),
    [bindings, catalog, hidden, instances, scannerId, selection],
  );
  const included = useMemo(() => includedParts(parts), [parts]);
  const modelKey = useMemo(() => physicalModelKey(parts), [parts]);
  const localIssues = useMemo(
    () => (study === "fem" ? validateForFem(parts, record.settings.mesh.approximation) : validateForMagnet(parts)),
    [parts, record.settings.mesh.approximation, study],
  );
  const example = record.exampleId === "example-halbach-8";
  const issues = [...(example ? [] : localIssues), ...settingsIssues(record.settings, study)];
  const blocking = issues.filter((issue) => issue.severity === "error");
  const active = record.runs.find((run) => run.id === record.activeRunId) ?? record.runs[0] ?? null;
  const running = record.runs.some((run) => run.status === "running");
  const ready = blocking.length === 0;
  const currentKey = preparationKey(parts, record.settings, record.exampleId);
  const prepared = record.preparedKey === currentKey && ready;
  const setup = record.editingSetup || !record.preparedKey;
  const stepIndex = SETUP_STEPS.findIndex((step) => step.id === record.setupStep);
  const step = SETUP_STEPS[stepIndex];
  const setStep = (setupStep: SetupStep) => useHardwareStudyStore.getState().setPreparation(projectId, study, { setupStep });
  function prepare() {
    if (!ready || running) return;
    useHardwareStudyStore.getState().setPreparation(projectId, study, { preparedKey: currentKey, editingSetup: false });
    useHardwareStudyStore.getState().setSection(projectId, study, "setup");
  }
  const abort = useRef<AbortController | null>(null);

  const settingsKey = JSON.stringify(record.settings);
  useEffect(() => {
    useHardwareStudyStore.getState().markStale(projectId, study, example ? physicalModelKey(exampleHalbachParts()) : modelKey);
  }, [modelKey, projectId, settingsKey, study, example, active?.status, active?.id]);

  async function run() {
    if (running || !prepared || setup) return;
    const approximations =
      study === "fem"
        ? [
            record.settings.mesh.approximation === "oriented_box"
              ? "Parameterized oriented-box approximation of included parts."
              : "Imported closed surfaces prepared as FEM regions.",
          ]
        : [
            record.settings.magnetModel === "dipole"
              ? "Point-dipole superposition of included magnet volumes."
              : "Uniform magnetization inside each oriented bounding box.",
          ];
    const snapshot = makeSnapshot(study, example ? exampleHalbachParts() : parts, record.settings, approximations, {});
    if (example) snapshot.approximations.push("Labeled example: 8 cuboid Halbach magnets, Br = 1.2 T.");
    const runId = newRunId();
    const pending: HardwareStudyRun = {
      id: runId,
      study,
      status: "running",
      stale: false,
      createdAt: Date.now(),
      error: null,
      snapshot,
      result: null,
    };
    useHardwareStudyStore.getState().addRun(projectId, study, pending);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = (await simulateMagnetStudy({
        ...snapshotRequest(snapshot),
        example_id: example ? "example-halbach-8" : null,
        study,
      })) as MagnetStudyResult;
      if (controller.signal.aborted) return;
      useHardwareStudyStore.getState().updateRun(projectId, study, runId, {
        status: result.completed ? "completed" : "failed",
        error: result.completed ? null : result.limitation || result.summary,
        result: {
          ok: result.ok,
          completed: result.completed,
          title: result.title,
          summary: result.summary,
          solver: result.solver,
          approximations: result.approximations,
          diagnostics: result.diagnostics,
          limitation: result.limitation,
          field: result.field,
          slice: result.slice,
          vectors: result.vectors,
          probes: result.probes,
          homogeneity: result.homogeneity ? {
            ...result.homogeneity,
            roi: {
              centerM: [result.homogeneity.roi.centerM[0], result.homogeneity.roi.centerM[1], result.homogeneity.roi.centerM[2]],
              sizeM: [result.homogeneity.roi.sizeM[0], result.homogeneity.roi.sizeM[1], result.homogeneity.roi.sizeM[2]],
              samples: [result.homogeneity.roi.samples[0], result.homogeneity.roi.samples[1], result.homogeneity.roi.samples[2]],
            },
          } : null,
          mesh: result.mesh,
          elapsed_s: result.elapsed_s,
        },
      });
      useHardwareStudyStore.getState().setSection(projectId, study, result.completed ? "results" : "diagnostics");
    } catch (err) {
      if (controller.signal.aborted) return;
      useHardwareStudyStore.getState().updateRun(projectId, study, runId, {
        status: "failed",
        error: err instanceof Error ? err.message : "The study failed.",
      });
      useHardwareStudyStore.getState().setSection(projectId, study, "diagnostics");
    }
  }

  function cancel() {
    abort.current?.abort();
    const pending = record.runs.find((run) => run.status === "running");
    if (pending) {
      useHardwareStudyStore.getState().updateRun(projectId, study, pending.id, {
        status: "failed",
        error: "Cancelled.",
      });
    }
  }

  const disabledReason = !ready
    ? blocking[0]?.message ?? "Missing inputs."
    : running
      ? "A run is already in progress."
      : "";

  const tree = <div className="study-assembly-browser">
        <header className="studio-study-tree-head">
          <h3>Assembly</h3>
          <p>
            {included.length} of {parts.length} in simulation
          </p>
        </header>
        <input className="study-search" type="search" aria-label="Search parts" placeholder="Search parts…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <ul>
          {parts.length === 0 ? (
            <li className="studio-study-empty">Load a GLB assembly, then add parts to simulation.</li>
          ) : (
            listPartsForScanner(scannerId, catalog, bindings).filter((part) => resolvePartBinding({ ...part, scannerId }, bindings).displayName.toLowerCase().includes(search.toLowerCase())).map((part) => {
              const binding = resolvePartBinding({ ...part, scannerId }, bindings);
              const family = parts.filter((row) => row.partId === part.partId);
              const selected = selection.some((row) => row.scannerId === scannerId && row.partId === part.partId);
              return (
                <li key={part.partId}>
                  <button
                    type="button"
                    className={`studio-tree-row${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    title={binding.displayName}
                    onClick={() => selectPart({ ...part, scannerId })}
                  >
                    <span className="studio-tree-name">{binding.displayName}</span>
                    <span className="studio-tree-meta">
                      {roleLabel(binding.engineering.role)}
                      {family.length > 1 ? ` · ${family.length}` : ""}
                    </span>
                  </button>
                  <div className="studio-tree-actions">
                    <button
                      type="button"
                      aria-pressed={!hidden.includes(part.partId)}
                      title={hidden.includes(part.partId) ? "Show in viewport" : "Hide in viewport"}
                      onClick={() =>
                        hidden.includes(part.partId)
                          ? showPart(scannerId, part.partId)
                          : hidePart(scannerId, part.partId)
                      }
                    >
                      {hidden.includes(part.partId) ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      aria-pressed={binding.inSimulation}
                      title={binding.inSimulation ? "Remove from simulation" : "Add to simulation"}
                      onClick={() => setPartsInSimulation(scannerId, [part.partId], !binding.inSimulation)}
                    >
                      <FlaskConical size={13} />
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
  </div>;
  const inspector = <PartOrStudyInspector study={study} projectId={projectId} scannerId={scannerId} parts={parts} patchEngineering={patchEngineering} />;
  const sectionPanel = (section: StudySection) => <StudySectionPanel study={study} section={section} parts={parts} included={included} issues={issues} record={record} active={active} example={example} projectId={projectId} compact={setup && step.id === "parts"} />;

  return (
    <div className={`studio-study hardware-workspace ${setup ? "is-preparing" : "is-prepared"}`} aria-label={study === "fem" ? "Elmer FEM" : "Magnet field"}>
      <aside className="studio-study-tree" aria-label={setup ? "Study setup" : "Assembly tree"}>
        {setup ? <>
          <h2>Study setup</h2><p className="study-muted">Prepare your study.</p>
          <nav className="study-steps" aria-label="Study preparation">
            {SETUP_STEPS.map((item, index) => <button key={item.id} type="button" aria-current={item.id === step.id ? "step" : undefined} onClick={() => setStep(item.id)}>
              <span className="study-step-number">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.label}<small>{item.id === step.id ? "In progress" : ""}</small></span>
            </button>)}
          </nav>
          <details className="study-browser-disclosure" open><summary>Assembly browser</summary>{tree}</details>
        </> : tree}
      </aside>
      <header className="studio-study-bar">
        <div className="study-project-heading"><span className="study-muted">{modelLabel}</span><span aria-hidden="true"> / </span><h2>{projectName}</h2></div>
        <div className="study-header-actions">
          {!setup ? <>
            <span className="study-badge">{prepared ? "Prepared" : "Review required"}</span>
            <button type="button" className="studio-ghost" disabled={running} onClick={() => useHardwareStudyStore.getState().setPreparation(projectId, study, { editingSetup: true, setupStep: prepared ? "parts" : "review" })}>Edit setup</button>
            <button type="button" className="mr0-run" onClick={run} disabled={!prepared || running} title={!prepared ? "Prepare the current settings before running." : disabledReason}>{running ? "Running…" : "Run study"}</button>
            {running ? <button type="button" className="studio-ghost" onClick={cancel}>Cancel</button> : null}
          </> : <span className="study-badge">Draft · saved locally</span>}
          {onClose ? <details className="study-project-menu"><summary>Project ▾</summary><button type="button" onClick={onClose}>Close project</button></details> : null}
        </div>
        {!setup ? <div className="studio-study-tabs" role="tablist" aria-label="Study sections">
          {SECTIONS.map((section) => <button key={section.id} type="button" role="tab" aria-selected={record.section === section.id} onClick={() => useHardwareStudyStore.getState().setSection(projectId, study, section.id)}>{section.id === "setup" ? "Overview" : section.label}</button>)}
        </div> : null}
      </header>
      <div className="studio-study-viewport">
        <div className="study-viewport-caption">{setup ? "Assembly preview" : prepared ? "Setup complete · Ready to run" : "Study inputs changed · Review setup before running"}{example ? " · Labeled Halbach example" : ""}</div>
        {viewport}
      </div>
      <aside className="studio-study-inspector" aria-label="Inspector">
        {setup ? <>
          <div className="study-setup-content">
            <h2>{step.label}</h2>
            {step.id === "parts" || step.id === "materials" ? <>
              <p className="study-muted">{step.id === "parts" ? "Select a part to assign its role and study inclusion." : "Set the physical properties required by each part’s role."}</p>
              {inspector}
              {step.id === "materials" ? <p className="study-muted">Permanent magnets require remanence and direction. FEM yokes require permeability; conductors require conductivity.</p> : null}
            </> : null}
            {step.id === "parts" || step.id === "review" ? sectionPanel("setup") : null}
            {step.id === "geometry" || step.id === "physics" ? sectionPanel(step.id) : null}
          </div>
          <footer className="study-setup-footer">
            {step.id === "review" && !ready ? <p role="status">Resolve {blocking.length} requirement{blocking.length === 1 ? "" : "s"} before preparing.</p> : null}
            <button type="button" className="mr0-run" disabled={step.id === "review" && (!ready || running)} onClick={() => step.id === "review" ? prepare() : setStep(SETUP_STEPS[stepIndex + 1].id)}>{step.id === "review" ? "Prepare study" : `Continue to ${SETUP_STEPS[stepIndex + 1].label.toLowerCase()}`}</button>
            {stepIndex > 0 ? <button type="button" className="studio-ghost" onClick={() => setStep(SETUP_STEPS[stepIndex - 1].id)}>Back</button> : null}
            <small className="study-muted">Changes saved automatically</small>
          </footer>
        </> : inspector}
      </aside>
      {!setup ? <div className="study-bottom-panel">
        {record.section === "setup" ? <details><summary>Contributing parts · {example ? 8 : included.length} included</summary>{sectionPanel("setup")}</details> : sectionPanel(record.section)}
      </div> : null}
      <footer className="study-statusbar"><span>{setup ? `Step ${stepIndex + 1} of 5 · ${step.label}` : active ? `Last run: ${active.status}${active.stale ? " · stale" : ""}` : "No runs yet"}</span><span>Units: mm · {example ? "Example study" : `${included.length} of ${parts.length} in simulation`}</span></footer>
    </div>
  );
}

function StudySectionPanel({
  study,
  section,
  parts,
  included,
  issues,
  record,
  active,
  example,
  projectId,
  compact = false,
}: {
  compact?: boolean;
  study: HardwareStudyKind;
  section: StudySection;
  parts: PhysicalPart[];
  included: PhysicalPart[];
  issues: GeometryIssue[];
  record: ReturnType<typeof useHardwareStudyStore.getState>["record"] extends (...args: infer _A) => infer R ? R : never;
  active: HardwareStudyRun | null;
  example: boolean;
  projectId: string;
}) {
  const settings = record.settings;
  if (section === "setup") {
    return (
      <div className="studio-study-panel">
        <details className="study-review-details" open={!compact}>
        <summary>Contributing parts · {example ? 8 : included.length} included</summary>
        {example ? <p>Using the labeled 8-cube Halbach example. Assembly membership is not required for this example.</p> : null}
        {included.length === 0 && !example ? (
          <p>Nothing is added to simulation. Hiding a part does not add or remove it.</p>
        ) : (
          <div className="study-parts-table-scroll">
            <table className="study-parts-table">
              <thead><tr><th>Part</th><th>Role</th><th>Size (mm)</th></tr></thead>
              <tbody>{(example ? exampleHalbachParts() : included).map((part) => (
                <tr key={part.instanceId}>
                  <td>{part.cadName}</td>
                  <td>{roleLabel(part.engineering.role)}</td>
                  <td>{part.sizeM.map((value) => (value * 1e3).toFixed(1)).join(" × ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        </details>
        <h3>Missing requirements</h3>
        {issues.length === 0 ? (
          <p>{example ? "Example assets include remanence and magnetization." : "Ready to run."}</p>
        ) : (
          <ul className="studio-study-issues">
            {issues.map((issue) => (
              <li key={`${issue.instanceId}-${issue.code}`}>
                <strong>{issue.message}</strong>
                <span>{issue.correction}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="studio-param-check">
          <input
            type="checkbox"
            checked={example}
            onChange={(event) => {
              const on = event.target.checked;
              useHardwareStudyStore.getState().setExample(projectId, study, on ? "example-halbach-8" : null);
              if (on) {
                useHardwareStudyStore.getState().setSettings(projectId, study, {
                  roi: { centerM: [0, 0, 0], sizeM: [0.04, 0.04, 0.04], samples: [17, 17, 17] },
                });
              }
            }}
          />
          <span>Use labeled example: 8-cube Halbach ring (20 mm cubes, 80 mm radius, Br = 1.2 T)</span>
        </label>
      </div>
    );
  }
  if (section === "geometry") {
    return (
      <div className="studio-study-panel">
        <h3>{study === "fem" ? "Volume mesh" : "Physical geometry"}</h3>
        <p>
          Source geometry stays on the imported GLB. The solver receives derived instances with world transforms applied
          once.
        </p>
        {study === "fem" ? (
          <>
            <label className="studio-param">
              <span>Approximation</span>
              <select
                value={settings.mesh.approximation}
                onChange={(event) =>
                  useHardwareStudyStore.getState().setSettings(projectId, study, {
                    mesh: { ...settings.mesh, approximation: event.target.value as "imported_mesh" | "oriented_box" },
                  })
                }
              >
                <option value="oriented_box">Oriented bounding box (explicit)</option>
                <option value="imported_mesh">Imported closed mesh</option>
              </select>
            </label>
            <NumberTriple
              label="Mesh grid"
              values={settings.mesh.grid}
              onChange={(grid) =>
                useHardwareStudyStore.getState().setSettings(projectId, study, { mesh: { ...settings.mesh, grid } })
              }
            />
            <label className="studio-param">
              <span>Air padding (mm)</span>
              <input
                type="number"
                min={5}
                max={200}
                value={Math.round(settings.mesh.airPaddingM * 1e3)}
                onChange={(event) =>
                  useHardwareStudyStore.getState().setSettings(projectId, study, {
                    mesh: { ...settings.mesh, airPaddingM: Number(event.target.value) / 1e3 },
                  })
                }
              />
            </label>
          </>
        ) : (
          <p>Magnet field uses oriented boxes of the included magnets. Visual GLB materials do not set remanence.</p>
        )}
        <ul className="studio-study-list">
          {included.map((part) => (
            <li key={part.instanceId}>
              <strong>{part.instanceId}</strong>
              <span>
                {part.triangleCount} faces · {part.closed == null ? "topology unknown" : part.closed ? "closed" : "open"} · rev{" "}
                {part.geometryRevision.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (section === "physics") {
    return (
      <div className="studio-study-panel">
        <h3>Study physics</h3>
        {study === "magnet" ? (
          <label className="studio-param">
            <span>Magnet model</span>
            <select
              value={settings.magnetModel}
              onChange={(event) =>
                useHardwareStudyStore.getState().setSettings(projectId, study, {
                  magnetModel: event.target.value as "dipole" | "cuboid",
                })
              }
            >
              <option value="cuboid">Cuboid superposition</option>
              <option value="dipole">Dipole superposition</option>
            </select>
          </label>
        ) : (
          <p>Elmer magnetostatics with magnetization body forces. Soft-magnetic yokes need μr.</p>
        )}
        <NumberTriple
          label="ROI center (mm)"
          values={settings.roi.centerM.map((value) => value * 1e3) as [number, number, number]}
          onChange={(values) =>
            useHardwareStudyStore.getState().setSettings(projectId, study, {
              roi: { ...settings.roi, centerM: values.map((value) => value / 1e3) as [number, number, number] },
            })
          }
        />
        <NumberTriple
          label="ROI size (mm)"
          values={settings.roi.sizeM.map((value) => value * 1e3) as [number, number, number]}
          onChange={(values) =>
            useHardwareStudyStore.getState().setSettings(projectId, study, {
              roi: { ...settings.roi, sizeM: values.map((value) => value / 1e3) as [number, number, number] },
            })
          }
        />
        <NumberTriple
          label="Samples"
          values={settings.roi.samples}
          onChange={(samples) =>
            useHardwareStudyStore.getState().setSettings(projectId, study, { roi: { ...settings.roi, samples } })
          }
        />
        <label className="studio-param">
          <span>Reference field (mT)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.referenceFieldT == null ? "" : settings.referenceFieldT * 1e3}
            placeholder="Mean |B|"
            onChange={(event) => {
              const next = Number(event.target.value);
              useHardwareStudyStore.getState().setSettings(projectId, study, {
                referenceFieldT: Number.isFinite(next) && event.target.value !== "" ? next / 1e3 : null,
              });
            }}
          />
        </label>
        <p className="studio-study-note">{parts.filter((part) => !part.visible && part.inSimulation).length} hidden parts stay in the physical model.</p>
      </div>
    );
  }
  if (section === "results") {
    return <ResultsPanel study={study} record={record} active={active} projectId={projectId} />;
  }
  return (
    <div className="studio-study-panel">
      <h3>Diagnostics</h3>
      <RunStatusLine run={active} />
      {active?.error ? <p className="mr0-error">{active.error}</p> : null}
      {active?.result?.limitation ? <p>{active.result.limitation}</p> : null}
      <ul className="studio-study-issues">
        {(active?.result?.diagnostics ?? []).map((line) => (
          <li key={line}>{line}</li>
        ))}
        {issues.map((issue) => (
          <li key={`${issue.instanceId}-${issue.code}`}>
            <strong>{issue.message}</strong>
            <span>{issue.correction}</span>
          </li>
        ))}
      </ul>
      {active?.snapshot ? (
        <p className="studio-study-note">
          Snapshot {active.snapshot.includedInstanceIds.length} instances · {active.snapshot.approximations.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function ResultsPanel({
  study,
  record,
  active,
  projectId,
}: {
  study: HardwareStudyKind;
  record: ReturnType<typeof useHardwareStudyStore.getState>["record"] extends (...args: infer _A) => infer R ? R : never;
  active: HardwareStudyRun | null;
  projectId: string;
}) {
  const result = active?.result;
  return (
    <div className="studio-study-panel">
      <div className="studio-study-runs">
        {record.runs.length === 0 ? <p>No runs yet.</p> : null}
        {record.runs.map((run) => (
          <button
            key={run.id}
            type="button"
            aria-pressed={run.id === active?.id}
            onClick={() => useHardwareStudyStore.getState().selectRun(projectId, study, run.id)}
          >
            {new Date(run.createdAt).toLocaleTimeString()} · {run.status}
            {run.stale ? " · stale" : ""}
          </button>
        ))}
      </div>
      <RunStatusLine run={active} />
      {result?.completed && result.field ? (
        <>
          <div className="studio-study-tabs" role="group" aria-label="Field quantity">
            {QUANTITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={record.quantity === item.id}
                onClick={() => useHardwareStudyStore.getState().setQuantity(projectId, study, item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {result.slice ? (
            <SlicePlot slice={result.slice} quantity={record.quantity} field={result.field} />
          ) : null}
          {result.homogeneity ? (
            <dl className="studio-study-metrics">
              <div>
                <dt>Mean |B|</dt>
                <dd>{(result.homogeneity.meanT * 1e3).toFixed(3)} mT</dd>
              </div>
              <div>
                <dt>Peak-to-peak</dt>
                <dd>
                  {(result.homogeneity.peakToPeakT * 1e3).toFixed(3)} mT · {Math.round(result.homogeneity.ppmPeakToPeak)} ppm
                </dd>
              </div>
              <div>
                <dt>RMS</dt>
                <dd>
                  {(result.homogeneity.stdT * 1e3).toFixed(3)} mT · {Math.round(result.homogeneity.ppmRms)} ppm
                </dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{(result.homogeneity.referenceT * 1e3).toFixed(3)} mT</dd>
              </div>
            </dl>
          ) : null}
          {result.probes[0] ? (
            <p>
              Probe at [{result.probes[0].position.map((value) => (value * 1e3).toFixed(1)).join(", ")}] mm:{" "}
              {(result.probes[0].magnitudeT * 1e3).toFixed(3)} mT
            </p>
          ) : null}
          <p className="studio-study-note">
            {result.approximations.join(" ")} Statistics are computed from the sampled field, not from displayed colors.
          </p>
        </>
      ) : result && !result.completed ? (
        <p>{result.limitation || "This run did not produce a completed field."}</p>
      ) : (
        <p>Run the study to sample the field in the assembly frame.</p>
      )}
    </div>
  );
}

function SlicePlot({
  slice,
  quantity,
  field,
}: {
  slice: NonNullable<MagnetStudyResult["slice"]>;
  quantity: FieldQuantity;
  field: NonNullable<MagnetStudyResult["field"]>;
}) {
  const values = useMemo(() => {
    if (quantity === "magnitude" || !field) return slice.values;
    const width = slice.width;
    const height = slice.height;
    const index = slice.index;
    const out: number[] = [];
    const nx = width;
    const ny = height;
    const nz = Math.round(field.magnitude.length / (nx * ny));
    const pick = quantity === "bx" ? field.bx : quantity === "by" ? field.by : quantity === "bz" ? field.bz : field.magnitude;
    const ref = quantity === "delta" ? field.magnitude.reduce((sum, value) => sum + value, 0) / field.magnitude.length : 0;
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const i = x * ny * nz + y * nz + index;
        const value = pick[i] ?? 0;
        out.push(quantity === "delta" ? value - (quantity === "delta" ? field.magnitude[i] - (field.magnitude[i] - value) : 0) || value - ref : value);
      }
    }
    return out;
  }, [field, quantity, slice]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    node.width = slice.width;
    node.height = slice.height;
    const context = node.getContext("2d");
    if (!context) return;
    const image = context.createImageData(slice.width, slice.height);
    const span = Math.max(hi - lo, 1e-12);
    for (let i = 0; i < values.length; i += 1) {
      const t = (values[i] - lo) / span;
      image.data[i * 4] = Math.round(20 + 200 * t);
      image.data[i * 4 + 1] = Math.round(40 + 180 * (1 - Math.abs(t - 0.5) * 2));
      image.data[i * 4 + 2] = Math.round(220 - 160 * t);
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [hi, lo, slice.height, slice.width, values]);
  const label = quantity === "delta" ? "ΔB (T)" : quantity === "magnitude" ? "|B| (T)" : `${quantity.toUpperCase()} (T)`;
  return (
    <figure className="studio-study-slice">
      <canvas ref={canvas} aria-label={`${label} ROI slice`} />
      <figcaption>
        {label} · {lo.toExponential(2)} to {hi.toExponential(2)} T · {slice.axis} slice
      </figcaption>
    </figure>
  );
}

function RunStatusLine({ run }: { run: HardwareStudyRun | null }) {
  if (!run) return <p className="studio-study-status">No run selected.</p>;
  const label =
    run.status === "running"
      ? "Running"
      : run.status === "failed"
        ? "Failed"
        : run.stale
          ? "Completed · stale"
          : "Completed";
  return (
    <p className={`studio-study-status is-${run.status}${run.stale ? " is-stale" : ""}`}>
      {label}
      {run.snapshot ? ` · ${run.snapshot.includedInstanceIds.length} included instances` : ""}
      {run.stale ? " · assembly or settings changed after this snapshot" : ""}
    </p>
  );
}

function PartOrStudyInspector({
  study,
  projectId,
  scannerId,
  parts,
  patchEngineering,
}: {
  study: HardwareStudyKind;
  projectId: string;
  scannerId: string;
  parts: PhysicalPart[];
  patchEngineering: (scannerId: string, partId: string, patch: import("./engineering").PartEngineering extends infer E ? Partial<E> : never) => void;
}) {
  const selected = usePartInspectorStore((s) => s.selected);
  const record = useHardwareStudyStore.getState().record(projectId, study);
  if (!selected || selected.scannerId !== scannerId) {
    return (
      <div>
        <h3>Study</h3>
        <p>
          {study === "fem" ? "Elmer magnetostatics" : `Analytical magnet field · ${record.settings.magnetModel}`}
        </p>
        <p>Select a part to assign role, remanence, and magnetization. Visual materials stay separate.</p>
      </div>
    );
  }
  const binding = resolvePartBinding(selected, usePartInspectorStore.getState().bindings);
  const family = parts.filter((part) => part.partId === selected.partId);
  const engineering = binding.engineering;
  return (
    <div>
      <h3>{binding.displayName}</h3>
      <p>
        {family.length} instance{family.length === 1 ? "" : "s"} · {binding.inSimulation ? "in simulation" : "not in simulation"}
      </p>
      <label className="study-inclusion">
        <span>Included in study</span>
        <input type="checkbox" checked={binding.inSimulation} onChange={(event) => usePartInspectorStore.getState().setPartsInSimulation(scannerId, [selected.partId], event.target.checked)} />
      </label>
      <label className="studio-param">
        <span>Engineering role</span>
        <select
          value={engineering.role ?? ""}
          onChange={(event) =>
            patchEngineering(scannerId, selected.partId, {
              role: (event.target.value || null) as EngineeringRole | null,
            })
          }
        >
          <option value="">Unassigned</option>
          {ENGINEERING_ROLES.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </select>
      </label>
      {engineering.role === "permanent_magnet" ? (
        <>
          <label className="studio-param">
            <span>Remanence (T)</span>
            <input
              type="number"
              min={0}
              step={0.05}
              value={engineering.remanenceT ?? ""}
              onChange={(event) =>
                patchEngineering(scannerId, selected.partId, {
                  remanenceT: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>
          <label className="studio-param">
            <span>Magnetization frame</span>
            <select
              value={engineering.magnetizationFrame}
              onChange={(event) =>
                patchEngineering(scannerId, selected.partId, {
                  magnetizationFrame: event.target.value as "local" | "world",
                })
              }
            >
              <option value="local">Part local</option>
              <option value="world">Assembly world</option>
            </select>
          </label>
          <NumberTriple
            label="Magnetization direction"
            values={engineering.magnetizationLocal ?? [0, 0, 1]}
            step={0.1}
            onChange={(values) => patchEngineering(scannerId, selected.partId, { magnetizationLocal: values })}
          />
        </>
      ) : null}
      {engineering.role === "magnetic_yoke" ? (
        <label className="studio-param">
          <span>Relative permeability</span>
          <input
            type="number"
            min={1}
            step={10}
            value={engineering.relativePermeability ?? ""}
            onChange={(event) =>
              patchEngineering(scannerId, selected.partId, {
                relativePermeability: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      ) : null}
      {engineering.role === "conductor" ? (
        <label className="studio-param">
          <span>Conductivity (S/m)</span>
          <input
            type="number"
            min={0}
            step={1e6}
            value={engineering.conductivitySPerM ?? ""}
            onChange={(event) =>
              patchEngineering(scannerId, selected.partId, {
                conductivitySPerM: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      ) : null}
    </div>
  );
}

function NumberTriple({
  label,
  values,
  onChange,
  step = 1,
}: {
  label: string;
  values: [number, number, number] | number[];
  onChange: (values: [number, number, number]) => void;
  step?: number;
}) {
  return (
    <label className="studio-param">
      <span>{label}</span>
      <span className="studio-triple">
        {([0, 1, 2] as const).map((index) => (
          <input
            key={index}
            type="number"
            step={step}
            aria-label={`${label} ${["x", "y", "z"][index]}`}
            value={Number.isFinite(values[index]) ? values[index] : 0}
            onChange={(event) => {
              const next: [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
              next[index] = Number(event.target.value);
              onChange(next);
            }}
          />
        ))}
      </span>
    </label>
  );
}
