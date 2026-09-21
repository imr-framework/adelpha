import { Suspense, lazy, type Dispatch, type SetStateAction } from "react";

import type { DashboardSeries } from "../dashboard/useDashboardSeries";
import { ExpandedChartModal } from "../dashboard/ExpandedChartModal";
import { LiveDashboard } from "../dashboard/LiveDashboard";
import type { DashboardCard } from "../dashboard/types";
import { ErrorBoundary } from "../ErrorBoundary";
import { isImportedModelId } from "../importedModels";
import { PartInspectorCard } from "../PartInspectorCard";
import { PartVisibilityTray } from "../PartVisibilityTray";
import { setScannerModel } from "../scannerModel";
import { SystemConsole } from "../SystemConsole";
import type { TwinTelemetry } from "../types";
import type { WorkspaceId } from "../TopbarControls";
import { ViewportContextMenu } from "../ViewportContextMenu";
import { ViewportToolRail, type ViewportToolId } from "../ViewportToolRail";

const TwinCanvas = lazy(() =>
  import("../TwinCanvas").then((m) => ({ default: m.TwinCanvas })),
);
const CameraFeed = lazy(() =>
  import("../CameraFeed").then((m) => ({ default: m.CameraFeed })),
);

export function TwinViewport({
  viewportTool,
  onViewportToolChange,
  stageMode,
  showDashboard,
  setShowDashboard,
  expandedCard,
  setExpandedCard,
  cameraPreviewStream,
  setCameraPreviewStream,
  series,
  telemetry,
  scannerId,
  workspace,
}: {
  viewportTool: ViewportToolId;
  onViewportToolChange: (id: ViewportToolId) => void;
  stageMode: "magnet" | "camera";
  showDashboard: boolean;
  setShowDashboard: Dispatch<SetStateAction<boolean>>;
  expandedCard: DashboardCard | null;
  setExpandedCard: Dispatch<SetStateAction<DashboardCard | null>>;
  cameraPreviewStream: MediaStream | null;
  setCameraPreviewStream: Dispatch<SetStateAction<MediaStream | null>>;
  series: DashboardSeries;
  telemetry: TwinTelemetry;
  scannerId: string;
  workspace: WorkspaceId;
}) {
  return (
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
  );
}
