import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Box,
  Boxes,
  ChevronRight,
  Cpu,
  Download,
  Info,
  LayoutGrid,
  Palette,
  Puzzle,
  ScanLine,
  Search,
  Server,
  Shield,
  Sparkles,
  User,
} from "lucide-react";

import { ADELPHA_VERSION } from "./adelphaVersion";
import { useWorkspacePrefs } from "./workspacePrefs";
import type { WorkspaceId } from "./TopbarControls";
import type { SettingsLaunch } from "./settingsOpen";
import { ModelSettingsPanel } from "./settings/ModelSettingsPanel";
import {
  ConsoleThemeRow,
  OrbitModeRow,
  Segmented,
  Select,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SpecList,
  Switch,
  TextInput,
  UseModelColorsRow,
  ViewportBgRow,
} from "./settings/controls";
import { GoogleApiKeySection } from "./settings/GoogleApiKeySection";
import {
  DtamAgentSetupSection,
  DtamIntegrationsSection,
  DtamRuntimeStatus,
  DtamTwinSetupSection,
} from "./settings/DtamSetupSection";
import { UpdatesSection } from "./settings/UpdatesSection";
import { INITIAL_DRAFT, type Draft, type PatchDraft } from "./settings/draft";

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
  launch?: SettingsLaunch | null;
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
    subtitle: "Theme, density, and visual preferences for Adelpha and the Imaging Console.",
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
    subtitle: "Theme, sequence defaults, and console behavior for acquisition.",
  },
  "digital-twin": {
    title: "Digital Twin",
    subtitle: "Set up DTAM, then adjust the viewport and observer defaults.",
  },
  "3d-model": {
    title: "3D Model",
    subtitle: "Choose and customize the scanner model used across Adelpha.",
  },
  "ai-agents": {
    title: "AI & Agents",
    subtitle: "Add an API key, then configure models and agent behavior.",
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
    subtitle: "Adelpha — The Intelligent Magnetic Resonance Framework.",
  },
};

export function SettingsCard({ onClose, launch = null }: SettingsCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [section, setSection] = useState<SettingsSectionId>(launch?.section ?? "3d-model");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);

  const patch: PatchDraft = (key, value) => {
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
        e.stopPropagation();
        searchRef.current?.focus();
      }
    };
    // Capture so ⌘K focuses settings search instead of the workspace switcher.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const copy = PANEL_COPY[section];

  useEffect(() => {
    if (launch?.section) setSection(launch.section);
  }, [launch]);

  // Move the caret out of the twin so Tab and screen readers start in here.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={cardRef}
      id="settings-card"
      className="settings-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-card-title"
      tabIndex={-1}
    >
      <div className="settings-card-body">
        <nav className="settings-nav" aria-label="Settings categories">
          <button type="button" className="settings-back" onClick={onClose}>
            <ArrowLeft size={15} strokeWidth={1.9} aria-hidden />
            Close settings
            <kbd>Esc</kbd>
          </button>

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
              Settings
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
            <kbd className="settings-search-kbd">⌘K</kbd>
          </label>

          <div className="settings-nav-scroll">
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
          </div>
        </nav>

        <section className="settings-panel">
          {section === "3d-model" ? (
            <ModelSettingsPanel draft={draft} patch={patch} launch={launch} onClose={onClose} />
          ) : (
            <SettingsPage title={copy.title} subtitle={copy.subtitle}>
              {section === "ai-agents" ? (
                <AgentsPanel draft={draft} patch={patch} />
              ) : (
                <GenericPanel section={section} draft={draft} patch={patch} />
              )}
            </SettingsPage>
          )}
        </section>
      </div>
    </div>
  );
}

type PanelProps = {
  draft: Draft;
  patch: PatchDraft;
};

function AgentsPanel(_props: PanelProps) {
  return (
    <>
      <GoogleApiKeySection />
      <DtamAgentSetupSection />
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
        <SettingsSection title="Operator">
          <SettingsRow title="Display name" layout="stack">
            <TextInput
              label="Display name"
              value={draft.displayName}
              onChange={(v) => patch("displayName", v)}
            />
          </SettingsRow>
          <SettingsRow
            title="Role"
            description="Shown on agent transcripts and audit notes."
            layout="stack"
          >
            <Select
              label="Role"
              value={draft.role}
              onChange={(v) => patch("role", v)}
              options={[
                { value: "Role", label: "Role" },
                { value: "Imaging physicist", label: "Imaging physicist" },
                { value: "Engineer", label: "Engineer" },
                { value: "Clinician", label: "Clinician" },
              ]}
            />
          </SettingsRow>
          <SettingsRow title="Lab" layout="stack">
            <TextInput label="Lab" value={draft.lab} onChange={(v) => patch("lab", v)} />
          </SettingsRow>
        </SettingsSection>
      );
    case "appearance":
      return (
        <SettingsSection title="Theme">
          <ConsoleThemeRow />
          <SettingsRow title="Color mode">
            <Segmented
              label="Color mode"
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
              label="Density"
              value={draft.density}
              onChange={(v) => patch("density", v)}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </SettingsRow>
          <SettingsRow title="Reduce motion" description="Limit animation in the console chrome.">
            <Switch
              label="Reduce motion"
              checked={draft.reduceMotion}
              onChange={(v) => patch("reduceMotion", v)}
            />
          </SettingsRow>
        </SettingsSection>
      );
    case "notifications":
      return (
        <SettingsSection title="Alerts">
          <SettingsRow
            title="Scanner events"
            description="Mode changes, interlocks, and hardware faults."
          >
            <Switch
              label="Scanner events"
              checked={draft.notifyScanner}
              onChange={(v) => patch("notifyScanner", v)}
            />
          </SettingsRow>
          <SettingsRow
            title="Agent completions"
            description="Notify when an agent run finishes or needs input."
          >
            <Switch
              label="Agent completions"
              checked={draft.notifyAgents}
              onChange={(v) => patch("notifyAgents", v)}
            />
          </SettingsRow>
          <SettingsRow title="Temperature warnings">
            <Switch
              label="Temperature warnings"
              checked={draft.notifyTemp}
              onChange={(v) => patch("notifyTemp", v)}
            />
          </SettingsRow>
          <SettingsRow
            title="Email digest"
            description="Daily summary of twin and console activity."
          >
            <Switch
              label="Email digest"
              checked={draft.notifyEmail}
              onChange={(v) => patch("notifyEmail", v)}
            />
          </SettingsRow>
        </SettingsSection>
      );
    case "workspace":
      return <WorkspacePanel />;
    case "imaging-console":
      return (
        <>
          <SettingsSection title="Appearance">
            <ConsoleThemeRow />
          </SettingsSection>
          <SettingsSection title="Acquisition">
            <SettingsRow title="Default sequence" layout="stack">
              <Select
                label="Default sequence"
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
                label="Units"
                value={draft.units}
                onChange={(v) => patch("units", v)}
                options={[
                  { value: "si", label: "SI" },
                  { value: "cgs", label: "CGS" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Plot timing by default">
              <Switch
                label="Plot timing by default"
                checked={draft.plotTiming}
                onChange={(v) => patch("plotTiming", v)}
              />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "digital-twin":
      return (
        <>
          <DtamRuntimeStatus />
          <DtamTwinSetupSection />
          <SettingsSection title="Viewport">
            <ViewportBgRow />
            <UseModelColorsRow />
            <OrbitModeRow />
          </SettingsSection>
          <SettingsSection title="Observer">
            <SettingsRow title="Telemetry rate" description="Display refresh for live sensors.">
              <Select
                compact
                label="Telemetry rate"
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
              <Switch
                label="Show CAD magnet"
                checked={draft.showCad}
                onChange={(v) => patch("showCad", v)}
              />
            </SettingsRow>
            <SettingsRow title="Head-pose camera tracking">
              <Switch
                label="Head-pose camera tracking"
                checked={draft.cameraTracking}
                onChange={(v) => patch("cameraTracking", v)}
              />
            </SettingsRow>
          </SettingsSection>
        </>
      );
    case "devices":
      return (
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
            <Switch
              label="Operator camera"
              checked={draft.cameraEnabled}
              onChange={(v) => patch("cameraEnabled", v)}
            />
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
      );
    case "integrations":
      return <DtamIntegrationsSection />;
    case "privacy":
      return (
        <SettingsSection title="Data">
          <SettingsRow
            title="Camera access"
            description="Used only for optional head-pose tracking."
          >
            <Switch
              label="Camera access"
              checked={draft.cameraAccess}
              onChange={(v) => patch("cameraAccess", v)}
            />
          </SettingsRow>
          <SettingsRow title="Crash reports">
            <Switch
              label="Crash reports"
              checked={draft.crashReports}
              onChange={(v) => patch("crashReports", v)}
            />
          </SettingsRow>
          <SettingsRow title="Usage analytics">
            <Switch
              label="Usage analytics"
              checked={draft.usageAnalytics}
              onChange={(v) => patch("usageAnalytics", v)}
            />
          </SettingsRow>
        </SettingsSection>
      );
    case "updates":
      return <UpdatesSection />;
    case "about":
      return (
        <SettingsSection title="Adelpha">
          <p className="settings-about">
            The Intelligent Magnetic Resonance Framework. Built for low-field Halbach systems,
            digital-twin observation, and agent-assisted engineering.
          </p>
          <SpecList
            items={[
              { label: "Version", value: ADELPHA_VERSION, mono: true },
              { label: "Lab", value: "Geethanath Lab" },
            ]}
          />
        </SettingsSection>
      );
    default:
      return null;
  }
}

function WorkspacePanel() {
  const [prefs, setPrefs] = useWorkspacePrefs();
  return (
    <SettingsSection title="Defaults">
      <SettingsRow
        title="Startup workspace"
        description="Opened on launch. Also used now if Restore layout is off."
        layout="stack"
      >
        <Select
          label="Startup workspace"
          value={prefs.startupWorkspace}
          onChange={(v) => setPrefs({ startupWorkspace: v as WorkspaceId })}
          options={[
            { value: "digital-twin", label: "Digital Twin" },
            { value: "imaging-console", label: "Imaging Console" },
            { value: "engineering-studio", label: "Engineering Studio" },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        title="Restore layout on launch"
        description="Reopen the last workspace and side panel state."
      >
        <Switch
          label="Restore layout on launch"
          checked={prefs.restoreLayout}
          onChange={(v) => setPrefs({ restoreLayout: v })}
        />
      </SettingsRow>
      <SettingsRow
        title="Remember side panel width"
        description="Keep the telemetry panel width across sessions."
      >
        <Switch
          label="Remember side panel width"
          checked={prefs.rememberPanel}
          onChange={(v) => setPrefs({ rememberPanel: v })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
