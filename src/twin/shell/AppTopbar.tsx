import { Settings } from "lucide-react";

import type { HealthResponse, SystemState } from "../dtamTypes";
import { TopbarAppMenu, TopbarControls, type WorkspaceId } from "../TopbarControls";

export function AppTopbar({
  health,
  systemState,
  workspace,
  setWorkspace,
  showSettings,
  onToggleSettings,
}: {
  health: HealthResponse | null;
  systemState: SystemState | null;
  workspace: WorkspaceId;
  setWorkspace: (next: WorkspaceId) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
}) {
  return (
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
        onClick={onToggleSettings}
      >
        <Settings size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <TopbarAppMenu workspace={workspace} />
    </div>
  </div>
</header>
  );
}
