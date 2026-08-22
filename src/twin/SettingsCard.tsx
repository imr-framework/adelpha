import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Box,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  Info,
  LayoutGrid,
  Library,
  Palette,
  Puzzle,
  ScanLine,
  Search,
  Server,
  Shield,
  Sparkles,
  Upload,
  User,
  X,
} from "lucide-react";

/** Settings UI is a local draft only — controls must not persist or drive the twin. */
export type SettingsSectionId =
  | "profile"
  | "appearance"
  | "notifications"
  | "workspace"
  | "imaging-console"
  | "digital-twin"
  | "3d-model"
  | "ai-agents"
  | "devices"
  | "integrations"
  | "privacy"
  | "updates"
  | "about";

type SettingsCardProps = {
  onClose: () => void;
};

type NavItem = {
  id: SettingsSectionId;
  label: string;
  Icon: typeof Box;
};

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Personal",
    items: [
      { id: "profile", label: "Profile", Icon: User },
      { id: "appearance", label: "Appearance", Icon: Palette },
      { id: "notifications", label: "Notifications", Icon: Bell },
    ],
  },
  {
    heading: "Adelpha",
    items: [
      { id: "workspace", label: "Workspace", Icon: LayoutGrid },
      { id: "imaging-console", label: "Imaging Console", Icon: ScanLine },
      { id: "digital-twin", label: "Digital Twin", Icon: Box },
      { id: "3d-model", label: "3D Model", Icon: Boxes },
      { id: "ai-agents", label: "AI & Agents", Icon: Sparkles },
      { id: "devices", label: "Devices", Icon: Cpu },
    ],
  },
  {
    heading: "System",
    items: [
      { id: "integrations", label: "Integrations", Icon: Puzzle },
      { id: "privacy", label: "Privacy & Security", Icon: Shield },
      { id: "updates", label: "Updates", Icon: Download },
      { id: "about", label: "About", Icon: Info },
    ],
  },
];

const PANEL_COPY: Record<SettingsSectionId, { title: string; subtitle: string }> = {
  profile: {
    title: "Profile",
    subtitle: "Identity used across the operator console and agent sessions.",
  },
  appearance: {
    title: "Appearance",
    subtitle: "Theme, density, and visual preferences for Adelpha.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Choose which scanner, twin, and agent events surface in the UI.",
  },
  workspace: {
    title: "Workspace",
    subtitle: "Default layout and restore behavior for Adelpha workspaces.",
  },
  "imaging-console": {
    title: "Imaging Console",
    subtitle: "Sequence defaults and console behavior for acquisition.",
  },
  "digital-twin": {
    title: "Digital Twin",
    subtitle: "Viewport, telemetry, and observer defaults for the twin.",
  },
  "3d-model": {
    title: "3D Model",
    subtitle: "Choose and customize the scanner model used across Adelpha.",
  },
  "ai-agents": {
    title: "AI & Agents",
    subtitle: "Configure models, tools, and intelligent behavior across Adelpha.",
  },
  devices: {
    title: "Devices",
    subtitle: "Scanner, camera, and local runtime connections.",
  },
  integrations: {
    title: "Integrations",
    subtitle: "External APIs and services used by Adelpha.",
  },
  privacy: {
    title: "Privacy & Security",
    subtitle: "Camera, telemetry, and data-handling preferences.",
  },
  updates: {
    title: "Updates",
    subtitle: "Application version and update channel.",
  },
  about: {
    title: "About",
    subtitle: "Adelpha Digital Twin — The Intelligent Magnetic Resonance Framework.",
  },
};

type Draft = {
  displayName: string;
  role: string;
  lab: string;
  theme: "dark" | "system" | "light";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  notifyScanner: boolean;
  notifyAgents: boolean;
  notifyTemp: boolean;
  notifyEmail: boolean;
  defaultWorkspace: string;
  restoreLayout: boolean;
  rememberPanel: boolean;
  defaultSequence: string;
  units: string;
  plotTiming: boolean;
  telemetryHz: string;
  showCad: boolean;
  cameraTracking: boolean;
  currentModel: string;
  renderQuality: "performance" | "balanced" | "ultra";
  pbrMaterials: boolean;
  showInternal: boolean;
  environment: string;
  sensorOverlays: boolean;
  fieldViz: string;
  liveTelemetry: boolean;
  primaryModel: string;
  fastModel: string;
  autonomy: "ask" | "balanced" | "act";
  explainDecisions: boolean;
  confirmCritical: boolean;
  webSearch: boolean;
  projectMemory: boolean;
  cameraEnabled: boolean;
  adkEnabled: boolean;
  dtamEnabled: boolean;
  cameraAccess: boolean;
  crashReports: boolean;
  usageAnalytics: boolean;
  autoUpdate: boolean;
};

const INITIAL_DRAFT: Draft = {
  displayName: "MRI Uganda Operator",
  role: "Imaging physicist",
  lab: "Geethanath Lab",
  theme: "dark",
  density: "comfortable",
  reduceMotion: false,
  notifyScanner: true,
  notifyAgents: true,
  notifyTemp: true,
  notifyEmail: false,
  defaultWorkspace: "digital-twin",
  restoreLayout: true,
  rememberPanel: true,
  defaultSequence: "3d-tse",
  units: "si",
  plotTiming: false,
  telemetryHz: "2",
  showCad: true,
  cameraTracking: true,
  currentModel: "halbach-48",
  renderQuality: "balanced",
  pbrMaterials: true,
  showInternal: true,
  environment: "dark-studio",
  sensorOverlays: true,
  fieldViz: "b0",
  liveTelemetry: true,
  primaryModel: "adelpha-auto",
  fastModel: "qwen-local",
  autonomy: "balanced",
  explainDecisions: true,
  confirmCritical: true,
  webSearch: true,
  projectMemory: true,
  cameraEnabled: true,
  adkEnabled: true,
  dtamEnabled: true,
  cameraAccess: true,
  crashReports: true,
  usageAnalytics: false,
  autoUpdate: false,
};

export function SettingsCard({ onClose }: SettingsCardProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [section, setSection] = useState<SettingsSectionId>("3d-model");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = PANEL_COPY[section];

  return (
    <div
      id="settings-card"
      className="settings-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-card-title"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="settings-card-close"
        aria-label="Close settings"
        title="Close"
        onClick={onClose}
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </button>

      <div className="settings-card-body">
        <nav className="settings-nav" aria-label="Settings categories">
          <div className="settings-nav-brand">
            <img
              className="settings-nav-logo"
              src="/logos/adelpha-gradient-logo.svg"
              alt=""
              width={28}
              height={20}
              aria-hidden
            />
            <h2 id="settings-card-title" className="settings-nav-title">
              Adelpha Settings
            </h2>
          </div>

          <label className="settings-search">
            <Search size={14} strokeWidth={1.8} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search settings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <kbd className="settings-search-kbd">⌘ K</kbd>
          </label>

          {groups.length === 0 ? (
            <p className="settings-nav-empty">No matching settings</p>
          ) : (
            groups.map((group) => (
              <div key={group.heading} className="settings-nav-group">
                <div className="settings-nav-heading">{group.heading}</div>
                {group.items.map((item) => {
                  const Icon = item.Icon;
                  const active = item.id === section;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`settings-nav-item${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setSection(item.id)}
                    >
                      <Icon size={15} strokeWidth={1.8} aria-hidden />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        <section className="settings-panel" aria-labelledby="settings-panel-title">
          <header className="settings-panel-head">
            <div>
              <h3 id="settings-panel-title" className="settings-panel-title">
                {copy.title}
              </h3>
              <p className="settings-panel-sub">{copy.subtitle}</p>
            </div>
            <div className="settings-status">
              <span className="settings-status-dot" aria-hidden />
              All systems operational
            </div>
          </header>

          <div className="settings-panel-scroll">
            {section === "3d-model" ? (
              <ModelPanel draft={draft} patch={patch} />
            ) : section === "ai-agents" ? (
              <AgentsPanel draft={draft} patch={patch} />
            ) : (
              <GenericPanel section={section} draft={draft} patch={patch} />
            )}
          </div>

          <p className="settings-autosave">
            <Check size={13} strokeWidth={2.4} aria-hidden />
            Changes save automatically
          </p>
        </section>
      </div>
    </div>
  );
}

type PanelProps = {
  draft: Draft;
  patch: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
};

function ModelPanel({ draft, patch }: PanelProps) {
  return (
    <>
      <SettingsSection title="Active model">
        <div className="settings-model-layout">
          <div className="settings-model-copy">
            <SettingsRow
              title="Current model"
              description="Applied to Digital Twin and Imaging Console."
              layout="stack"
            >
              <Select
                value={draft.currentModel}
                onChange={(v) => patch("currentModel", v)}
                options={[
                  { value: "halbach-48", label: "48 mT Halbach — MRI Uganda" },
                  { value: "halbach-47", label: "47 mT Halbach — Prototype" },
                  { value: "halbach-64", label: "64 mT Halbach — Research" },
                ]}
              />
            </SettingsRow>
            <button type="button" className="settings-btn">
              Browse models
            </button>
            <dl className="settings-specs">
              <div>
                <dt>Type</dt>
                <dd>Halbach</dd>
              </div>
              <div>
                <dt>Field strength</dt>
                <dd>48 mT</dd>
              </div>
            </dl>
          </div>
          <div className="settings-model-preview">
            <img
              src="/settings/3D_models/halbach.png"
              alt="48 mT Halbach scanner model"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Model source">
        <button type="button" className="settings-link-row">
          <Upload size={16} strokeWidth={1.8} aria-hidden />
          <span className="settings-row-copy">
            <span className="settings-row-title">Import custom model</span>
            <span className="settings-row-desc">GLB, gLTF, FBX, OBJ, or STEP</span>
          </span>
          <span className="settings-btn settings-btn-inline">Choose file</span>
        </button>
        <button type="button" className="settings-link-row">
          <Library size={16} strokeWidth={1.8} aria-hidden />
          <span className="settings-row-copy">
            <span className="settings-row-title">Model library</span>
            <span className="settings-row-desc">Manage installed scanner configurations</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </SettingsSection>

      <SettingsSection title="Rendering">
        <SettingsRow title="Quality">
          <Segmented
            value={draft.renderQuality}
            onChange={(v) => patch("renderQuality", v)}
            options={[
              { value: "performance", label: "Performance" },
              { value: "balanced", label: "Balanced" },
              { value: "ultra", label: "Ultra" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Materials & textures" description="Use physically based materials.">
          <Switch checked={draft.pbrMaterials} onChange={(v) => patch("pbrMaterials", v)} />
        </SettingsRow>
        <SettingsRow
          title="Show internal components"
          description="Reveal magnet, gradients, RF coils, and electronics."
        >
          <Switch checked={draft.showInternal} onChange={(v) => patch("showInternal", v)} />
        </SettingsRow>
        <SettingsRow title="Environment">
          <Select
            compact
            value={draft.environment}
            onChange={(v) => patch("environment", v)}
            options={[
              { value: "dark-studio", label: "Dark Studio" },
              { value: "lab", label: "Lab Ambient" },
              { value: "neutral", label: "Neutral HDR" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Engineering overlays">
        <SettingsRow title="Sensor overlays">
          <Switch checked={draft.sensorOverlays} onChange={(v) => patch("sensorOverlays", v)} />
        </SettingsRow>
        <SettingsRow title="Field visualization">
          <Select
            compact
            value={draft.fieldViz}
            onChange={(v) => patch("fieldViz", v)}
            options={[
              { value: "b0", label: "B₀ Field Map" },
              { value: "gradients", label: "Gradient coils" },
              { value: "none", label: "None" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Live telemetry" description="Animate temperature, EMI, and system state.">
          <Switch checked={draft.liveTelemetry} onChange={(v) => patch("liveTelemetry", v)} />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function AgentsPanel({ draft, patch }: PanelProps) {
  return (
    <>
      <SettingsSection title="Default model">
        <SettingsRow
          title="Primary model"
          description="Used for reasoning, planning, and technical assistance."
          layout="stack"
        >
          <Select
            value={draft.primaryModel}
            onChange={(v) => patch("primaryModel", v)}
            options={[
              { value: "adelpha-auto", label: "Adelpha Intelligence — Auto" },
              { value: "gemini-pro", label: "Gemini 2.5 Pro" },
              { value: "claude-sonnet", label: "Claude Sonnet" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Fast model"
          description="Used for lightweight and real-time tasks."
          layout="stack"
        >
          <Select
            value={draft.fastModel}
            onChange={(v) => patch("fastModel", v)}
            options={[
              { value: "qwen-local", label: "Qwen 3.8 — Local" },
              { value: "gemini-flash", label: "Gemini Flash" },
              { value: "adelpha-fast", label: "Adelpha Fast" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Agent behavior">
        <SettingsRow title="Autonomy level">
          <Segmented
            value={draft.autonomy}
            onChange={(v) => patch("autonomy", v)}
            options={[
              { value: "ask", label: "Ask" },
              { value: "balanced", label: "Balanced" },
              { value: "act", label: "Act" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Explain decisions"
          description="Show concise reasoning and provenance for engineering actions."
        >
          <Switch checked={draft.explainDecisions} onChange={(v) => patch("explainDecisions", v)} />
        </SettingsRow>
        <SettingsRow
          title="Confirm critical actions"
          description="Always ask before scanner, device, or destructive operations."
        >
          <Switch checked={draft.confirmCritical} onChange={(v) => patch("confirmCritical", v)} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Tools & context">
        <SettingsRow title="Web search">
          <Switch checked={draft.webSearch} onChange={(v) => patch("webSearch", v)} />
        </SettingsRow>
        <button type="button" className="settings-link-row">
          <Server size={16} strokeWidth={1.8} aria-hidden />
          <span className="settings-row-copy">
            <span className="settings-row-title">Local model server</span>
          </span>
          <span className="settings-link-status">Connected · localhost:8000</span>
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
        </button>
        <SettingsRow title="Project memory">
          <Switch checked={draft.projectMemory} onChange={(v) => patch("projectMemory", v)} />
        </SettingsRow>
      </SettingsSection>

      <div className="settings-action-bar">
        <Sparkles size={16} strokeWidth={1.8} aria-hidden />
        <span>Test your configuration</span>
        <button type="button" className="settings-btn settings-btn-accent">
          Run test
        </button>
      </div>
    </>
  );
}

function GenericPanel({
  section,
  draft,
  patch,
}: PanelProps & { section: SettingsSectionId }) {
  switch (section) {
    case "profile":
      return (
        <>
          <SettingsSection title="Operator">
            <SettingsRow title="Display name" layout="stack">
              <input
                className="settings-input"
                value={draft.displayName}
                onChange={(e) => patch("displayName", e.target.value)}
              />
            </SettingsRow>
            <SettingsRow title="Role" description="Shown on agent transcripts and audit notes." layout="stack">
              <Select
                value={draft.role}
                onChange={(v) => patch("role", v)}
                options={[
                  { value: "Imaging physicist", label: "Imaging physicist" },
                  { value: "Engineer", label: "Engineer" },
                  { value: "Clinician", label: "Clinician" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Lab" layout="stack">
              <input
                className="settings-input"
                value={draft.lab}
                onChange={(e) => patch("lab", e.target.value)}
              />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "appearance":
      return (
        <>
          <SettingsSection title="Theme">
            <SettingsRow title="Color mode">
              <Segmented
                value={draft.theme}
                onChange={(v) => patch("theme", v)}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Density">
              <Segmented
                value={draft.density}
                onChange={(v) => patch("density", v)}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Reduce motion" description="Limit animation in the console chrome.">
              <Switch checked={draft.reduceMotion} onChange={(v) => patch("reduceMotion", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "notifications":
      return (
        <>
          <SettingsSection title="Alerts">
            <SettingsRow title="Scanner events" description="Mode changes, interlocks, and hardware faults.">
              <Switch checked={draft.notifyScanner} onChange={(v) => patch("notifyScanner", v)} />
            </SettingsRow>
            <SettingsRow title="Agent completions" description="Notify when an agent run finishes or needs input.">
              <Switch checked={draft.notifyAgents} onChange={(v) => patch("notifyAgents", v)} />
            </SettingsRow>
            <SettingsRow title="Temperature warnings">
              <Switch checked={draft.notifyTemp} onChange={(v) => patch("notifyTemp", v)} />
            </SettingsRow>
            <SettingsRow title="Email digest" description="Daily summary of twin and console activity.">
              <Switch checked={draft.notifyEmail} onChange={(v) => patch("notifyEmail", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "workspace":
      return (
        <>
          <SettingsSection title="Defaults">
            <SettingsRow title="Startup workspace" layout="stack">
              <Select
                value={draft.defaultWorkspace}
                onChange={(v) => patch("defaultWorkspace", v)}
                options={[
                  { value: "digital-twin", label: "Digital Twin" },
                  { value: "imaging-console", label: "Imaging Console" },
                  { value: "engineering-studio", label: "Engineering Studio" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Restore layout on launch">
              <Switch checked={draft.restoreLayout} onChange={(v) => patch("restoreLayout", v)} />
            </SettingsRow>
            <SettingsRow title="Remember side panel width">
              <Switch checked={draft.rememberPanel} onChange={(v) => patch("rememberPanel", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "imaging-console":
      return (
        <>
          <SettingsSection title="Acquisition">
            <SettingsRow title="Default sequence" layout="stack">
              <Select
                value={draft.defaultSequence}
                onChange={(v) => patch("defaultSequence", v)}
                options={[
                  { value: "3d-tse", label: "3D Turbo Spin-Echo" },
                  { value: "localizer", label: "Localizer" },
                  { value: "b0-map", label: "B0 Map" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Units">
              <Select
                compact
                value={draft.units}
                onChange={(v) => patch("units", v)}
                options={[
                  { value: "si", label: "SI" },
                  { value: "cgs", label: "CGS" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Plot timing by default">
              <Switch checked={draft.plotTiming} onChange={(v) => patch("plotTiming", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "digital-twin":
      return (
        <>
          <SettingsSection title="Observer">
            <SettingsRow title="Telemetry rate" description="Display refresh for live sensors.">
              <Select
                compact
                value={draft.telemetryHz}
                onChange={(v) => patch("telemetryHz", v)}
                options={[
                  { value: "1", label: "1 Hz" },
                  { value: "2", label: "2 Hz" },
                  { value: "5", label: "5 Hz" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Show CAD magnet">
              <Switch checked={draft.showCad} onChange={(v) => patch("showCad", v)} />
            </SettingsRow>
            <SettingsRow title="Head-pose camera tracking">
              <Switch checked={draft.cameraTracking} onChange={(v) => patch("cameraTracking", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "devices":
      return (
        <>
          <SettingsSection title="Connected hardware">
            <button type="button" className="settings-link-row">
              <Cpu size={16} strokeWidth={1.8} aria-hidden />
              <span className="settings-row-copy">
                <span className="settings-row-title">Scanner</span>
                <span className="settings-row-desc">48 mT Halbach · MRI Uganda</span>
              </span>
              <span className="settings-link-status">Connected</span>
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
            </button>
            <SettingsRow title="Operator camera">
              <Switch checked={draft.cameraEnabled} onChange={(v) => patch("cameraEnabled", v)} />
            </SettingsRow>
            <button type="button" className="settings-link-row">
              <Server size={16} strokeWidth={1.8} aria-hidden />
              <span className="settings-row-copy">
                <span className="settings-row-title">Local model server</span>
              </span>
              <span className="settings-link-status">Connected · localhost:8000</span>
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
            </button>
          </SettingsSection>
        </>
      );
    case "integrations":
      return (
        <>
          <SettingsSection title="Services">
            <SettingsRow title="Google ADK" description="Agent runtime at localhost:8001.">
              <Switch checked={draft.adkEnabled} onChange={(v) => patch("adkEnabled", v)} />
            </SettingsRow>
            <SettingsRow title="DTAM Twin API" description="Telemetry and assessment at localhost:8080.">
              <Switch checked={draft.dtamEnabled} onChange={(v) => patch("dtamEnabled", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "privacy":
      return (
        <>
          <SettingsSection title="Data">
            <SettingsRow title="Camera access" description="Used only for optional head-pose tracking.">
              <Switch checked={draft.cameraAccess} onChange={(v) => patch("cameraAccess", v)} />
            </SettingsRow>
            <SettingsRow title="Crash reports">
              <Switch checked={draft.crashReports} onChange={(v) => patch("crashReports", v)} />
            </SettingsRow>
            <SettingsRow title="Usage analytics">
              <Switch checked={draft.usageAnalytics} onChange={(v) => patch("usageAnalytics", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "updates":
      return (
        <>
          <SettingsSection title="Application">
            <SettingsRow title="Current version" description="Adelpha Digital Twin 0.1.0">
              <button type="button" className="settings-btn">
                Check for updates
              </button>
            </SettingsRow>
            <SettingsRow title="Automatic updates">
              <Switch checked={draft.autoUpdate} onChange={(v) => patch("autoUpdate", v)} />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "about":
      return (
        <>
          <SettingsSection title="Adelpha">
            <p className="settings-about">
              The Intelligent Magnetic Resonance Framework. Built for low-field Halbach
              systems, digital-twin observation, and agent-assisted engineering.
            </p>
            <dl className="settings-specs">
              <div>
                <dt>Version</dt>
                <dd>0.1.0</dd>
              </div>
              <div>
                <dt>Lab</dt>
                <dd>Geethanath Lab</dd>
              </div>
            </dl>
          </SettingsSection>
        </>
      );
    default:
      return null;
  }
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-block">
      <h4 className="settings-block-title">{title}</h4>
      <div className="settings-block-body">{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  layout = "inline",
  children,
}: {
  title: string;
  description?: string;
  layout?: "inline" | "stack";
  children: ReactNode;
}) {
  return (
    <div className={`settings-row${layout === "stack" ? " is-stack" : ""}`}>
      <div className="settings-row-copy">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-switch-ui" />
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <div className={`settings-select-wrap${compact ? " is-compact" : ""}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="settings-segment" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? "is-active" : undefined}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
