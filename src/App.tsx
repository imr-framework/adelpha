import { Settings } from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import {
  formatB0T,
  formatFreqMHz,
  formatHz,
  formatNoiseFloor,
  formatRmsV,
  formatTempC,
} from "./twin/format";
import { useDashboardSeries } from "./twin/dashboard/useDashboardSeries";
import { LiveDashboard } from "./twin/dashboard/LiveDashboard";
import { ExpandedChartModal } from "./twin/dashboard/ExpandedChartModal";
import type { DashboardCard } from "./twin/dashboard/types";
import { InfoCard, MetricRow, QuantityRow } from "./twin/panel/metrics";
import {
  clampPanelWidth,
  PANEL_CHAT_MIN_WIDTH,
  PANEL_COLLAPSED_KEY,
  PANEL_DEFAULT_WIDTH,
  PANEL_MODE_KEY,
  PANEL_WIDTH_KEY,
  readPanelCollapsed,
  readPanelMode,
  readPanelWidth,
  type PanelMode,
} from "./twin/panel/panelPrefs";
import {
  attachDtamTelemetryDriver,
  refreshSensorsBatch,
  requestAssess,
  requestForecast,
  scaleForScannerModel,
  useTwinStore,
} from "./twin/telemetryStore";
import { SystemConsole } from "./twin/SystemConsole";
import { ViewportToolRail, type ViewportToolId } from "./twin/ViewportToolRail";
import { ViewportContextMenu } from "./twin/ViewportContextMenu";
import { PartInspectorCard } from "./twin/PartInspectorCard";
import { PartVisibilityTray } from "./twin/PartVisibilityTray";
import { useHeadMotionStore } from "./twin/headMotionStore";
import {
  persistWorkspace,
  TopbarAppMenu,
  TopbarControls,
  type WorkspaceId,
} from "./twin/TopbarControls";
import type { AssessMode } from "./twin/dtamTypes";
import { SettingsCard } from "./twin/SettingsCard";
import { subscribeOpenSettings, type SettingsLaunch } from "./twin/settingsOpen";
import {
  cadExplodesParts,
  cadForScanner,
  MAGNET_CAD_SCALE_MAX,
  MAGNET_CAD_SCALE_MIN,
  setScannerModel,
  useScannerCatalog,
  useScannerModel,
} from "./twin/scannerModel";
import { ErrorBoundary } from "./twin/ErrorBoundary";
import { isImportedModelId } from "./twin/importedModels";
import { useCadPerfStore } from "./twin/cadPerf";
import { usePolishedFinish } from "./twin/useModelColors";
import { applyConsoleTheme, readConsoleTheme } from "./twin/consoleTheme";
import { resolveLaunchWorkspace, useWorkspacePrefs } from "./twin/workspacePrefs";
import { scheduleAutoUpdateCheck } from "./desktop/updater";
import "./styles.css";
import "./settings.css";

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
const EngineeringStudio = lazy(() =>
  import("./twin/EngineeringStudio").then((m) => ({ default: m.EngineeringStudio })),
);

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
  const [scannerId] = useScannerModel();
  const catalog = useScannerCatalog();
  const hasCadMagnet = Boolean(cadForScanner(scannerId));
  const explodePartCount = useCadPerfStore((s) => s.explodePartCount);
  const [polishedFinish, setPolishedFinish] = usePolishedFinish();

  useEffect(() => scheduleAutoUpdateCheck(), []);

  const [showDashboard, setShowDashboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLaunch, setSettingsLaunch] = useState<SettingsLaunch | null>(null);
  const [viewportTool, setViewportTool] = useState<ViewportToolId>("magnet");
  const [stageMode, setStageMode] = useState<"magnet" | "camera">("magnet");
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [expandedCard, setExpandedCard] = useState<DashboardCard | null>(null);
  const [showRawSensors, setShowRawSensors] = useState(false);

  const [horizonS, setHorizonS] = useState(60);
  const [setpointC, setSetpointC] = useState("26");
  const [heatingRate, setHeatingRate] = useState("0");
  const [usePinn, setUsePinn] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [assessMode, setAssessMode] = useState<AssessMode>("observe");
  const [assessError, setAssessError] = useState<string | null>(null);

  const [workspacePrefs] = useWorkspacePrefs();
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const [panelCollapsed, setPanelCollapsed] = useState(readPanelCollapsed);
  const [panelResizing, setPanelResizing] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>(readPanelMode);
  const [workspace, setWorkspace] = useState<WorkspaceId>(resolveLaunchWorkspace);
  const mainRef = useRef<HTMLElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    persistWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    if (workspacePrefs.restoreLayout) return;
    setWorkspace(workspacePrefs.startupWorkspace);
    setPanelCollapsed(false);
  }, [workspacePrefs.restoreLayout, workspacePrefs.startupWorkspace]);

  useEffect(() => {
    if (workspacePrefs.rememberPanel) return;
    setPanelWidth(PANEL_DEFAULT_WIDTH);
  }, [workspacePrefs.rememberPanel]);

  useEffect(() => {
    applyConsoleTheme(readConsoleTheme());
  }, []);

  useEffect(() => {
    setView({ magnet_cad_scale: scaleForScannerModel(scannerId) });
  }, [scannerId, catalog, setView]);

  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
        setSettingsLaunch(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  // The settings workspace is opaque, so the twin behind it must also leave the
  // tab order — aria-modal alone does not stop keyboard focus reaching it.
  useEffect(() => {
    const root = mainRef.current;
    if (!root || !showSettings) return;
    const behind = [...root.children].filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && !el.classList.contains("settings-overlay"),
    );
    for (const el of behind) el.inert = true;
    return () => {
      for (const el of behind) el.inert = false;
    };
  }, [showSettings]);

  useEffect(() => {
    return subscribeOpenSettings((launch) => {
      setSettingsLaunch(launch);
      setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    void import("./twin/TwinCanvas");
  }, []);

  useEffect(() => {
    if (!workspacePrefs.rememberPanel) return;
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth, workspacePrefs.rememberPanel]);

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
  const series = useDashboardSeries({
    telemetry,
    systemState,
    showDashboard,
    expandedCard,
  });


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

  function onViewportToolChange(id: ViewportToolId) {
    setViewportTool(id);
    if (id === "camera") {
      setStageMode("camera");
      setExpandedCard(null);
    }
    if (id === "magnet") {
      setStageMode("magnet");
      setCameraPreviewStream(null);
      series.resetPoseHistories();
      setExpandedCard(null);
    }
  }


  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-mark"
            src="/logos/adelpha-gradient-logo.svg"
            alt=""
            width={38}
            height={28}
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
              onClick={() => {
                setShowSettings((open) => {
                  if (open) setSettingsLaunch(null);
                  return !open;
                });
              }}
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
        ) : workspace === "engineering-studio" ? (
          <Suspense fallback={null}>
            <EngineeringStudio />
          </Suspense>
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
          {stageMode === "camera" ? null : (
            <>
              <ViewportContextMenu enabled />
              <div className="part-inspect-stack">
                <PartInspectorCard />
                <PartVisibilityTray />
              </div>
            </>
          )}
          {stageMode === "camera" ? (
            <Suspense fallback={null}>
              <CameraFeed
                sharePreview={showDashboard}
                onPoseUpdate={series.onCameraPoseUpdate}
                onPreviewStreamChange={setCameraPreviewStream}
              />
            </Suspense>
          ) : (
            <ErrorBoundary
              resetKey={scannerId}
              onError={() => {
                if (isImportedModelId(scannerId)) setScannerModel("halbach-48");
              }}
              fallback={
                <div className="viewport-cad-error">
                  <p>Could not load that CAD model. Switching back to a bundled scanner.</p>
                </div>
              }
            >
              <Suspense fallback={null}>
                <TwinCanvas active={workspace === "digital-twin"} />
              </Suspense>
            </ErrorBoundary>
          )}
          {showDashboard ? (
            <LiveDashboard
              series={series}
              stageMode={stageMode}
              cameraPreviewStream={cameraPreviewStream}
              telemetry={telemetry}
              onExpand={setExpandedCard}
            />
          ) : null}
          {expandedCard ? (
            <ExpandedChartModal
              expandedCard={expandedCard}
              series={series}
              cameraPreviewStream={cameraPreviewStream}
              onClose={() => setExpandedCard(null)}
            />
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
                <span>
                  Exploded magnet
                  {explodePartCount >= 2 ? (
                    <span className="muted"> ({explodePartCount} parts)</span>
                  ) : null}
                </span>
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
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.4 }}>
                  {cadExplodesParts(cadForScanner(scannerId))
                    ? explodePartCount === 1
                      ? "This file is a single fused mesh, so exploded view cannot pull bodies apart. Re-export from CAD with each assembly body as its own mesh."
                      : "Separates the largest assembly parts. Fasteners stay put. Right-click the viewport for Inspection mode."
                    : "This scanner ships as a single STL mesh, so exploded view scales the whole magnet. Import a GLB with separate bodies for a true explode."}
                </p>
              ) : null}
              {hasCadMagnet ? (
                <>
                  <label className="control">
                    <span>
                      Model scale{" "}
                      <span className="muted">({view.magnet_cad_scale.toPrecision(4)}×)</span>
                    </span>
                    <input
                      type="range"
                      min={MAGNET_CAD_SCALE_MIN}
                      max={MAGNET_CAD_SCALE_MAX}
                      step={0.0001}
                      value={Math.min(
                        Math.max(view.magnet_cad_scale, MAGNET_CAD_SCALE_MIN),
                        MAGNET_CAD_SCALE_MAX,
                      )}
                      onChange={(e) => setView({ magnet_cad_scale: Number(e.target.value) })}
                    />
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={polishedFinish}
                      onChange={(e) => setPolishedFinish(e.target.checked)}
                    />
                    <span>Polished metal</span>
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
        {/* Opaque, full-height settings workspace. The twin stays mounted behind
            it so switching back does not reload the CAD assembly. */}
        {showSettings ? (
          <div className="settings-overlay">
            <SettingsCard
              launch={settingsLaunch}
              onClose={() => {
                setShowSettings(false);
                setSettingsLaunch(null);
              }}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
