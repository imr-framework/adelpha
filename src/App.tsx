import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";

import { useDashboardSeries } from "./twin/dashboard/useDashboardSeries";
import type { DashboardCard } from "./twin/dashboard/types";
import { usePanelLayout } from "./twin/panel/usePanelLayout";
import { SidePanel } from "./twin/panel/SidePanel";
import { TelemetryPanel } from "./twin/panel/TelemetryPanel";
import { AppTopbar } from "./twin/shell/AppTopbar";
import { EngineeringStudio, ImagingConsole } from "./twin/shell/lazyWorkspaces";
import { SettingsOverlay } from "./twin/shell/SettingsOverlay";
import { TwinViewport } from "./twin/shell/TwinViewport";
import { useSettingsOverlay } from "./twin/shell/useSettingsOverlay";
import {
  attachDtamTelemetryDriver,
  scaleForScannerModel,
  useTwinStore,
} from "./twin/telemetryStore";
import type { ViewportToolId } from "./twin/ViewportToolRail";
import { useHeadMotionStore } from "./twin/headMotionStore";
import { persistWorkspace, type WorkspaceId } from "./twin/TopbarControls";
import { cadForScanner, useScannerCatalog, useScannerModel } from "./twin/scannerModel";
import { useCadPerfStore } from "./twin/cadPerf";
import { usePolishedFinish } from "./twin/useModelColors";
import { applyConsoleTheme, readConsoleTheme } from "./twin/consoleTheme";
import { resolveLaunchWorkspace, useWorkspacePrefs } from "./twin/workspacePrefs";
import { scheduleAutoUpdateCheck } from "./desktop/updater";
import "./styles.css";
import "./settings.css";

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
  const [viewportTool, setViewportTool] = useState<ViewportToolId>("magnet");
  const [stageMode, setStageMode] = useState<"magnet" | "camera">("magnet");
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [expandedCard, setExpandedCard] = useState<DashboardCard | null>(null);

  const [workspacePrefs] = useWorkspacePrefs();
  const [workspace, setWorkspace] = useState<WorkspaceId>(resolveLaunchWorkspace);
  const mainRef = useRef<HTMLElement | null>(null);
  const { showSettings, settingsLaunch, toggleSettings, closeSettings } = useSettingsOverlay({
    mainRef,
  });
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
      <AppTopbar
        health={health}
        systemState={systemState}
        workspace={workspace}
        setWorkspace={setWorkspace}
        showSettings={showSettings}
        onToggleSettings={toggleSettings}
      />

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
        <TwinViewport
          viewportTool={viewportTool}
          onViewportToolChange={onViewportToolChange}
          stageMode={stageMode}
          showDashboard={showDashboard}
          setShowDashboard={setShowDashboard}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          cameraPreviewStream={cameraPreviewStream}
          setCameraPreviewStream={setCameraPreviewStream}
          series={series}
          telemetry={telemetry}
          scannerId={scannerId}
          workspace={workspace}
        />

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
        <SettingsOverlay
          showSettings={showSettings}
          settingsLaunch={settingsLaunch}
          closeSettings={closeSettings}
        />
      </main>
    </div>
  );
}
