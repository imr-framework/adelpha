import { Suspense, lazy, type PointerEvent as ReactPointerEvent } from "react";

import type { SystemState } from "../dtamTypes";
import type { PanelMode } from "./panelPrefs";

const AgentChatPanel = lazy(() =>
  import("../AgentChatPanel").then((m) => ({ default: m.AgentChatPanel })),
);

export function SidePanel({
  panelWidth,
  panelCollapsed,
  panelMode,
  systemState,
  setPanelCollapsed,
  switchPanelMode,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizeDoubleClick,
  children,
}: {
  panelWidth: number;
  panelCollapsed: boolean;
  panelMode: PanelMode;
  systemState: SystemState | null;
  setPanelCollapsed: (next: boolean) => void;
  switchPanelMode: (mode: PanelMode) => void;
  onResizePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  /** Telemetry-mode body; rendered only when the Agents tab is not active. */
  children: React.ReactNode;
}) {
  if (panelCollapsed) {
    return (
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
    );
  }

  return (
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
        children
      )}
    </aside>
  );
}
