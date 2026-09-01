import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  Binoculars,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  Download,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Play,
  Power,
  RefreshCw,
  SatelliteDish,
  Save,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  clearLog,
  cloneStudyScan,
  controlOneService,
  fetchAbout,
  fetchConfig,
  fetchCurrentExam,
  fetchDisk,
  fetchLog,
  fetchServices,
  fetchStudies,
  fetchStudyPreview,
  formatDevicePingStatus,
  pingDevice,
  resetDevice,
  saveConfig,
  sendDicoms,
  studyExportUrl,
  testDevice,
  type DicomTarget,
  type MriConfig,
  type ServiceStatus,
  type StudyExam,
  type StudyPreview,
} from "./mri/api";
import { getScannerProfile, useScannerModel } from "./scannerModel";
import { Overlay } from "./ImagingOverlay";
import { downloadTextFile } from "./headMotionLog";
import { ADELPHA_VERSION } from "./adelphaVersion";
import { ScientificPlot } from "./ScientificPlot";

export type ViewerTarget = {
  label: string;
  folder: string;
  filePath: string;
  resultType: string;
  resultName?: string;
  patientName: string;
  mrn: string;
  protocolName: string;
  scanNumber: number;
};

const GENERAL_SETTINGS: { key: keyof MriConfig; label: string }[] = [
  { key: "scanner_ip", label: "Scanner IP (Red Pitaya)" },
  { key: "debug_mode", label: "Debug Mode" },
  { key: "hardware_simulation", label: "Hardware Simulation" },
];

function M4Close({ onClose, icon }: { onClose: () => void; icon?: boolean }) {
  return (
    <div className="m4-footer">
      <button type="button" className="m4-btn m4-btn-accent" onClick={onClose}>
        {icon ? <Check size={14} strokeWidth={2.25} /> : null} Close
      </button>
    </div>
  );
}

function Mark({
  state,
  ok,
  bad,
  idle,
}: {
  state: "ok" | "bad" | "idle";
  ok: string;
  bad: string;
  idle: string;
}) {
  const Icon = state === "ok" ? CircleCheck : state === "bad" ? CircleX : CircleHelp;
  return (
    <span className={`m4-mark is-${state}`}>
      <Icon size={14} strokeWidth={2.25} /> {state === "ok" ? ok : state === "bad" ? bad : idle}
    </span>
  );
}

export function ResultStage({
  target,
  fullYTicks = false,
}: {
  target: ViewerTarget | null;
  fullYTicks?: boolean;
}) {
  const [slice, setSlice] = useState(0);
  const [preview, setPreview] = useState<StudyPreview | null>(null);
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<StudyPreview | null>(null);
  previewRef.current = preview;
  const plotAxes = preview?.series?.axes;
  const needsSizedPng = Boolean(preview?.kind === "plot" && preview.image && !plotAxes?.length);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setPlotSize((prev) => (Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4 ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setSlice(0);
  }, [target?.folder, target?.filePath]);
  useEffect(() => {
    if (!target || !target.folder || !target.filePath) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const folder = target.folder;
    const filePath = target.filePath;
    const resultType = target.resultType;
    if (needsSizedPng && (plotSize.w < 80 || plotSize.h < 80)) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    const delay = needsSizedPng ? 120 : 0;
    const timer = window.setTimeout(() => {
      setLoading(!previewRef.current?.series && !previewRef.current?.image);
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      void fetchStudyPreview(
        folder,
        filePath,
        resultType,
        slice,
        needsSizedPng ? { width: plotSize.w, height: plotSize.h, scale } : undefined,
      )
        .then((next) => {
          if (!cancelled) setPreview(next);
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview({
              kind: "empty",
              slices: 0,
              index: 0,
              vmin: 0,
              vmax: 0,
              histogram: [],
              image: "",
              series: null,
              error: e instanceof Error ? e.message : "Preview failed",
            });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [target?.folder, target?.filePath, target?.resultType, slice, needsSizedPng, needsSizedPng && plotSize.w, needsSizedPng && plotSize.h]);
  const showStudyMeta = Boolean(target) && preview?.kind !== "plot" && !plotAxes?.length;
  const histMax = Math.max(1, ...(preview?.histogram ?? [1]));
  const stageClass = [
    "m4-view-stage",
    target ? "is-loaded" : "is-empty",
    loading ? "is-loading" : "",
    preview?.error ? "is-error" : "",
    preview?.kind === "plot" ? "is-plot" : "",
    preview?.kind === "dicom" ? "is-dicom" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={stageClass}>
      {showStudyMeta && target ? (
        <div className="m4-view-meta">
          <div className="m4-view-meta-primary">{target.patientName}</div>
          <div>{target.mrn}</div>
          <div>{target.protocolName}</div>
          <div>Scan {target.scanNumber}</div>
        </div>
      ) : null}
      <div className="m4-view-canvas">
        <div className="m4-view-plot" ref={plotRef}>
          {plotAxes?.length ? (
            <ScientificPlot axes={plotAxes} fullY={fullYTicks} />
          ) : preview?.image ? (
            <img className="m4-view-image" src={preview.image} alt="" />
          ) : (
            <div className="m4-view-empty" />
          )}
        </div>
        {preview?.kind === "dicom" && preview.histogram.length ? (
          <div className="m4-hist" aria-hidden>
            <span>{Math.round(preview.vmax)}</span>
            <div className="m4-hist-bars">
              {preview.histogram.map((v, i) => (
                <i key={i} style={{ width: `${Math.max(4, (v / histMax) * 100)}%` }} />
              ))}
            </div>
            <span>{Math.round(preview.vmin)}</span>
          </div>
        ) : null}
        {preview?.kind === "dicom" && preview.slices > 1 ? (
          <input
            className="m4-slice"
            type="range"
            min={0}
            max={preview.slices - 1}
            value={Math.min(slice, preview.slices - 1)}
            onChange={(e) => setSlice(Number(e.target.value))}
          />
        ) : null}
        {loading && !plotAxes?.length && !preview?.image ? <p className="m4-view-status">Loading</p> : null}
        {!target ? <p className="m4-view-status">No result selected</p> : null}
        {preview?.error ? <p className="m4-view-placeholder">{preview.error}</p> : null}
      </div>
    </div>
  );
}

export function FlexDialog({ onClose, target }: { onClose: () => void; target: ViewerTarget | null }) {
  const [maximized, setMaximized] = useState(false);
  return (
    <Overlay
      title="Flex Viewer"
      onClose={onClose}
      variant="m4"
      size={maximized ? "flex-max" : "flex"}
      wide
      dismissOnBackdrop={false}
      footer={
        <div className="m4-footer m4-footer-end">
          <button type="button" className="m4-btn m4-btn-flat" onClick={() => setMaximized((v) => !v)}>
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {maximized ? "Restore" : "Maximize"}
          </button>
          <button type="button" className="m4-btn m4-btn-accent" onClick={onClose}>
            <Check size={14} strokeWidth={2.25} /> Close
          </button>
        </div>
      }
    >
      <ResultStage target={target} />
    </Overlay>
  );
}

export function LogDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState<"api" | "acq" | "recon" | "ui">("api");
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const load = useCallback((n: typeof name) => {
    void fetchLog(n)
      .then((r) => setLines(r.lines.filter((line) => line.trim().length > 0)))
      .catch((e) => setLines([e instanceof Error ? e.message : "Unable to load log"]));
  }, []);
  useEffect(() => {
    load(name);
    const t = window.setInterval(() => load(name), 2000);
    return () => window.clearInterval(t);
  }, [name, load]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  const rows = lines.map(parseLogLine);
  const empty = rows.length === 0;
  const label = LOG_TAB_LABELS[name];

  const exportTxt = () => {
    if (empty) return;
    downloadTextFile(`${logExportFilename(label)}.txt`, `${lines.join("\n")}\n`, "text/plain");
  };
  const exportCsv = () => {
    if (empty) return;
    downloadTextFile(`${logExportFilename(label)}.csv`, `\uFEFF${rowsToCsv(rows)}`, "text/csv;charset=utf-8");
  };
  const clearHistory = async () => {
    if (empty || busy) return;
    if (!window.confirm(`Clear ${label} log history? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await clearLog(name);
      setLines([]);
    } catch (err) {
      setLines([err instanceof Error ? err.message : "Unable to clear log"]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay title="Log Viewer" onClose={onClose} variant="m4" size="log" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} />}>
      <div className="m4-log-toolbar">
        <select value={name} onChange={(e) => setName(e.target.value as typeof name)}>
          <option value="api">Console</option>
          <option value="acq">Acquisition</option>
          <option value="recon">Reconstruction</option>
          <option value="ui">UI</option>
        </select>
        <button type="button" className="m4-icon-btn" title="Refresh" onClick={() => load(name)}>
          <RefreshCw size={14} />
        </button>
        <div className="m4-log-toolbar-actions">
          <button type="button" className="m4-btn" title="Export as text" disabled={empty} onClick={exportTxt}>
            <Download size={14} strokeWidth={1.8} aria-hidden />
            TXT
          </button>
          <button type="button" className="m4-btn" title="Export as CSV" disabled={empty} onClick={exportCsv}>
            <Download size={14} strokeWidth={1.8} aria-hidden />
            CSV
          </button>
          <button type="button" className="m4-btn" title="Clear log history" disabled={empty || busy} onClick={() => void clearHistory()}>
            <Trash2 size={14} strokeWidth={1.8} aria-hidden />
            {busy ? "Clearing…" : "Clear"}
          </button>
        </div>
      </div>
      <div
        className="m4-log-table-wrap"
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {empty ? (
          <p className="m4-log-empty">No entries in this log yet.</p>
        ) : (
          <table className="m4-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Level</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.time}-${i}`} className={row.tone ? `is-${row.tone}` : undefined}>
                  <td className="m4-log-time">{row.time}</td>
                  <td className="m4-log-source">{row.source}</td>
                  <td>
                    <span className={`m4-log-level${row.tone ? ` is-${row.tone}` : ""}`}>{row.level}</span>
                  </td>
                  <td className="m4-log-message">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Overlay>
  );
}

const LOG_TAB_LABELS = {
  api: "Console",
  acq: "Acquisition",
  recon: "Reconstruction",
  ui: "UI",
} as const;

const SOURCE_LABELS: Record<string, string> = {
  api: "Console",
  unknown: "Console",
  "mri4all-api": "Console",
  "mri4all-api.pipeline": "Console",
  acq: "Acquisition",
  recon: "Reconstruction",
  ui: "UI",
};

const LEVEL_LABELS: Record<string, string> = {
  INF: "INFO",
  WRN: "WARN",
  ERR: "ERROR",
  DBG: "DEBUG",
  CTL: "CRITICAL",
  NOT: "NOTE",
};

function parseLogLine(line: string): { time: string; source: string; level: string; message: string; tone?: string } {
  const parts = line.split(" | ");
  if (parts.length >= 5) {
    const [rawTime, rawSource, rawLevel, , ...rest] = parts;
    const levelKey = rawLevel.trim();
    const tone = levelKey === "ERR" || levelKey === "CTL" ? "err" : levelKey === "WRN" ? "wrn" : levelKey === "DBG" ? "dbg" : undefined;
    return {
      time: formatLogTime(rawTime),
      source: SOURCE_LABELS[rawSource.trim()] ?? rawSource.trim(),
      level: LEVEL_LABELS[levelKey] ?? levelKey,
      message: rest.join(" | ").trim() || "—",
      tone,
    };
  }
  const tone = line.includes("| ERR |") ? "err" : line.includes("| WRN |") ? "wrn" : line.includes("| DBG |") ? "dbg" : undefined;
  return { time: "", source: "", level: "", message: line, tone };
}

function formatLogTime(value: string): string {
  const normalized = value.replace(",", ".").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?/);
  if (!match) return normalized.slice(0, 23);
  const ms = (match[3] || "000").padEnd(3, "0").slice(0, 3);
  return `${match[1]}  ${match[2]}.${ms}`;
}

function logExportFilename(label: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `adelpha-${label.toLowerCase()}-log-${stamp}`;
}

function rowsToCsv(rows: ReturnType<typeof parseLogLine>[]): string {
  const header = ["Time", "Source", "Level", "Message"];
  const body = rows.map((row) => [row.time, row.source, row.level, row.message].map(csvCell).join(","));
  return `${[header.join(","), ...body].join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function ConfigDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"general" | "dicom" | "maintenance">("general");
  const [cfg, setCfg] = useState<MriConfig | null>(null);
  const [error, setError] = useState("");
  const [openTarget, setOpenTarget] = useState(0);
  useEffect(() => {
    void fetchConfig()
      .then((c) => setCfg({ ...c, dicom_targets: c.dicom_targets ?? [] }))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  const save = () => {
    if (!cfg) return;
    void saveConfig(cfg)
      .then(() => onClose())
      .catch((e) => setError(e instanceof Error ? e.message : "Save failed"));
  };
  const updateTarget = (i: number, patch: Partial<DicomTarget>) => {
    if (!cfg) return;
    const dicom_targets = cfg.dicom_targets.slice();
    dicom_targets[i] = { ...dicom_targets[i], ...patch };
    setCfg({ ...cfg, dicom_targets });
  };
  return (
    <Overlay
      title="Configuration"
      onClose={onClose}
      variant="m4"
      size="config"
      wide
      dismissOnBackdrop={false}
      footer={
        <div className="m4-footer">
          <button type="button" className="m4-btn m4-btn-accent" onClick={save} disabled={!cfg}>
            <Check size={14} /> Save
          </button>
          <button type="button" className="m4-btn" onClick={onClose}>
            <X size={14} /> Cancel
          </button>
        </div>
      }
    >
      <div className="m4-tabs">
        <button type="button" className={tab === "general" ? "is-active" : undefined} onClick={() => setTab("general")}>
          General
        </button>
        <button type="button" className={tab === "dicom" ? "is-active" : undefined} onClick={() => setTab("dicom")}>
          DICOM Export
        </button>
        <button type="button" className={tab === "maintenance" ? "is-active" : undefined} onClick={() => setTab("maintenance")}>
          Maintenance
        </button>
      </div>
      {error ? <p className="ic-register-error">{error}</p> : null}
      {!cfg ? (
        <p className="m4-muted">Loading…</p>
      ) : tab === "general" ? (
        <>
          <table className="m4-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {GENERAL_SETTINGS.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    {row.key === "scanner_ip" ? (
                      <input value={String(cfg[row.key] ?? "")} onChange={(e) => setCfg({ ...cfg, scanner_ip: e.target.value })} />
                    ) : (
                      <select
                        value={String(cfg[row.key] ?? "False")}
                        onChange={(e) => setCfg({ ...cfg, [row.key]: e.target.value } as MriConfig)}
                      >
                        <option value="False">False</option>
                        <option value="True">True</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m4-muted">
            Set Hardware Simulation to False to use a connected Red Pitaya. Ping checks MaRCoS on
            port 11111. After changing the IP, restart the Python runtime before running sequences.
          </p>
        </>
      ) : tab === "dicom" ? (
        <div className="m4-dicom">
          <h3>DICOM Targets</h3>
          {cfg.dicom_targets.map((t, i) => (
            <div key={i} className={`m4-tree${openTarget === i ? " is-open" : ""}`}>
              <button type="button" className="m4-tree-head" onClick={() => setOpenTarget(i)}>
                {t.name || "Untitled"}
              </button>
              {openTarget === i ? (
                <div className="m4-tree-body">
                  <label>
                    name
                    <input value={t.name} onChange={(e) => updateTarget(i, { name: e.target.value })} />
                  </label>
                  <label>
                    ip
                    <input value={t.ip} onChange={(e) => updateTarget(i, { ip: e.target.value })} />
                  </label>
                  <label>
                    port
                    <input type="number" value={t.port} onChange={(e) => updateTarget(i, { port: Number(e.target.value) })} />
                  </label>
                  <label>
                    aet_target
                    <input value={t.aet_target} onChange={(e) => updateTarget(i, { aet_target: e.target.value })} />
                  </label>
                  <label>
                    aet_source
                    <input value={t.aet_source ?? ""} onChange={(e) => updateTarget(i, { aet_source: e.target.value })} />
                  </label>
                </div>
              ) : null}
            </div>
          ))}
          <div className="m4-inline">
            <button
              type="button"
              className="m4-btn"
              onClick={() =>
                setCfg({
                  ...cfg,
                  dicom_targets: [...cfg.dicom_targets, { name: "New Target", ip: "", port: 11112, aet_target: "", aet_source: "mri4all" }],
                })
              }
            >
              Add
            </button>
            <button
              type="button"
              className="m4-btn"
              onClick={() => setCfg({ ...cfg, dicom_targets: cfg.dicom_targets.filter((_, j) => j !== openTarget) })}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <p className="m4-muted">No maintenance actions on this workstation.</p>
      )}
    </Overlay>
  );
}

export function StatusDialog({ onClose }: { onClose: () => void }) {
  const [modelId] = useScannerModel();
  const profile = getScannerProfile(modelId);
  const [about, setAbout] = useState<{ model: string; serial: string }>({
    model: profile.displayName,
    serial: profile.serial,
  });
  const [svc, setSvc] = useState<ServiceStatus | null>(null);
  const [ping, setPing] = useState<"idle" | "ok" | "bad">("idle");
  const [pingDetail, setPingDetail] = useState("");
  const [test, setTest] = useState<"idle" | "ok" | "bad">("idle");
  const [reset, setReset] = useState("");
  const [disk, setDisk] = useState<{ percent: number; freeGb: number } | null>(null);
  const refresh = () => {
    void fetchServices().then(setSvc).catch(() => setSvc({ acq: null, recon: null, mode: "unavailable" }));
    void fetchDisk()
      .then((d) => setDisk({ percent: d.percent, freeGb: Math.round(d.free / 1024 / 1024 / 1024) }))
      .catch(() => setDisk(null));
  };
  const runPing = () => {
    setPing("idle");
    setPingDetail("Checking MaRCoS…");
    void pingDevice()
      .then((p) => {
        setPing((p.reachable ?? p.ok) ? "ok" : "bad");
        setPingDetail(formatDevicePingStatus(p));
      })
      .catch((e) => {
        setPing("bad");
        setPingDetail(e instanceof Error ? e.message : "Ping failed");
      });
  };
  useEffect(() => {
    setAbout({ model: profile.displayName, serial: profile.serial });
    if (profile.family !== "mri4all") return;
    void fetchAbout()
      .then((a) => {
        setAbout({
          model: profile.displayName,
          serial: a.system.serial_number || profile.serial,
        });
      })
      .catch(() => {
        setAbout({ model: profile.displayName, serial: profile.serial });
      });
  }, [profile]);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 500);
    runPing();
    return () => window.clearInterval(t);
  }, []);
  const acqOn = Boolean(svc?.acq);
  const reconOn = Boolean(svc?.recon);
  return (
    <Overlay title="System Status" onClose={onClose} variant="m4" size="status" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} />}>
      <div className="m4-status-hero">
        <div className="m4-status-copy">
          <p className="m4-gold">
            <strong>{about.model}</strong>
          </p>
          <p>Serial Number {about.serial}</p>
          <p>Software Version {ADELPHA_VERSION}</p>
        </div>
        <img className="m4-scanner" src={profile.preview} alt={profile.alt} />
      </div>
      <div className="m4-divider" />
      <div className="m4-status-rows">
        <div className="m4-status-row">
          <span>{svc?.mode === "adelpha" ? "Acquisition pipeline" : "Acquisition Service"}</span>
          <Mark state={svc?.acq == null ? "idle" : acqOn ? "ok" : "bad"} ok="Running" bad="Not running" idle="Unknown" />
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => void controlOneService("acq", acqOn ? "stop" : "start").then(setSvc)}>
              {acqOn ? <Square size={14} /> : <Play size={14} />} {acqOn ? "Stop" : "Start"}
            </button>
            <button type="button" className="m4-btn" onClick={() => void controlOneService("acq", "kill").then(setSvc)}>
              <Ban size={14} /> Kill
            </button>
          </div>
        </div>
        <div className="m4-status-row">
          <span>{svc?.mode === "adelpha" ? "Reconstruction pipeline" : "Reconstruction Service"}</span>
          <Mark state={svc?.recon == null ? "idle" : reconOn ? "ok" : "bad"} ok="Running" bad="Not running" idle="Unknown" />
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => void controlOneService("recon", reconOn ? "stop" : "start").then(setSvc)}>
              {reconOn ? <Square size={14} /> : <Play size={14} />} {reconOn ? "Stop" : "Start"}
            </button>
            <button type="button" className="m4-btn" onClick={() => void controlOneService("recon", "kill").then(setSvc)}>
              <Ban size={14} /> Kill
            </button>
          </div>
        </div>
        <div className="m4-status-row">
          <span>Scanner Hardware</span>
          <div>
            <Mark state={ping} ok="Responding" bad="Not responding" idle="Checking" />
            {pingDetail ? <p className="m4-muted">{pingDetail}</p> : null}
          </div>
          <button type="button" className="m4-btn m4-btn-wide" onClick={runPing}>
            <SatelliteDish size={14} /> Ping
          </button>
        </div>
        <div className="m4-status-row">
          <span>Device Test</span>
          <Mark state={test} ok="Success" bad="Failure" idle="Not tested" />
          <button type="button" className="m4-btn m4-btn-wide" onClick={() => void testDevice().then((r) => setTest(r.ok ? "ok" : "bad"))}>
            <ArrowLeftRight size={14} /> Test
          </button>
        </div>
        <div className="m4-status-row">
          <span>Device Reset</span>
          <span className="m4-muted">{reset}</span>
          <button type="button" className="m4-btn m4-btn-wide" onClick={() => void resetDevice().then((r) => setReset(r.ok ? "Reset requested" : "Reset failed"))}>
            <Power size={14} /> Reset
          </button>
        </div>
        <div className="m4-status-row">
          <span>Disk Space</span>
          <div className="m4-disk">
            <progress max={100} value={disk?.percent ?? 0} />
            <em>{disk ? `${disk.freeGb} GB available` : "—"}</em>
          </div>
        </div>
        {svc?.mode === "adelpha" ? (
          <p className="m4-muted">
            Acquisition and reconstruction run inside Adelpha. Start/Stop pauses those workers.
            {svc.last_error ? ` Last error: ${svc.last_error}` : ""}
          </p>
        ) : null}
      </div>
    </Overlay>
  );
}

export function StudyDialog({
  onClose,
  onLoad,
}: {
  onClose: () => void;
  onLoad?: (target: ViewerTarget, slot: 1 | 2 | 3 | "flex") => void;
}) {
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<StudyExam | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  const [resultIdx, setResultIdx] = useState(0);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [examActive, setExamActive] = useState(false);
  const [targets, setTargets] = useState<DicomTarget[]>([]);
  const [targetName, setTargetName] = useState("Default");
  const [viewMenu, setViewMenu] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  useEffect(() => {
    void fetchStudies()
      .then((list) => {
        setExams(list);
        setSelected(list[0] ?? null);
        const first = list[0]?.scans.length ?? 0;
        setChecked(Array.from({ length: first }, () => false));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
    void fetchCurrentExam().then((e) => setExamActive(Boolean(e))).catch(() => setExamActive(false));
    void fetchConfig()
      .then((c) => {
        setTargets(c.dicom_targets ?? []);
        if (c.dicom_targets?.[0]?.name) setTargetName(c.dicom_targets[0].name);
      })
      .catch(() => undefined);
  }, []);
  const scan = selected?.scans[scanIdx] ?? null;
  const result = scan?.results[resultIdx];
  const selectExam = (exam: StudyExam) => {
    setSelected(exam);
    setScanIdx(0);
    setResultIdx(0);
    setChecked(Array.from({ length: exam.scans.length }, () => false));
  };
  const loadViewer = (slot: 1 | 2 | 3 | "flex") => {
    if (!scan) return;
    const task = scan.task as { patient?: { mrn?: string } } | undefined;
    onLoad?.(
      {
        label: `${scan.scan_number}:  ${scan.protocol_name}`,
        folder: scan.path,
        filePath: result?.file_path ?? "",
        resultType: result?.type ?? "dicom",
        resultName: result?.name,
        patientName: selected?.patientName ?? "",
        mrn: selected?.mrn || task?.patient?.mrn || selected?.acc.toLowerCase() || "",
        protocolName: scan.protocol_name,
        scanNumber: scan.scan_number,
      },
      slot,
    );
    setViewMenu(false);
  };
  return (
    <Overlay title="Study Viewer" onClose={onClose} variant="m4" size="study" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} icon />}>
      {error ? <p className="ic-register-error">{error}</p> : null}
      {notice ? <p className="m4-notice">{notice}</p> : null}
      {!exams.length && !error ? <p className="m4-muted">No completed exams in the archive yet.</p> : null}
      <div className="m4-study">
        <aside className="m4-study-left">
          <h3>EXAMS</h3>
          <table className="m4-table m4-exam-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Date / Time</th>
                <th>ACC</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id} className={selected?.id === e.id ? "is-selected" : undefined} onClick={() => selectExam(e)}>
                  <td>{e.patientName}</td>
                  <td>{e.examTime}</td>
                  <td>{e.acc.toUpperCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>SCANS</h3>
          <ul className="m4-scan-list">
            {selected?.scans.map((s, i) => (
              <li key={s.id} className={scanIdx === i ? "is-selected" : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[i])}
                    onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <button type="button" onClick={() => { setScanIdx(i); setResultIdx(0); }}>
                    {s.scan_number}:  {s.protocol_name}
                    {s.failed ? "  [failed]" : ""}
                  </button>
                </label>
              </li>
            ))}
          </ul>
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => setChecked(checked.map(() => true))}>
              Select All
            </button>
            <button type="button" className="m4-btn" onClick={() => setChecked(checked.map(() => false))}>
              Select None
            </button>
          </div>
          <h3>DICOM TRANSFER</h3>
          <div className="m4-inline m4-transfer">
            <span>Target:</span>
            <select value={targetName} onChange={(e) => setTargetName(e.target.value)}>
              {(targets.length ? targets : [{ name: "Default", ip: "", port: 0, aet_target: "" }]).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="m4-btn"
              onClick={() => {
                const folders = selected?.scans.filter((_, i) => checked[i]).map((s) => s.path) ?? [];
                if (!folders.length) {
                  setNotice("Select at least one scan to send.");
                  return;
                }
                void sendDicoms(targetName, folders)
                  .then(() => setNotice("DICOM transfer requested."))
                  .catch((e) => setNotice(e instanceof Error ? e.message : "Transfer failed"));
              }}
            >
              <Send size={14} /> Send
            </button>
          </div>
        </aside>
        <div className="m4-study-right">
          <h3>VIEWING</h3>
          <ResultStage
            target={
              scan
                ? {
                    label: `${scan.scan_number}:  ${scan.protocol_name}`,
                    folder: scan.path,
                    filePath: result?.file_path ?? "",
                    resultType: result?.type ?? "dicom",
                    resultName: result?.name,
                    patientName: selected?.patientName ?? "",
                    mrn: selected?.mrn || selected?.acc.toLowerCase() || "",
                    protocolName: scan.protocol_name,
                    scanNumber: scan.scan_number,
                  }
                : null
            }
          />
          <h3>RESULTS</h3>
          <ul className="m4-result-list">
            {scan?.results.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <button type="button" className={resultIdx === i ? "is-selected" : undefined} onClick={() => setResultIdx(i)}>
                  {r.name}  ({r.type.toUpperCase()})
                </button>
              </li>
            ))}
          </ul>
          <div className="m4-inline m4-study-actions">
            <button
              type="button"
              className="m4-btn"
              disabled={!scan || !result}
              onClick={() => {
                if (!scan || !result) return;
                window.open(studyExportUrl(scan.path, result.file_path), "_blank");
              }}
            >
              <Save size={14} /> Export
            </button>
            <button type="button" className="m4-btn" onClick={() => setDefinition(JSON.stringify(scan?.task ?? scan ?? {}, null, 2))}>
              <Binoculars size={14} /> Definition
            </button>
            <button
              type="button"
              className="m4-btn"
              disabled={!examActive || !scan}
              onClick={() => {
                if (!scan) return;
                void cloneStudyScan(scan.path)
                  .then((entry) => setNotice(`Cloned as ${entry.scan_counter}. ${entry.protocol_name}`))
                  .catch((e) => setNotice(e instanceof Error ? e.message : "Clone failed"));
              }}
            >
              <Copy size={14} /> Clone
            </button>
            <div className="m4-viewin">
              <button type="button" className="m4-btn" disabled={!examActive || !scan} onClick={() => setViewMenu((v) => !v)}>
                <ImageIcon size={14} /> View in
              </button>
              {viewMenu ? (
                <div className="m4-viewin-menu">
                  <button type="button" onClick={() => loadViewer(1)}>
                    Viewer 1
                  </button>
                  <button type="button" onClick={() => loadViewer(2)}>
                    Viewer 2
                  </button>
                  <button type="button" onClick={() => loadViewer(3)}>
                    Viewer 3
                  </button>
                  <button type="button" onClick={() => loadViewer("flex")}>
                    Flex Viewer
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {definition ? (
        <Overlay title="Scan definition" onClose={() => setDefinition(null)} variant="m4" size="log" wide dismissOnBackdrop={false}>
          <pre className="m4-log">{definition}</pre>
        </Overlay>
      ) : null}
    </Overlay>
  );
}
