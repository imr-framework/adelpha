import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Atom, Check, Image as ImageIcon, LayoutGrid, List, Loader, LogOut, Maximize2, Square, Wrench, X, Zap } from "lucide-react";
import {
  connectMriEvents,
  createScan,
  deleteScan,
  duplicateScan,
  editScan,
  emptyPatient,
  endExam,
  fetchCurrentExam,
  fetchMriHealth,
  fetchScan,
  fetchScans,
  fetchSequences,
  patchScan,
  pingDevice,
  prepareScan,
  respondEvent,
  startExam,
  stopScan,
} from "./mri/api";
import type {
  ExamResponse,
  MriEvent,
  ParameterProperty,
  PatientInformation,
  ScanQueueEntry,
  ScanTask,
  SeqTab,
  SequenceInfo,
} from "./mri/types";
import {
  AboutDialog,
  AlertDialog,
  ConfigDialog,
  DefinitionDialog,
  FlexDialog,
  LogDialog,
  Overlay,
  QueryDialog,
  RegistrationForm,
  ShimDialog,
  StatusDialog,
  StudyDialog,
  type ViewerTarget,
} from "./ImagingDialogs";

/** Shown in the topbar hamburger while Imaging Console is active. */
export type ImagingMenuAction =
  | "register"
  | "study"
  | "protocols"
  | "flex"
  | "layout-1"
  | "layout-2"
  | "layout-3"
  | "close-exam"
  | "status"
  | "logs"
  | "config"
  | "shutdown"
  | "about"
  | "debug-refresh";

export type ImagingMenuEntry =
  | { heading: string }
  | { id: ImagingMenuAction; label: string; indent?: boolean };

export const IMAGING_MENU: { section: string; items: ImagingMenuEntry[] }[] = [
  {
    section: "Exam",
    items: [
      { id: "register", label: "Patient Registration…" },
      { heading: "Layout" },
      { id: "layout-3", label: "3 viewers", indent: true },
      { id: "layout-2", label: "2 viewers", indent: true },
      { id: "layout-1", label: "1 viewer", indent: true },
      { id: "study", label: "Study Viewer…" },
      { id: "protocols", label: "Protocol Browser…" },
      { id: "flex", label: "Flex Viewer…" },
      { id: "close-exam", label: "Close Exam…" },
    ],
  },
  {
    section: "Control",
    items: [
      { id: "status", label: "System Status…" },
      { id: "logs", label: "Log Viewer…" },
      { id: "config", label: "Configuration…" },
      { id: "shutdown", label: "Shutdown…" },
    ],
  },
  {
    section: "Help",
    items: [{ id: "about", label: "About…" }],
  },
  {
    section: "Debug",
    items: [{ id: "debug-refresh", label: "Refresh scan list" }],
  },
];

/** @deprecated use IMAGING_MENU — kept so older imports still type-check. */
export const IMAGING_CONSOLE_MENU = ["Exam", "Control", "Help", "Debug"] as const;

const TABS: { id: SeqTab; label: string }[] = [
  { id: "sequence", label: "SEQUENCE" },
  { id: "adjustments", label: "ADJUSTMENTS" },
  { id: "system", label: "SYSTEM" },
  { id: "processing", label: "PROCESSING" },
  { id: "other", label: "OTHER" },
];

function ageFromDob(yyyymmdd: string): number {
  if (yyyymmdd.length !== 8) return 0;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 <= m && today.getDate() < d) age -= 1;
  return Math.max(0, age);
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function patientLine(exam: ExamResponse | null): string {
  if (!exam) return "No exam";
  const p = exam.patient;
  const name = `${p.last_name || "Patient"}, ${p.first_name}`.replace(/^, /, "");
  return `${name}  ·  MRN: ${p.mrn || "—"}`;
}

function viewerTargetFromTask(task: ScanTask | null, folder: string, label: string): ViewerTarget | null {
  if (!task || !folder) return null;
  const result = task.results.find((item) => item.primary) ?? task.results[0];
  if (!result) return null;
  return {
    label,
    folder,
    filePath: result.file_path,
    resultType: result.type,
    patientName: `${task.patient.last_name}, ${task.patient.first_name}`,
    mrn: task.patient.mrn,
    protocolName: task.protocol_name,
    scanNumber: task.scan_number,
  };
}

function ParamField({
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
  const label = prop.title || name;
  if (prop.type === "boolean") {
    return (
      <label className="ic-check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(name, e.target.checked)}
        />
        {label}
      </label>
    );
  }
  if (prop.enum?.length) {
    return (
      <label className="ic-field">
        <span>{label}</span>
        <span className="ic-field-control">
          <select value={String(value ?? "")} onChange={(e) => onChange(name, e.target.value)}>
            {prop.enum.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </span>
      </label>
    );
  }
  const numeric = prop.type === "integer" || prop.type === "number";
  return (
    <label className="ic-field">
      <span>{label}</span>
      <span className="ic-field-control">
        <input
          type={numeric ? "number" : "text"}
          value={value == null ? "" : String(value)}
          min={prop.minimum}
          max={prop.maximum}
          onChange={(e) => {
            if (numeric) {
              const n = e.target.value === "" ? "" : Number(e.target.value);
              onChange(name, n);
            } else {
              onChange(name, e.target.value);
            }
          }}
        />
        {prop.unit ? <em>{prop.unit}</em> : null}
      </span>
    </label>
  );
}

export function ImagingConsole() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [simulation, setSimulation] = useState(false);
  const [exam, setExam] = useState<ExamResponse | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [protocolsOpen, setProtocolsOpen] = useState(false);
  const [dialog, setDialog] = useState<
    "about" | "logs" | "config" | "status" | "study" | "shim" | "definition" | "flex" | null
  >(null);
  const [definitionJson, setDefinitionJson] = useState("");
  const [viewerCount, setViewerCount] = useState<1 | 2 | 3>(3);
  const [position, setPosition] = useState("HFS");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string; kind: "queue" | "results" } | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [ipc, setIpc] = useState<
    | { kind: "query"; id: string; source: "acq" | "recon"; request: string; inputType: "text" | "int" | "float"; min: number; max: number }
    | { kind: "alert"; id: string; source: "acq" | "recon"; message: string; alertType: "information" | "warning" | "critical" }
    | { kind: "plot"; id: string; source: "acq" | "recon" }
    | { kind: "dicom"; id: string; source: "acq" | "recon"; files: string[] }
    | null
  >(null);
  const [flexOpen, setFlexOpen] = useState(false);
  const [flexTarget, setFlexTarget] = useState<ViewerTarget | null>(null);
  const [viewerSlots, setViewerSlots] = useState<{ 1: string; 2: string; 3: string; flex: string }>({
    1: "",
    2: "",
    3: "",
    flex: "",
  });
  const [acqClock, setAcqClock] = useState<{ start: number; expected: number; disable: boolean } | null>(null);
  const shimValues = useRef({ x: 0, y: 0, z: 0 });
  const [patient, setPatient] = useState<PatientInformation>(emptyPatient());
  const [acc, setAcc] = useState("");
  const [sequences, setSequences] = useState<SequenceInfo[]>([]);
  const [queue, setQueue] = useState<ScanQueueEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState<SeqTab>("sequence");
  const [status, setStatus] = useState("Connecting to MRI4ALL API…");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [plotSeries, setPlotSeries] = useState<number[] | null>(null);
  const [imageHint, setImageHint] = useState("");

  const selected = queue.find((s) => s.id === selectedId) ?? null;
  const seqInfo = sequences.find((s) => s.id === selected?.sequence);
  const experimentActive = queue.some((s) => s.state === "acq" || s.state === "recon" || s.state === "scheduled_recon");

  const refreshQueue = useCallback(async () => {
    try {
      const next = await fetchScans();
      setQueue(next);
    } catch {
      /* idle */
    }
  }, []);

  const loadExam = useCallback(async () => {
    try {
      const health = await fetchMriHealth();
      setApiOk(true);
      setSimulation(health.hardware_simulation);
      const current = await fetchCurrentExam();
      setExam(current);
      const seqs = await fetchSequences(true);
      setSequences(seqs);
      if (current) {
        await refreshQueue();
        setPatient(current.patient);
        setAcc(current.exam.acc);
        setPosition(current.exam.patient_position || "HFS");
        setStatus(health.hardware_simulation ? "Scanner ready (simulation)" : "Scanner ready");
        setRegisterOpen(false);
      } else {
        setQueue([]);
        setStatus("Register a patient to start an exam");
        setRegisterOpen(true);
      }
    } catch (err) {
      setApiOk(false);
      setStatus(err instanceof Error ? err.message : "MRI4ALL API unreachable on :8002");
    }
  }, [refreshQueue]);

  useEffect(() => {
    void loadExam();
  }, [loadExam]);

  useEffect(() => {
    if (!exam) return;
    const t = window.setInterval(() => void refreshQueue(), 1500);
    return () => window.clearInterval(t);
  }, [exam, refreshQueue]);

  useEffect(() => {
    return connectMriEvents((ev: MriEvent) => {
      const kind = ev.value?.type;
      const source: "acq" | "recon" = ev.source === "recon" ? "recon" : "acq";
      const eventId = ev.id ?? "";
      if (kind === "set_status" && ev.value?.message) setStatus(ev.value.message);
      if (kind === "user_alert" && ev.value?.message) {
        setIpc({
          kind: "alert",
          id: eventId,
          source,
          message: ev.value.message,
          alertType: ev.value.alert_type ?? "information",
        });
      }
      if (kind === "user_query") {
        setIpc({
          kind: "query",
          id: eventId,
          source,
          request: ev.value?.request || "Value",
          inputType: ev.value?.input_type ?? "text",
          min: ev.value?.in_min ?? 0,
          max: ev.value?.in_max ?? 1000,
        });
      }
      if (kind === "shim") {
        const msg = ev.value?.message;
        if (msg === "start") {
          setDialog("shim");
          if (eventId) void respondEvent(eventId, null, source);
        } else if (msg === "get") {
          if (eventId) {
            void respondEvent(
              eventId,
              { values: { ...shimValues.current }, complete: true },
              source,
            );
          }
        }
      }
      if (kind === "show_plot") {
        const plot = ev.value?.plot as { data?: number[] | number[][] } | undefined;
        const data = plot?.data;
        if (Array.isArray(data) && data.length && typeof data[0] === "number") {
          setPlotSeries(data as number[]);
        } else if (Array.isArray(data) && Array.isArray(data[0])) {
          setPlotSeries(data[0] as number[]);
        }
        setIpc({ kind: "plot", id: eventId, source });
      }
      if (kind === "show_dicom" && ev.value?.dicom_files?.length) {
        const files = ev.value.dicom_files;
        setImageHint(`${files.length} DICOM series ready`);
        setViewerSlots((prev) => ({ ...prev, 1: files.join("\n") }));
        setIpc({ kind: "dicom", id: eventId, source, files });
      }
      if (kind === "acq_data") {
        const start = ev.value?.start_time ? Date.parse(ev.value.start_time) : Date.now();
        setAcqClock({
          start: Number.isFinite(start) ? start : Date.now(),
          expected: ev.value?.expected_duration_sec ?? 0,
          disable: Boolean(ev.value?.disable_statustimer),
        });
      }
      void refreshQueue();
    });
  }, [refreshQueue]);

  useEffect(() => {
    if (!acqClock || acqClock.disable) return;
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - acqClock.start) / 1000));
      if (acqClock.expected <= 0) {
        setStatus(`Running scan...  (${formatElapsed(sec)})`);
      } else {
        const remain = Math.max(0, acqClock.expected - sec);
        setStatus(`Running scan...  remaining ${formatElapsed(remain)}`);
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [acqClock]);

  useEffect(() => {
    if (!experimentActive) setAcqClock(null);
  }, [experimentActive]);

  const onEndExam = useCallback(async () => {
    if (!exam) return;
    if (!window.confirm("End the active exam?")) return;
    try {
      await endExam();
      setExam(null);
      setQueue([]);
      setSelectedId(null);
      setViewerSlots({ 1: "", 2: "", 3: "", flex: "" });
      setFlexOpen(false);
      setFlexTarget(null);
      setRegisterOpen(true);
      setStatus("Exam closed");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to close exam");
    }
  }, [exam]);

  useEffect(() => {
    const onMenu = (e: Event) => {
      const item = (e as CustomEvent<ImagingMenuAction>).detail;
      if (item === "register") {
        if (exam) {
          setPatient(exam.patient);
          setAcc(exam.exam.acc);
          setPosition(exam.exam.patient_position || "HFS");
        }
        setRegisterOpen(true);
      }
      if (item === "protocols") setProtocolsOpen(true);
      if (item === "study") setDialog("study");
      if (item === "flex") setFlexOpen(true);
      if (item === "about") setDialog("about");
      if (item === "logs") setDialog("logs");
      if (item === "config") setDialog("config");
      if (item === "status") setDialog("status");
      if (item === "layout-1") setViewerCount(1);
      if (item === "layout-2") setViewerCount(2);
      if (item === "layout-3") setViewerCount(3);
      if (item === "debug-refresh") void refreshQueue();
      if (item === "close-exam") void onEndExam();
      if (item === "shutdown") {
        if (!window.confirm("Shut down Adelpha?")) return;
        if (window.adelphaApp?.quit) window.adelphaApp.quit();
        else window.close();
      }
    };
    window.addEventListener("adelpha:imaging-menu", onMenu);
    return () => window.removeEventListener("adelpha:imaging-menu", onMenu);
  }, [exam, onEndExam, refreshQueue]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ctxRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [ctxMenu]);

  const openScan = async (id: string) => {
    setSelectedId(id);
    setProblems([]);
    try {
      const detail = await fetchScan(id);
      setDraft({ ...(detail.task?.parameters ?? {}) });
      if (detail.entry.state === "created" || detail.entry.state === "scheduled_acq") {
        await editScan(id);
        await refreshQueue();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to open scan");
    }
  };

  const onRegister = async () => {
    if (!patient.last_name || !patient.first_name || !patient.mrn) {
      setProblems(["Name and MRN are required"]);
      return;
    }
    if (exam && !window.confirm("Start a new exam? The current exam queue will be cleared.")) return;
    setBusy(true);
    setProblems([]);
    try {
      const started = await startExam({
        patient: { ...patient, age: ageFromDob(patient.birth_date) },
        acc,
        patient_position: position,
      });
      setExam(started);
      setRegisterOpen(false);
      setQueue([]);
      setSelectedId(null);
      setViewerSlots({ 1: "", 2: "", 3: "", flex: "" });
      setFlexOpen(false);
      setFlexTarget(null);
      setStatus("Scanner ready");
    } catch (err) {
      setProblems([err instanceof Error ? err.message : "Failed to start exam"]);
    } finally {
      setBusy(false);
    }
  };

  const onAddSequence = async (seqId: string) => {
    setBusy(true);
    try {
      const entry = await createScan(seqId);
      setProtocolsOpen(false);
      await refreshQueue();
      await openScan(entry.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to insert sequence");
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async () => {
    if (!selectedId) return;
    setBusy(true);
    setProblems([]);
    try {
      await patchScan(selectedId, { parameters: draft });
      await prepareScan(selectedId);
      await refreshQueue();
      setStatus("Sequence prepared — waiting for acquisition");
    } catch (err) {
      setProblems([err instanceof Error ? err.message : "Invalid parameters"]);
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = async () => {
    if (!selectedId) return;
    try {
      const detail = await fetchScan(selectedId);
      setDraft({ ...(detail.task?.parameters ?? {}) });
      setProblems([]);
    } catch {
      /* ignore */
    }
  };

  const onHalt = async () => {
    if (!selectedId) return;
    try {
      await stopScan(selectedId);
      await refreshQueue();
      setStatus("Halt requested");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Halt failed");
    }
  };

  const fillPhantom = () => {
    const n = String(Math.floor(Math.random() * 9999));
    const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    setPatient({
      first_name: n,
      last_name: "Phantom",
      mrn: uid,
      birth_date: "20231016",
      gender: "O",
      weight_kg: 20,
      height_cm: 100,
      age: 2,
    });
    setAcc(crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase());
    setPosition("HFS");
    setProblems([]);
  };

  const replyIpc = (response: unknown, error = false) => {
    if (!ipc) return;
    if (ipc.id) void respondEvent(ipc.id, response, ipc.source, error);
    setIpc(null);
  };

  const loadIntoViewer = (slot: 1 | 2 | 3 | "flex", payload: string | ViewerTarget) => {
    const label = typeof payload === "string" ? payload : payload.label;
    setViewerSlots((prev) => ({ ...prev, [slot]: label }));
    if (slot === "flex") {
      setFlexTarget(typeof payload === "string" ? null : payload);
      setFlexOpen(true);
    }
    setStatus(slot === "flex" ? "Loaded into Flex Viewer" : `Loaded into Viewer ${slot}`);
  };

  const showQueueInViewer = (slot: 1 | 2 | 3 | "flex", id: string) => {
    setCtxMenu(null);
    const entry = queue.find((q) => q.id === id);
    if (!entry) return;
    const label = `${entry.scan_counter}. ${entry.protocol_name}`;
    void fetchScan(entry.id)
      .then((detail) => {
        const target = viewerTargetFromTask(detail.task, detail.folder, `${entry.scan_counter}:  ${entry.protocol_name}`);
        loadIntoViewer(slot, target ?? label);
      })
      .catch(() => loadIntoViewer(slot, label));
  };

  const onDuplicate = async (id: string) => {
    try {
      const entry = await duplicateScan(id);
      await refreshQueue();
      await openScan(entry.id);
      setStatus(`Duplicated as ${entry.scan_counter}. ${entry.protocol_name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Duplicate failed");
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameTarget.name.trim();
    if (!name) return;
    try {
      await patchScan(renameTarget.id, { protocol_name: name });
      await refreshQueue();
      setStatus(`Renamed to ${name}`);
      setRenameTarget(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteScan(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setDraft({});
      }
      await refreshQueue();
      setStatus("Scan deleted");
      setDeleteTarget(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onShowDefinition = async (id: string) => {
    try {
      const detail = await fetchScan(id);
      setDefinitionJson(JSON.stringify(detail.task ?? detail.entry, null, 2));
      setDialog("definition");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to load definition");
    }
  };

  const schemaFields = useMemo(() => {
    const props = seqInfo?.parameter_schema?.properties ?? {};
    const entries = Object.entries(props);
    const forTab = entries.filter(([, p]) => (p.tab || "sequence") === tab);
    return forTab.length ? forTab : tab === "sequence" ? entries : [];
  }, [seqInfo, tab]);

  return (
    <section className="imaging-console" aria-label="Imaging Console">
      {registerOpen ? (
        <div className="ic-register" role="dialog" aria-labelledby="ic-register-title">
          <div className="ic-register-card">
            <h2 id="ic-register-title">Patient Registration</h2>
            <RegistrationForm
              apiOk={apiOk}
              busy={busy}
              patient={patient}
              acc={acc}
              position={position}
              problems={problems}
              onPatient={setPatient}
              onAcc={setAcc}
              onPosition={setPosition}
              onPhantom={fillPhantom}
              onSubmit={() => void onRegister()}
              onCancel={exam ? () => setRegisterOpen(false) : undefined}
            />
          </div>
        </div>
      ) : null}

      {protocolsOpen ? (
        <div className="ic-protocols" role="dialog" aria-label="Protocol browser">
          <div className="ic-protocols-card">
            <header>
              <h3>Protocols</h3>
              <button type="button" aria-label="Close" onClick={() => setProtocolsOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <ul>
              {sequences.filter((s) => !s.adjustment).map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => void onAddSequence(s.id)} disabled={!exam || busy}>
                    <strong>{s.name}</strong>
                    <span>{s.description || s.id}</span>
                  </button>
                </li>
              ))}
            </ul>
            {sequences.some((s) => s.adjustment) ? (
              <>
                <h4 className="ic-dialog-sub">Adjustments</h4>
                <ul>
                  {sequences.filter((s) => s.adjustment).map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => void onAddSequence(s.id)} disabled={!exam || busy}>
                        <strong>{s.name}</strong>
                        <span>{s.description || s.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {dialog === "about" ? <AboutDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "logs" ? <LogDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "config" ? <ConfigDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "status" ? <StatusDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "study" ? (
        <StudyDialog
          onClose={() => setDialog(null)}
          onLoad={(target, slot) => {
            loadIntoViewer(slot, target);
          }}
        />
      ) : null}
      {dialog === "definition" ? <DefinitionDialog json={definitionJson} onClose={() => setDialog(null)} /> : null}
      {dialog === "shim" ? (
        <ShimDialog
          onClose={() => setDialog(null)}
          onChange={(values) => {
            shimValues.current = values;
          }}
          onApply={(values) => {
            shimValues.current = values;
            setDialog(null);
          }}
        />
      ) : null}
      {flexOpen ? <FlexDialog onClose={() => setFlexOpen(false)} target={flexTarget} /> : null}

      {ipc?.kind === "query" ? (
        <QueryDialog
          request={ipc.request}
          inputType={ipc.inputType}
          min={ipc.min}
          max={ipc.max}
          onSubmit={(value) => replyIpc(value)}
          onClose={() => replyIpc(null, true)}
        />
      ) : null}
      {ipc?.kind === "alert" ? (
        <AlertDialog
          title={ipc.alertType}
          message={ipc.message}
          onAck={() => replyIpc(true)}
        />
      ) : null}
      {ipc?.kind === "plot" ? (
        <Overlay title="Plot" onClose={() => replyIpc(1)} wide>
          <div className="ic-viewer-stage" style={{ minHeight: 280 }}>
            {plotSeries ? <Sparkline data={plotSeries} /> : <p className="ic-muted">No plot data</p>}
          </div>
          <div className="ic-register-actions">
            <button type="button" className="settings-btn settings-btn-accent" onClick={() => replyIpc(1)}>
              Continue
            </button>
          </div>
        </Overlay>
      ) : null}
      {ipc?.kind === "dicom" ? (
        <Overlay title="DICOM" onClose={() => replyIpc(1)} wide>
          <p className="ic-register-sub">{ipc.files.length} file(s)</p>
          <pre className="ic-log">{ipc.files.join("\n")}</pre>
          <div className="ic-register-actions">
            <button type="button" className="settings-btn settings-btn-accent" onClick={() => replyIpc(1)}>
              Continue
            </button>
          </div>
        </Overlay>
      ) : null}

      {ctxMenu ? (
        <div
          ref={ctxRef}
          className="ic-ctx"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ctxMenu.kind === "results" ? (
            <>
              <button type="button" onClick={() => showQueueInViewer(1, ctxMenu.id)}>
                Show in Viewer 1
              </button>
              <button type="button" onClick={() => showQueueInViewer(2, ctxMenu.id)}>
                Show in Viewer 2
              </button>
              <button type="button" onClick={() => showQueueInViewer(3, ctxMenu.id)}>
                Show in Viewer 3
              </button>
              <button type="button" onClick={() => showQueueInViewer("flex", ctxMenu.id)}>
                Show in Flex Viewer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  const id = ctxMenu.id;
                  setCtxMenu(null);
                  void onDuplicate(id);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  const entry = queue.find((q) => q.id === ctxMenu.id);
                  setCtxMenu(null);
                  if (!entry) return;
                  if (entry.state !== "created" && entry.state !== "scheduled_acq") {
                    setStatus("Can only rename scans that have not started");
                    return;
                  }
                  setRenameTarget({ id: entry.id, name: entry.protocol_name });
                }}
              >
                Rename…
              </button>
              <button
                type="button"
                onClick={() => {
                  const entry = queue.find((q) => q.id === ctxMenu.id);
                  setCtxMenu(null);
                  if (!entry) return;
                  if (entry.state !== "created" && entry.state !== "scheduled_acq") {
                    setStatus("Only unacquired scans can be deleted");
                    return;
                  }
                  setDeleteTarget({ id: entry.id, name: `${entry.scan_counter}. ${entry.protocol_name}` });
                }}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = ctxMenu.id;
                  setCtxMenu(null);
                  void onShowDefinition(id);
                }}
              >
                Show definition…
              </button>
            </>
          )}
        </div>
      ) : null}

      {renameTarget ? (
        <Overlay title="Protocol Name" onClose={() => setRenameTarget(null)}>
          <label className="ic-field">
            <span>Enter protocol name</span>
            <input
              value={renameTarget.name}
              autoFocus
              onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRename();
              }}
            />
          </label>
          <div className="ic-register-actions">
            <button type="button" className="settings-btn" onClick={() => setRenameTarget(null)}>
              Cancel
            </button>
            <button type="button" className="settings-btn settings-btn-accent" onClick={() => void submitRename()} disabled={!renameTarget.name.trim()}>
              Rename
            </button>
          </div>
        </Overlay>
      ) : null}

      {deleteTarget ? (
        <Overlay title="Delete scan" onClose={() => setDeleteTarget(null)}>
          <p className="ic-register-sub">Delete {deleteTarget.name} from the queue? This cannot be undone.</p>
          <div className="ic-register-actions">
            <button type="button" className="settings-btn" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button type="button" className="settings-btn settings-btn-accent" onClick={() => void submitDelete()}>
              Delete
            </button>
          </div>
        </Overlay>
      ) : null}

      <div className={`ic-screens is-${viewerCount}`}>
        <article className="ic-screen">
          <div className="ic-viewer-stage" aria-label="Viewer 1">
            {viewerSlots[1] ? <p className="ic-muted">{viewerSlots[1]}</p> : imageHint ? <p className="ic-muted">{imageHint}</p> : null}
          </div>
        </article>
        <article className="ic-screen">
          <div className="ic-viewer-stage" aria-label="Viewer 2">
            {viewerSlots[2] ? <p className="ic-muted">{viewerSlots[2]}</p> : plotSeries ? <Sparkline data={plotSeries} /> : null}
          </div>
        </article>
        <article className="ic-screen">
          <div className="ic-viewer-stage" aria-label="Viewer 3">
            {viewerSlots[3] ? <p className="ic-muted">{viewerSlots[3]}</p> : null}
          </div>
        </article>
      </div>

      <div className="ic-lower">
        <aside className="ic-seq-list" aria-label="Sequence list">
          <ul>
            {queue.map((s) => {
              const isSelected = s.id === selectedId;
              return (
                <li key={s.id}>
                  <div
                    className={`ic-seq-item is-${s.state}${isSelected ? " is-selected" : ""}`}
                    title={s.description ? `${s.description}\nClass = ${s.sequence}` : `Class = ${s.sequence}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, id: s.id, kind: "queue" });
                    }}
                  >
                    <button type="button" className="ic-seq-main" onClick={() => void openScan(s.id)}>
                      <span className="ic-seq-name">
                        {s.scan_counter}. {s.protocol_name}
                      </span>
                    </button>
                    <span className="ic-seq-icons">
                      {s.has_results ? (
                        <button
                          type="button"
                          className="ic-seq-icon-btn"
                          title="Show in viewer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCtxMenu({ x: e.clientX, y: e.clientY, id: s.id, kind: "results" });
                          }}
                        >
                          <ImageIcon size={14} strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : null}
                      {s.state === "created" || isSelected ? <Wrench size={14} strokeWidth={1.75} aria-hidden /> : null}
                      {s.state === "acq" || s.state === "recon" ? <Loader size={14} strokeWidth={1.75} className="ic-spin" aria-hidden /> : null}
                      {s.state === "complete" ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
                      {s.state === "failure" ? <Zap size={14} strokeWidth={1.75} aria-hidden /> : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="ic-seq-footer">
            <button type="button" aria-label="Accept" title="Accept and prepare" onClick={() => void onAccept()} disabled={!selectedId || busy}>
              <Check size={16} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Discard" title="Discard edits" onClick={() => void onDiscard()} disabled={!selectedId}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </aside>

        <div className="ic-config">
          <div className="ic-config-meta">
            <span>{patientLine(exam)}</span>
            <span className="ic-config-meta-center">
              {selected ? `${selected.state.replace(/_/g, " ")}` : "—"}
              {simulation ? "  ·  simulation" : ""}
            </span>
            <span className="ic-config-meta-right">
              {selected ? `${selected.scan_counter}. ${selected.protocol_name}` : "No sequence selected"}
            </span>
          </div>

          <div className="ic-tabs" role="tablist" aria-label="Sequence parameters">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`ic-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ic-tab-panel" role="tabpanel">
            {selected && schemaFields.length ? (
              <>
                <div className="ic-form-grid">
                  <div className="ic-form-col">
                    {schemaFields
                      .filter((_, i) => i % 2 === 0)
                      .map(([key, prop]) => (
                        <ParamField
                          key={key}
                          name={key}
                          prop={prop}
                          value={draft[key] ?? prop.default}
                          onChange={(k, v) => setDraft((prev) => ({ ...prev, [k]: v }))}
                        />
                      ))}
                  </div>
                  <div className="ic-form-col">
                    {schemaFields
                      .filter((_, i) => i % 2 === 1)
                      .map(([key, prop]) => (
                        <ParamField
                          key={key}
                          name={key}
                          prop={prop}
                          value={draft[key] ?? prop.default}
                          onChange={(k, v) => setDraft((prev) => ({ ...prev, [k]: v }))}
                        />
                      ))}
                  </div>
                </div>
                {problems.length ? <p className="ic-tab-placeholder">{problems.join(" ")}</p> : null}
              </>
            ) : (
              <p className="ic-tab-placeholder">
                {exam
                  ? "Insert a protocol, then edit parameters. Accept prepares scan.json for acquisition."
                  : "Start an exam to build a sequence queue."}
              </p>
            )}
          </div>
        </div>

        <aside className="ic-rail" aria-label="Console tools">
          <button type="button" title="Scanner" aria-label="Scanner" onClick={() => void pingDevice().then((p) => setStatus(p.simulation ? "Hardware simulation" : p.ok ? "Scanner reachable" : "Scanner unreachable"))}>
            <Atom size={22} strokeWidth={1.5} />
          </button>
          <button type="button" title="Halt" aria-label="Halt" onClick={() => void onHalt()}>
            <Square size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title="Protocols"
            aria-label="Protocols"
            className={protocolsOpen ? "is-active" : undefined}
            onClick={() => setProtocolsOpen((v) => !v)}
          >
            <List size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title="Flex Viewer"
            aria-label="Flex Viewer"
            className={flexOpen ? "is-active" : undefined}
            onClick={() => setFlexOpen((v) => !v)}
          >
            <Maximize2 size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            title={`Layout: ${viewerCount} viewer${viewerCount === 1 ? "" : "s"}`}
            aria-label="Layout"
            onClick={() => setViewerCount((n) => (n === 3 ? 2 : n === 2 ? 1 : 3))}
          >
            <LayoutGrid size={20} strokeWidth={1.5} />
          </button>
          <div className="ic-rail-spacer" />
          <button type="button" title="End exam" aria-label="End exam" onClick={() => void onEndExam()}>
            <LogOut size={20} strokeWidth={1.5} />
          </button>
        </aside>
      </div>

      <footer className="ic-status">
        <span>{status}</span>
      </footer>
    </section>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 320;
  const h = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const d = data
    .map((y, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const py = h - ((y - min) / span) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="ic-sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="rgba(110, 182, 255, 0.9)" strokeWidth="1.5" />
    </svg>
  );
}
