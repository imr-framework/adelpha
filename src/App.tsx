import { Settings } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useDashboardSeries } from "./twin/dashboard/useDashboardSeries";
import { LiveDashboard } from "./twin/dashboard/LiveDashboard";
import { ExpandedChartModal } from "./twin/dashboard/ExpandedChartModal";
import type { DashboardCard } from "./twin/dashboard/types";
import { usePanelLayout } from "./twin/panel/usePanelLayout";
import { SidePanel } from "./twin/panel/SidePanel";
import { TelemetryPanel } from "./twin/panel/TelemetryPanel";
import {
  attachDtamTelemetryDriver,
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
import { SettingsCard } from "./twin/SettingsCard";
import { subscribeOpenSettings, type SettingsLaunch } from "./twin/settingsOpen";
import {
  cadForScanner,
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

  const [workspacePrefs] = useWorkspacePrefs();
  const [workspace, setWorkspace] = useState<WorkspaceId>(resolveLaunchWorkspace);
  const mainRef = useRef<HTMLElement | null>(null);
  const {
    panelWidth,
    panelCollapsed,
    panelResizing,
    panelMode,
    setPanelCollapsed,
    switchPanelMode,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
    onResizeDoubleClick,
  } = usePanelLayout({ mainRef, rememberPanel: workspacePrefs.rememberPanel });

  useEffect(() => {
    persistWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    if (workspacePrefs.restoreLayout) return;
    setWorkspace(workspacePrefs.startupWorkspace);
    setPanelCollapsed(false);
  }, [workspacePrefs.restoreLayout, workspacePrefs.startupWorkspace]);

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

  const motionShareRequestId = useHeadMotionStore((s) => s.shareRequestId);
  useEffect(() => {
    if (motionShareRequestId <= 0) return;
    switchPanelMode("agents");
  }, [motionShareRequestId]);

  useEffect(() => attachDtamTelemetryDriver(1500), []);
  const series = useDashboardSeries({
    telemetry,
    systemState,
    showDashboard,
    expandedCard,
  });


  const connected = connection === "connected" && (health?.connected ?? false);

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

        <SidePanel
          panelWidth={panelWidth}
          panelCollapsed={panelCollapsed}
          panelMode={panelMode}
          systemState={systemState}
          setPanelCollapsed={setPanelCollapsed}
          switchPanelMode={switchPanelMode}
          onResizePointerDown={onResizePointerDown}
          onResizePointerMove={onResizePointerMove}
          onResizePointerUp={onResizePointerUp}
          onResizeDoubleClick={onResizeDoubleClick}
        >
          <TelemetryPanel
            systemState={systemState}
            lastError={lastError}
            connected={connected}
            forecastBusy={forecastBusy}
            assessBusy={assessBusy}
            lastAssessment={lastAssessment}
            sensorsBatch={sensorsBatch}
            view={view}
            setView={setView}
            scannerId={scannerId}
            hasCadMagnet={hasCadMagnet}
            explodePartCount={explodePartCount}
            polishedFinish={polishedFinish}
            setPolishedFinish={setPolishedFinish}
          />
        </SidePanel>
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
