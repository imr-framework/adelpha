import { Settings, X } from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { QuantitySource, TimestampedQuantity } from "./twin/dtamTypes";
import {
  formatB0T,
  formatConfidence,
  formatFreqMHz,
  formatHz,
  formatNoiseFloor,
  formatRmsV,
  formatTempC,
  sourceClass,
  sourceMonogram,
} from "./twin/format";
import {
  attachDtamTelemetryDriver,
  refreshSensorsBatch,
  requestAssess,
  requestForecast,
  useTwinStore,
} from "./twin/telemetryStore";
import { SystemConsole } from "./twin/SystemConsole";
import { ViewportToolRail, type ViewportToolId } from "./twin/ViewportToolRail";
import type { HeadPose } from "./twin/CameraFeed";
import { useHeadMotionStore } from "./twin/headMotionStore";
import {
  persistWorkspace,
  readWorkspace,
  TopbarAppMenu,
  TopbarControls,
  type WorkspaceId,
} from "./twin/TopbarControls";
import type { AssessMode } from "./twin/dtamTypes";
import { LaunchScreen } from "./twin/launch/LaunchScreen";
import { shouldPlayLaunchIntro } from "./twin/launch/launchConfig";
import "./styles.css";

const TwinCanvas = lazy(() =>
  import("./twin/TwinCanvas").then((m) => ({ default: m.TwinCanvas })),
);
const CameraFeed = lazy(() =>
  import("./twin/CameraFeed").then((m) => ({ default: m.CameraFeed })),
);
const AgentChatPanel = lazy(() =>
  import("./twin/AgentChatPanel").then((m) => ({ default: m.AgentChatPanel })),
);
const ImagingConsole = lazy(() =>
  import("./twin/ImagingConsole").then((m) => ({ default: m.ImagingConsole })),
);

const HISTORY_POINTS = 140;
const POSE_HISTORY_POINTS = 160;
const FFT_BINS = 72;
/** Samples in the Johnson/thermal noise time-domain trace. */
const JOHNSON_SAMPLES = 240;
const PANEL_WIDTH_KEY = "twin_side_panel_width_px";
const PANEL_COLLAPSED_KEY = "twin_side_panel_collapsed";
const PANEL_MODE_KEY = "twin_side_panel_mode";
const PANEL_DEFAULT_WIDTH = 380;
const PANEL_CHAT_MIN_WIDTH = 360;
const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH_FRAC = 0.72;
type DashboardCard =
  | "temp"
  | "noiseTime"
  | "noiseSpec"
  | "mriSpec"
  | "camPreview"
  | "yaw"
  | "pitch"
  | "roll";
type PanelMode = "telemetry" | "agents";

/** Box–Muller Gaussian sample (Johnson / thermal noise). */
function gaussianSample(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Time-domain Johnson–Nyquist thermal noise.
 * Amplitude scales with √T (relative to 300 K).
 */
function sampleJohnsonNoise(tempC: number, n: number): number[] {
  const tK = Math.max(1, tempC + 273.15);
  const sigma = 0.28 * Math.sqrt(tK / 300);
  return Array.from({ length: n }, () => sigma * gaussianSample());
}

/** One-sided DFT magnitude spectrum of a real-valued time series. */
function dftMagnitudeSpectrum(samples: number[]): number[] {
  const n = samples.length;
  if (n < 2) return [];
  const bins = Math.floor(n / 2);
  const out = new Array<number>(bins);
  for (let k = 0; k < bins; k++) {
    let re = 0;
    let im = 0;
    const omega = (2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      const a = omega * t;
      re += samples[t]! * Math.cos(a);
      im -= samples[t]! * Math.sin(a);
    }
    out[k] = Math.sqrt(re * re + im * im) / n;
  }
  return out;
}

function readPanelMode(): PanelMode {
  if (typeof localStorage === "undefined") return "telemetry";
  try {
    return localStorage.getItem(PANEL_MODE_KEY) === "agents" ? "agents" : "telemetry";
  } catch {
    return "telemetry";
  }
}

function readPanelWidth(): number {
  if (typeof localStorage === "undefined") return PANEL_DEFAULT_WIDTH;
  try {
    const n = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(n) && n >= PANEL_MIN_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return PANEL_DEFAULT_WIDTH;
}

function readPanelCollapsed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function clampPanelWidth(px: number, viewportWidth: number) {
  const max = Math.max(PANEL_MIN_WIDTH, Math.floor(viewportWidth * PANEL_MAX_WIDTH_FRAC));
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, Math.round(px)));
}

function formatTs(ms: number) {
  return new Date(ms).toLocaleTimeString();
}

function DashCameraPreview({
  stream,
  expanded = false,
}: {
  stream: MediaStream | null;
  expanded?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      void el.play().catch(() => {
        /* autoplay may be blocked briefly */
      });
    }
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={expanded ? "dash-camera-preview dash-camera-preview-expanded" : "dash-camera-preview"}>
      <video ref={videoRef} className="dash-camera-video" muted playsInline autoPlay />
      {!stream ? <span className="dash-camera-waiting">Waiting for camera…</span> : null}
    </div>
  );
}

function linePath(values: number[], min: number, max: number, width: number, height: number) {
  const den = Math.max(values.length - 1, 1);
  const span = Math.max(max - min, 1e-6);
  const pad = Math.min(6, height * 0.06);
  const usable = Math.max(height - pad * 2, 1);
  return values
    .map((v, i) => {
      const x = (i / den) * width;
      const y = pad + usable - ((v - min) / span) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function linePathOffset(
  values: number[],
  min: number,
  max: number,
  width: number,
  height: number,
  ox: number,
  oy: number,
) {
  const den = Math.max(values.length - 1, 1);
  const span = Math.max(max - min, 1e-6);
  const pad = Math.min(8, height * 0.04);
  const usable = Math.max(height - pad * 2, 1);
  return values
    .map((v, i) => {
      const x = ox + (i / den) * width;
      const y = oy + pad + usable - ((v - min) / span) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function InfoCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="info-card">
      <h2 className="info-card-title">{title}</h2>
      <div className="info-card-body">{children}</div>
      {footer ? <div className="info-card-footer">{footer}</div> : null}
    </section>
  );
}

function MetricRow({
  label,
  value,
  source,
  confidence,
  nested,
}: {
  label: string;
  value: string;
  source?: QuantitySource | null;
  confidence?: string | null;
  nested?: boolean;
}) {
  return (
    <div className={`metric-row${nested ? " metric-row-nested" : ""}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-meta">
        <span className="metric-value">{value}</span>
        {source ? (
          <span
            className={`src-badge ${sourceClass(source)}`}
            title={source}
            aria-label={source}
          >
            {sourceMonogram(source)}
          </span>
        ) : null}
        {confidence ? <span className="metric-conf">{confidence}</span> : null}
      </div>
    </div>
  );
}

function QuantityRow({
  label,
  q,
  format,
  bare,
  bareSource = "nominal",
  nested,
}: {
  label: string;
  q?: TimestampedQuantity | null;
  format: (v: number) => string;
  bare?: string | null;
  bareSource?: QuantitySource;
  nested?: boolean;
}) {
  if (bare != null) {
    return <MetricRow label={label} value={bare} source={bareSource} nested={nested} />;
  }
  if (!q) {
    return <MetricRow label={label} value="—" nested={nested} />;
  }
  return (
    <MetricRow
      label={label}
      value={format(q.value)}
      source={q.source}
      confidence={formatConfidence(q) || null}
      nested={nested}
    />
  );
}

export default function App() {
  const telemetry = useTwinStore((s) => s.telemetry);
  const systemState = useTwinStore((s) => s.systemState);
  const health = useTwinStore((s) => s.health);
  const connection = useTwinStore((s) => s.connection);
  const lastError = useTwinStore((s) => s.lastError);
  const forecastBusy = useTwinStore((s) => s.forecastBusy);
  const assessBusy = useTwinStore((s) => s.assessBusy);
  const lastAssessment = useTwinStore((s) => s.lastAssessment);
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  const view = useTwinStore((s) => s.view);
  const setView = useTwinStore((s) => s.setView);
  const hasCadMagnet = Boolean(import.meta.env.VITE_MAGNET_CAD_URL?.trim());

  const [showDashboard, setShowDashboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLaunch, setShowLaunch] = useState(shouldPlayLaunchIntro);
  const [viewportTool, setViewportTool] = useState<ViewportToolId>("magnet");
  const [stageMode, setStageMode] = useState<"magnet" | "camera">("magnet");
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [yawHistory, setYawHistory] = useState<number[]>([]);
  const [pitchHistory, setPitchHistory] = useState<number[]>([]);
  const [rollHistory, setRollHistory] = useState<number[]>([]);
  const [expandedCard, setExpandedCard] = useState<DashboardCard | null>(null);
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [timeHistory, setTimeHistory] = useState<number[]>([]);
  const [showRawSensors, setShowRawSensors] = useState(false);

  const [horizonS, setHorizonS] = useState(60);
  const [setpointC, setSetpointC] = useState("26");
  const [heatingRate, setHeatingRate] = useState("0");
  const [usePinn, setUsePinn] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [assessMode, setAssessMode] = useState<AssessMode>("observe");
  const [assessError, setAssessError] = useState<string | null>(null);

  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const [panelCollapsed, setPanelCollapsed] = useState(readPanelCollapsed);
  const [panelResizing, setPanelResizing] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>(readPanelMode);
  const [workspace, setWorkspace] = useState<WorkspaceId>(readWorkspace);
  const mainRef = useRef<HTMLElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    persistWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  useEffect(() => {
    void import("./twin/TwinCanvas");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [panelCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_MODE_KEY, panelMode);
    } catch {
      /* ignore */
    }
  }, [panelMode]);

  function switchPanelMode(mode: PanelMode) {
    setPanelMode(mode);
    if (mode === "agents") {
      setPanelCollapsed(false);
      setPanelWidth((w) => Math.max(w, PANEL_CHAT_MIN_WIDTH));
    }
  }

  const motionShareRequestId = useHeadMotionStore((s) => s.shareRequestId);
  useEffect(() => {
    if (motionShareRequestId <= 0) return;
    switchPanelMode("agents");
  }, [motionShareRequestId]);

  useEffect(() => {
    const onWinResize = () => {
      const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
      setPanelWidth((w) => clampPanelWidth(w, mainW));
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStart.current = { x: e.clientX, width: panelWidth };
    setPanelResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelWidth]);

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
    const delta = resizeStart.current.x - e.clientX;
    setPanelWidth(clampPanelWidth(resizeStart.current.width + delta, mainW));
  }, []);

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    setPanelResizing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onResizeDoubleClick = useCallback(() => {
    const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
    setPanelWidth(clampPanelWidth(PANEL_DEFAULT_WIDTH, mainW));
  }, []);

  useEffect(() => attachDtamTelemetryDriver(1500), []);
  useEffect(() => {
    setTempHistory((s) => [...s.slice(-HISTORY_POINTS + 1), telemetry.magnet_temp_C]);
    setTimeHistory((s) => [...s.slice(-HISTORY_POINTS + 1), telemetry.device_time_ms]);
  }, [telemetry.device_time_ms, telemetry.magnet_temp_C]);

  const rangeStart = timeHistory[0] ?? telemetry.device_time_ms;
  const rangeEnd = timeHistory[timeHistory.length - 1] ?? telemetry.device_time_ms;

  const peakHz = systemState?.emi?.peak_frequency_hz?.value ?? 50_000;
  const emiRms = systemState?.emi?.rms_v?.value ?? 0.01;
  const phase = telemetry.device_time_ms / 1000;
  const johnsonTempC =
    systemState?.thermal?.mean_magnet_temperature_c?.value ?? telemetry.magnet_temp_C;

  const [johnsonNoise, setJohnsonNoise] = useState(() =>
    sampleJohnsonNoise(johnsonTempC, JOHNSON_SAMPLES),
  );

  // Live random thermal noise while the dashboard (or related card) is visible.
  useEffect(() => {
    if (!showDashboard && expandedCard !== "noiseSpec" && expandedCard !== "noiseTime") return;
    const tick = () => setJohnsonNoise(sampleJohnsonNoise(johnsonTempC, JOHNSON_SAMPLES));
    tick();
    const id = window.setInterval(tick, 90);
    return () => window.clearInterval(id);
  }, [showDashboard, expandedCard, johnsonTempC]);

  const johnsonAbsMax = Math.max(0.15, ...johnsonNoise.map((v) => Math.abs(v))) * 1.15;
  const johnsonMin = -johnsonAbsMax;
  const johnsonMax = johnsonAbsMax;

  const johnsonSpectrum = useMemo(() => dftMagnitudeSpectrum(johnsonNoise), [johnsonNoise]);
  const johnsonSpecMax = Math.max(0.02, ...johnsonSpectrum) * 1.12;

  // Map peak frequency into FFT bin for highlight (log-ish 1 kHz–100 kHz).
  const emiBin = useMemo(() => {
    const lo = Math.log10(1e3);
    const hi = Math.log10(1e5);
    const t = (Math.log10(Math.max(peakHz, 1e3)) - lo) / (hi - lo);
    return Math.round(Math.min(1, Math.max(0, t)) * (FFT_BINS - 1));
  }, [peakHz]);

  const mriSpectrum = useMemo(
    () =>
      Array.from({ length: FFT_BINS }, (_, i) => {
        const f = i / FFT_BINS;
        const carrier = 0.12 + 0.45 * Math.exp(-Math.pow((f - 0.48) / 0.09, 2));
        const sideA = 0.18 * Math.exp(-Math.pow((f - 0.27) / 0.05, 2));
        const sideB = 0.14 * Math.exp(-Math.pow((f - 0.68) / 0.06, 2));
        const shimmer = 0.03 * Math.sin(phase * 4 + i * 0.25);
        const emiHit = Math.abs(i - emiBin) <= 1 ? 0.35 * Math.min(1.5, emiRms / 0.01) : 0;
        return Math.max(0.01, carrier + sideA + sideB + shimmer + emiHit);
      }),
    [phase, emiBin, emiRms],
  );

  const mriSpecMin = 0;
  const mriSpecMax = Math.max(0.2, ...mriSpectrum) * 1.05;

  const expandedTitle =
    expandedCard === "temp"
      ? "Temperature vs Time"
      : expandedCard === "noiseTime"
        ? "Johnson noise spectrum (DFT magnitude)"
        : expandedCard === "noiseSpec"
          ? "Johnson / thermal noise (time domain)"
          : expandedCard === "mriSpec"
            ? "MRI Signal Frequency Spectrum (EMI Highlighted)"
            : expandedCard === "camPreview"
              ? "Camera preview"
              : expandedCard === "yaw"
                ? "Head yaw vs time"
                : expandedCard === "pitch"
                  ? "Head pitch vs time"
                  : expandedCard === "roll"
                    ? "Head roll vs time"
                    : "";

  const thermal = systemState?.thermal ?? null;
  const magnetic = systemState?.magnetic ?? null;
  const emi = systemState?.emi ?? null;
  const rf = systemState?.rf ?? null;
  const connected = connection === "connected" && (health?.connected ?? false);

  async function onForecast(e: FormEvent) {
    e.preventDefault();
    setForecastError(null);
    const setpoint = setpointC.trim() === "" ? null : Number(setpointC);
    const rate = Number(heatingRate);
    if (!(horizonS > 0)) {
      setForecastError("Horizon must be > 0 seconds");
      return;
    }
    try {
      await requestForecast({
        predict_horizon_s: horizonS,
        magnet_heating_rate_c_per_s: Number.isFinite(rate) ? rate : 0,
        magnet_setpoint_c: setpoint != null && Number.isFinite(setpoint) ? setpoint : null,
        use_thermal_pinn: usePinn,
      });
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onAssess() {
    setAssessError(null);
    try {
      await requestAssess(assessMode);
    } catch (err) {
      setAssessError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onLoadRawSensors() {
    setShowRawSensors(true);
    await refreshSensorsBatch();
  }

  const tempMin = Math.min(20, ...tempHistory, telemetry.magnet_temp_C) - 0.5;
  const tempMax = Math.max(26, ...tempHistory, telemetry.magnet_temp_C) + 0.5;

  function onViewportToolChange(id: ViewportToolId) {
    setViewportTool(id);
    if (id === "camera") {
      setStageMode("camera");
      setExpandedCard(null);
    }
    if (id === "magnet") {
      setStageMode("magnet");
      setCameraPreviewStream(null);
      setYawHistory([]);
      setPitchHistory([]);
      setRollHistory([]);
      setExpandedCard(null);
    }
  }

  const showDashboardRef = useRef(showDashboard);
  showDashboardRef.current = showDashboard;

  function onCameraPoseUpdate(pose: HeadPose) {
    if (!showDashboardRef.current) return;
    setYawHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.yaw]);
    setPitchHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.pitch]);
    setRollHistory((s) => [...s.slice(-(POSE_HISTORY_POINTS - 1)), pose.roll]);
  }

  const yawMin = Math.min(-30, ...yawHistory, -5) - 2;
  const yawMax = Math.max(30, ...yawHistory, 5) + 2;
  const pitchMin = Math.min(-30, ...pitchHistory, -5) - 2;
  const pitchMax = Math.max(30, ...pitchHistory, 5) + 2;
  const rollMin = Math.min(-30, ...rollHistory, -5) - 2;
  const rollMax = Math.max(30, ...rollHistory, 5) + 2;

  return (
    <div className="shell">
      {showLaunch ? <LaunchScreen onComplete={() => setShowLaunch(false)} /> : null}
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-mark"
            src="/logos/adelpha-gradient-logo.svg"
            alt=""
            width={44}
            height={32}
            aria-hidden
          />
          <div className="brand-copy">
            <div className="title">Adelpha</div>
            <div className="subtitle">The Intelligent Magnetic Resonance Framework</div>
          </div>
        </div>
        <div className="topbar-right">
          <TopbarControls
            scannerId={health?.scanner_id ?? systemState?.scanner_id ?? "—"}
            mode={health?.mode ?? systemState?.mode ?? "—"}
            twinVersion={systemState?.twin_version ?? "—"}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
          />
          <div className="topbar-actions">
            <button
              type="button"
              className={`topbar-icon-btn${showSettings ? " is-open" : ""}`}
              aria-label="Settings"
              title="Settings"
              aria-expanded={showSettings}
              aria-controls="settings-card"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <TopbarAppMenu workspace={workspace} />
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        className={`main${panelResizing ? " main-resizing" : ""}${panelCollapsed ? " main-panel-collapsed" : ""}${
          workspace !== "digital-twin" ? " main-alt-workspace" : ""
        }`}
        style={
          panelCollapsed
            ? undefined
            : ({ ["--panel-width" as string]: `${panelWidth}px` } as CSSProperties)
        }
      >
        {workspace === "imaging-console" ? (
          <Suspense fallback={null}>
            <ImagingConsole />
          </Suspense>
        ) : workspace !== "digital-twin" ? (
          <section className="workspace-placeholder" aria-label="Workspace placeholder">
            <div className="workspace-placeholder-card">
              <h2>Engineering Studio</h2>
              <p>
                This workspace shell is ready. Switch back to{" "}
                <button
                  type="button"
                  className="workspace-placeholder-link"
                  onClick={() => setWorkspace("digital-twin")}
                >
                  Digital Twin
                </button>{" "}
                for live telemetry, the magnet viewport, and Agents.
              </p>
            </div>
          </section>
        ) : null}
        <section className="viewport">
          <div className="viewport-stage">
          <ViewportToolRail active={viewportTool} onActiveChange={onViewportToolChange} />
          <button
            type="button"
            className="viewport-dashboard-btn"
            onClick={() => setShowDashboard((v) => !v)}
          >
            {showDashboard ? "Hide live dashboard" : "Open live dashboard"}
          </button>
          {showLaunch ? null : stageMode === "camera" ? (
            <Suspense fallback={null}>
              <CameraFeed
                sharePreview={showDashboard}
                onPoseUpdate={onCameraPoseUpdate}
                onPreviewStreamChange={setCameraPreviewStream}
              />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <TwinCanvas />
            </Suspense>
          )}
          {showDashboard ? (
            <div className="liquid-dashboard">
              <div className="dash-grid">
                {stageMode === "camera" ? (
                  <>
                    <button
                      type="button"
                      className="dash-card"
                      onClick={() => setExpandedCard("camPreview")}
                    >
                      <div className="dash-title">
                        Camera preview{" "}
                        <span className="dash-stamp-inline">live duplicate</span>
                      </div>
                      <DashCameraPreview stream={cameraPreviewStream} />
                    </button>

                    <button type="button" className="dash-card" onClick={() => setExpandedCard("yaw")}>
                      <div className="dash-title">
                        Yaw{" "}
                        <span className="dash-stamp-inline">
                          {yawHistory.length ? `${yawHistory[yawHistory.length - 1]!.toFixed(1)}°` : "—"}
                        </span>
                      </div>
                      <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                        <path
                          d={linePath(yawHistory, yawMin, yawMax, 300, 88)}
                          className="dash-line dash-line-spectrum dash-line-pose-yaw"
                        />
                      </svg>
                      <div className="dash-stamp-row">
                        <span>left</span>
                        <span>time</span>
                        <span>right</span>
                      </div>
                    </button>

                    <button type="button" className="dash-card" onClick={() => setExpandedCard("pitch")}>
                      <div className="dash-title">
                        Pitch{" "}
                        <span className="dash-stamp-inline">
                          {pitchHistory.length
                            ? `${pitchHistory[pitchHistory.length - 1]!.toFixed(1)}°`
                            : "—"}
                        </span>
                      </div>
                      <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                        <path
                          d={linePath(pitchHistory, pitchMin, pitchMax, 300, 88)}
                          className="dash-line dash-line-spectrum dash-line-pose-pitch"
                        />
                      </svg>
                      <div className="dash-stamp-row">
                        <span>down</span>
                        <span>time</span>
                        <span>up</span>
                      </div>
                    </button>

                    <button type="button" className="dash-card" onClick={() => setExpandedCard("roll")}>
                      <div className="dash-title">
                        Roll{" "}
                        <span className="dash-stamp-inline">
                          {rollHistory.length
                            ? `${rollHistory[rollHistory.length - 1]!.toFixed(1)}°`
                            : "—"}
                        </span>
                      </div>
                      <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                        <path
                          d={linePath(rollHistory, rollMin, rollMax, 300, 88)}
                          className="dash-line dash-line-spectrum dash-line-pose-roll"
                        />
                      </svg>
                      <div className="dash-stamp-row">
                        <span>tilt −</span>
                        <span>time</span>
                        <span>tilt +</span>
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                <button type="button" className="dash-card" onClick={() => setExpandedCard("temp")}>
                  <div className="dash-title">Magnet temperature (time)</div>
                  <svg viewBox="0 0 300 88" className="dash-svg">
                    <path
                      d={linePath(tempHistory, tempMin, tempMax, 300, 88)}
                      className="dash-line dash-line-temp"
                    />
                  </svg>
                  <div className="dash-stamp-row">
                    <span>{formatTs(rangeStart)}</span>
                    <span>{formatTs(rangeEnd)}</span>
                  </div>
                </button>

                <button type="button" className="dash-card" onClick={() => setExpandedCard("noiseTime")}>
                  <div className="dash-title">
                    Johnson noise spectrum{" "}
                    <span className="dash-stamp-inline">DFT · √T</span>
                  </div>
                  <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                    <path
                      d={linePath(johnsonSpectrum, 0, johnsonSpecMax, 300, 88)}
                      className="dash-line dash-line-spectrum dash-line-noise"
                    />
                  </svg>
                  <div className="dash-stamp-row">
                    <span>0</span>
                    <span>|X(f)|</span>
                    <span>Nyquist</span>
                  </div>
                </button>

                <button type="button" className="dash-card" onClick={() => setExpandedCard("noiseSpec")}>
                  <div className="dash-title">
                    Johnson noise (time){" "}
                    <span className="dash-stamp-inline">
                      √T · {formatTempC(johnsonTempC, 1)}
                    </span>
                  </div>
                  <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                    <path
                      d={linePath(johnsonNoise, johnsonMin, johnsonMax, 300, 88)}
                      className="dash-line dash-line-spectrum dash-line-noise"
                    />
                  </svg>
                  <div className="dash-stamp-row">
                    <span>0</span>
                    <span>thermal / Gaussian</span>
                    <span>t</span>
                  </div>
                </button>

                <button type="button" className="dash-card" onClick={() => setExpandedCard("mriSpec")}>
                  <div className="dash-title">
                    MRI signal spectrum (EMI @ {formatHz(peakHz)}){" "}
                    <span className="dash-stamp-inline">{formatTs(telemetry.device_time_ms)}</span>
                  </div>
                  <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                    <line
                      x1={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
                      y1="0"
                      x2={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
                      y2="88"
                      className="dash-emi-marker"
                    />
                    <path
                      d={linePath(mriSpectrum, mriSpecMin, mriSpecMax, 300, 88)}
                      className="dash-line dash-line-spectrum dash-line-mri"
                    />
                  </svg>
                  <div className="dash-stamp-row">
                    <span>1 kHz</span>
                    <span>EMI</span>
                    <span>100 kHz</span>
                  </div>
                </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
          {expandedCard ? (
            <div className="chart-modal-backdrop" onClick={() => setExpandedCard(null)}>
              <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
                <div className="chart-modal-head">
                  <div className="chart-modal-title">{expandedTitle}</div>
                  <button type="button" className="chart-modal-close" onClick={() => setExpandedCard(null)}>
                    Close
                  </button>
                </div>

                {expandedCard === "temp" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <text x="402" y="398" className="axis-label">
                      Time
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Temperature (°C)
                    </text>
                    <path
                      d={linePathOffset(tempHistory, tempMin, tempMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-temp"
                    />
                    <text x="64" y="380" className="axis-tick">
                      {formatTs(rangeStart)}
                    </text>
                    <text x="640" y="380" className="axis-tick">
                      {formatTs(rangeEnd)}
                    </text>
                  </svg>
                ) : expandedCard === "noiseTime" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <text x="402" y="398" className="axis-label">
                      Frequency bin
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      |X(f)|
                    </text>
                    <path
                      d={linePathOffset(johnsonSpectrum, 0, johnsonSpecMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-noise"
                    />
                    <text x="64" y="380" className="axis-tick">
                      0
                    </text>
                    <text x="300" y="380" className="axis-tick">
                      DFT of Johnson noise
                    </text>
                    <text x="640" y="380" className="axis-tick">
                      Nyquist
                    </text>
                  </svg>
                ) : expandedCard === "noiseSpec" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
                    <text x="402" y="398" className="axis-label">
                      Time
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Voltage (a.u.)
                    </text>
                    <path
                      d={linePathOffset(johnsonNoise, johnsonMin, johnsonMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-noise"
                    />
                    <text x="64" y="380" className="axis-tick">
                      0
                    </text>
                    <text x="320" y="380" className="axis-tick">
                      Johnson–Nyquist · {formatTempC(johnsonTempC, 1)}
                    </text>
                    <text x="700" y="380" className="axis-tick">
                      t
                    </text>
                  </svg>
                ) : expandedCard === "mriSpec" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <text x="402" y="398" className="axis-label">
                      Frequency
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Magnitude
                    </text>
                    <line
                      x1={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676}
                      y1="30"
                      x2={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676}
                      y2="360"
                      className="dash-emi-marker"
                    />
                    <path
                      d={linePathOffset(mriSpectrum, mriSpecMin, mriSpecMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-mri"
                    />
                    <text x="64" y="380" className="axis-tick">
                      1 kHz
                    </text>
                    <text
                      x={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676 - 20}
                      y="380"
                      className="axis-tick"
                    >
                      {formatHz(peakHz)}
                    </text>
                    <text x="640" y="380" className="axis-tick">
                      100 kHz
                    </text>
                  </svg>
                ) : expandedCard === "camPreview" ? (
                  <div className="chart-modal-camera">
                    <DashCameraPreview stream={cameraPreviewStream} expanded />
                  </div>
                ) : expandedCard === "yaw" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
                    <text x="402" y="398" className="axis-label">
                      Time
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Yaw (°)
                    </text>
                    <path
                      d={linePathOffset(yawHistory, yawMin, yawMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-pose-yaw"
                    />
                    <text x="64" y="380" className="axis-tick">
                      left
                    </text>
                    <text x="360" y="380" className="axis-tick">
                      {yawHistory.length
                        ? `${yawHistory[yawHistory.length - 1]!.toFixed(1)}°`
                        : "—"}
                    </text>
                    <text x="700" y="380" className="axis-tick">
                      right
                    </text>
                  </svg>
                ) : expandedCard === "pitch" ? (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
                    <text x="402" y="398" className="axis-label">
                      Time
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Pitch (°)
                    </text>
                    <path
                      d={linePathOffset(pitchHistory, pitchMin, pitchMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-pose-pitch"
                    />
                    <text x="64" y="380" className="axis-tick">
                      down
                    </text>
                    <text x="360" y="380" className="axis-tick">
                      {pitchHistory.length
                        ? `${pitchHistory[pitchHistory.length - 1]!.toFixed(1)}°`
                        : "—"}
                    </text>
                    <text x="700" y="380" className="axis-tick">
                      up
                    </text>
                  </svg>
                ) : (
                  <svg viewBox="0 0 780 420" className="chart-modal-svg">
                    <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
                    <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
                    <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
                    <text x="402" y="398" className="axis-label">
                      Time
                    </text>
                    <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
                      Roll (°)
                    </text>
                    <path
                      d={linePathOffset(rollHistory, rollMin, rollMax, 676, 330, 64, 30)}
                      className="dash-line dash-line-spectrum dash-line-pose-roll"
                    />
                    <text x="64" y="380" className="axis-tick">
                      tilt −
                    </text>
                    <text x="360" y="380" className="axis-tick">
                      {rollHistory.length
                        ? `${rollHistory[rollHistory.length - 1]!.toFixed(1)}°`
                        : "—"}
                    </text>
                    <text x="700" y="380" className="axis-tick">
                      tilt +
                    </text>
                  </svg>
                )}
              </div>
            </div>
          ) : null}
          </div>
          <SystemConsole />
        </section>

        {panelCollapsed ? (
          <div
            className="panel-edge panel-edge-rail"
            role="separator"
            aria-orientation="vertical"
            aria-label="Expand side panel"
            title="Expand side panel"
            onClick={() => setPanelCollapsed(false)}
          >
            <button
              type="button"
              className="panel-collapse-btn"
              aria-label="Expand side panel"
              onClick={(e) => {
                e.stopPropagation();
                setPanelCollapsed(false);
              }}
            >
              ◂
            </button>
          </div>
        ) : (
          <aside className={`panel${panelMode === "agents" ? " panel-agents" : ""}`}>
            <div
              className="panel-edge"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel"
              aria-valuenow={panelWidth}
              title="Drag to resize · double-click to reset"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={onResizeDoubleClick}
            >
              <button
                type="button"
                className="panel-collapse-btn"
                aria-label="Collapse side panel"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelCollapsed(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                ▸
              </button>
            </div>

            <div className="panel-mode-bar" role="tablist" aria-label="Side panel mode">
              <button
                type="button"
                role="tab"
                aria-selected={panelMode === "telemetry"}
                className={`panel-mode-btn${panelMode === "telemetry" ? " panel-mode-btn-active" : ""}`}
                onClick={() => switchPanelMode("telemetry")}
              >
                Telemetry
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelMode === "agents"}
                className={`panel-mode-btn${panelMode === "agents" ? " panel-mode-btn-active" : ""}`}
                onClick={() => switchPanelMode("agents")}
              >
                Agents
              </button>
            </div>

            {panelMode === "agents" ? (
              <Suspense fallback={null}>
                <AgentChatPanel systemState={systemState} />
              </Suspense>
            ) : (
              <>
          {lastError ? (
            <div className="error-banner" role="status">
              {lastError}
            </div>
          ) : null}

          <div className="info-card-stack">
            <InfoCard title="Thermal">
              <QuantityRow
                label="Mean magnet"
                q={thermal?.mean_magnet_temperature_c}
                format={(v) => formatTempC(v)}
              />
              <QuantityRow
                label="Room"
                q={thermal?.room_temperature_c}
                format={(v) => formatTempC(v)}
              />
              <QuantityRow
                label="ΔT vs ref"
                q={thermal?.delta_magnet_temperature_c}
                format={(v) => formatTempC(v)}
              />
              <MetricRow
                label="Reference"
                value={
                  thermal?.reference_magnet_temperature_c != null
                    ? formatTempC(thermal.reference_magnet_temperature_c, 1)
                    : "—"
                }
              />
              <QuantityRow
                label="Gradient"
                q={thermal?.thermal_gradient_c}
                format={(v) => formatTempC(v)}
              />
              <QuantityRow
                label="Predicted mean"
                q={thermal?.predicted_mean_magnet_temperature_c}
                format={(v) => formatTempC(v)}
              />
              {thermal?.channels?.length ? (
                <details className="metric-group" open>
                  <summary className="metric-group-summary">Channels</summary>
                  <div className="metric-group-body">
                    {thermal.channels.map((ch) => (
                      <QuantityRow
                        key={ch.channel_id ?? ch.timestamp}
                        label={ch.channel_id ?? "channel"}
                        q={ch}
                        format={(v) => formatTempC(v)}
                        nested
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </InfoCard>

            <InfoCard
              title="Magnetic / B₀"
              footer={
                <p className="physics-note">
                  Thermal → B₀: ΔB₀ ≈ α<sub>T</sub> · ΔT (default α<sub>T</sub> ≈ −5×10⁻⁵ T/°C).
                  Frequency in MHz.
                </p>
              }
            >
              <QuantityRow
                label="Nominal B₀"
                bare={magnetic ? formatB0T(magnetic.nominal_b0_t) : null}
                format={formatB0T}
              />
              <QuantityRow label="Estimated B₀" q={magnetic?.b0_t} format={formatB0T} />
              <QuantityRow label="ΔB₀" q={magnetic?.delta_b0_t} format={formatB0T} />
              <QuantityRow
                label="f₀"
                q={magnetic?.resonant_frequency_mhz}
                format={(v) => formatFreqMHz(v)}
              />
              <QuantityRow label="Predicted B₀" q={magnetic?.predicted_b0_t} format={formatB0T} />
              <QuantityRow
                label="Predicted f₀"
                q={magnetic?.predicted_frequency_mhz}
                format={(v) => formatFreqMHz(v)}
              />
            </InfoCard>

            <InfoCard title="EMI">
              <QuantityRow label="RMS" q={emi?.rms_v} format={(v) => formatRmsV(v)} />
              <QuantityRow
                label="Peak freq"
                q={emi?.peak_frequency_hz}
                format={(v) => formatHz(v)}
              />
              <MetricRow label="Class" value={emi?.classification_label ?? "—"} />
            </InfoCard>

            <InfoCard title="RF noise">
              <QuantityRow
                label="Noise floor"
                q={rf?.noise_floor_dbm_per_hz}
                format={(v) => formatNoiseFloor(v)}
              />
              <MetricRow
                label="Bandwidth"
                value={rf?.noise_bandwidth_hz != null ? formatHz(rf.noise_bandwidth_hz) : "—"}
              />
              <QuantityRow
                label="SNR est."
                q={rf?.snr_estimate_db}
                format={(v) => `${v.toFixed(2)} dB`}
              />
            </InfoCard>

            <InfoCard title="Forecast">
              <form className="forecast-form" onSubmit={onForecast}>
                <label className="control">
                  <span>Horizon (s)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={horizonS}
                    onChange={(e) => setHorizonS(Number(e.target.value))}
                  />
                </label>
                <label className="control">
                  <span>Magnet setpoint (°C, optional)</span>
                  <input
                    type="number"
                    step={0.1}
                    value={setpointC}
                    onChange={(e) => setSetpointC(e.target.value)}
                    placeholder="e.g. 26"
                  />
                </label>
                <label className="control">
                  <span>Heating rate (°C/s)</span>
                  <input
                    type="number"
                    step={0.001}
                    value={heatingRate}
                    onChange={(e) => setHeatingRate(e.target.value)}
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={usePinn}
                    onChange={(e) => setUsePinn(e.target.checked)}
                  />
                  <span>Prefer thermal PINN when available</span>
                </label>
                <button type="submit" className="action-btn" disabled={forecastBusy || !connected}>
                  {forecastBusy ? "Running forecast…" : "Run forecast"}
                </button>
                {forecastError ? <div className="error-banner">{forecastError}</div> : null}
              </form>
            </InfoCard>

            <InfoCard title="Assess">
              <label className="control">
                <span>Mode</span>
                <select
                  className="assess-mode-select"
                  value={assessMode}
                  onChange={(e) => setAssessMode(e.target.value as AssessMode)}
                >
                  <option value="observe">observe</option>
                  <option value="recommend">recommend</option>
                </select>
              </label>
              <button
                type="button"
                className="action-btn"
                disabled={assessBusy || !connected}
                onClick={() => void onAssess()}
              >
                {assessBusy ? "Assessing…" : "Assess live twin"}
              </button>
              {assessError ? <div className="error-banner">{assessError}</div> : null}
              {lastAssessment ? (
                <div className="assess-summary">
                  <MetricRow
                    label="Status"
                    value={String(lastAssessment.overall_status ?? "—")}
                  />
                  <MetricRow
                    label="Confidence"
                    value={
                      lastAssessment.overall_confidence != null
                        ? `${(lastAssessment.overall_confidence * 100).toFixed(0)}%`
                        : "—"
                    }
                  />
                  <MetricRow
                    label="Findings"
                    value={String(lastAssessment.findings?.length ?? 0)}
                  />
                  <MetricRow
                    label="Agents"
                    value={(lastAssessment.activated_agents ?? []).join(", ") || "—"}
                  />
                  {lastAssessment.explanation ? (
                    <p className="physics-note">{lastAssessment.explanation}</p>
                  ) : null}
                  {lastAssessment.findings?.length ? (
                    <ul className="notes-list">
                      {lastAssessment.findings.slice(0, 5).map((f, i) => (
                        <li key={`${f.code ?? "f"}-${i}`}>
                          {f.severity ? `[${f.severity}] ` : ""}
                          {f.summary ?? f.code ?? "finding"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </InfoCard>

            {systemState?.notes?.length ? (
              <InfoCard title="Notes">
                <ul className="notes-list">
                  {systemState.notes.map((n, i) => (
                    <li key={`${i}-${n.slice(0, 24)}`}>{n}</li>
                  ))}
                </ul>
              </InfoCard>
            ) : null}

            <InfoCard title="Raw sensors">
              <button type="button" className="action-btn" onClick={() => void onLoadRawSensors()}>
                {showRawSensors ? "Refresh /sensors/batch" : "Load /sensors/batch"}
              </button>
              {showRawSensors && sensorsBatch?.measurements?.length ? (
                <div className="raw-table-wrap">
                  <table className="raw-table">
                    <thead>
                      <tr>
                        <th>Sensor</th>
                        <th>Quantity</th>
                        <th>Value</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensorsBatch.measurements.map((m) => (
                        <tr key={m.measurement_id}>
                          <td>{m.sensor_id}</td>
                          <td>{m.quantity}</td>
                          <td className="num">{m.value.toPrecision(5)}</td>
                          <td>{m.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </InfoCard>

            <InfoCard title="View">
              <label className="control">
                <span>Exploded magnet</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={view.exploded}
                  onChange={(e) => setView({ exploded: Number(e.target.value) })}
                />
              </label>
              {hasCadMagnet ? (
                <>
                  <label className="control">
                    <span>
                      Model scale{" "}
                      <span className="muted">({view.magnet_cad_scale.toPrecision(4)}×)</span>
                    </span>
                    <input
                      type="range"
                      min={0.0001}
                      max={0.25}
                      step={0.0001}
                      value={Math.min(Math.max(view.magnet_cad_scale, 0.0001), 0.25)}
                      onChange={(e) => setView({ magnet_cad_scale: Number(e.target.value) })}
                    />
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={view.wireframe}
                      onChange={(e) => setView({ wireframe: e.target.checked })}
                    />
                    <span>Wireframe mode</span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={view.hybrid_render}
                      onChange={(e) => setView({ hybrid_render: e.target.checked })}
                    />
                    <span>Hybrid render (solid + wireframe)</span>
                  </label>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setView({ show_temperature_map: !view.show_temperature_map })}
                  >
                    {view.show_temperature_map ? "Hide temperature map" : "Show temperature map"}
                  </button>
                </>
              ) : null}
            </InfoCard>
          </div>
              </>
            )}
        </aside>
        )}
        {showSettings ? (
          <div
            className="settings-overlay"
            onClick={() => setShowSettings(false)}
          >
            <div
              id="settings-card"
              className="settings-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-card-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-card-head">
                <h2 id="settings-card-title" className="settings-card-title">
                  Settings
                </h2>
                <button
                  type="button"
                  className="settings-card-close"
                  aria-label="Close settings"
                  title="Close"
                  onClick={() => setShowSettings(false)}
                >
                  <X size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <div className="settings-card-body" />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
