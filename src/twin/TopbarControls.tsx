import { useEffect, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  Menu,
  MonitorDot,
  ScanLine,
  Wrench,
} from "lucide-react";
import { IMAGING_CONSOLE_MENU } from "./ImagingConsole";

export type WorkspaceId = "digital-twin" | "imaging-console" | "engineering-studio";

const WORKSPACE_KEY = "adelpha_workspace_id";

const WORKSPACES: {
  id: WorkspaceId;
  label: string;
  short: string;
  Icon: typeof Box;
}[] = [
  { id: "digital-twin", label: "Digital Twin", short: "Twin", Icon: Box },
  { id: "imaging-console", label: "Imaging Console", short: "Imaging", Icon: ScanLine },
  { id: "engineering-studio", label: "Engineering Studio", short: "Engineering", Icon: Wrench },
];

function readWorkspace(): WorkspaceId {
  try {
    const v = localStorage.getItem(WORKSPACE_KEY);
    if (WORKSPACES.some((w) => w.id === v)) return v as WorkspaceId;
  } catch {
    /* ignore */
  }
  return "digital-twin";
}

type Props = {
  scannerId: string;
  mode: string;
  twinVersion: string;
  workspace: WorkspaceId;
  onWorkspaceChange: (id: WorkspaceId) => void;
};

export function TopbarControls({
  scannerId,
  mode,
  twinVersion,
  workspace,
  onWorkspaceChange,
}: Props) {
  const [contextOpen, setContextOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const active = WORKSPACES.find((w) => w.id === workspace) ?? WORKSPACES[0]!;
  const ActiveIcon = active.Icon;

  useEffect(() => {
    if (!contextOpen && !workspaceOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (contextOpen && !contextRef.current?.contains(t)) setContextOpen(false);
      if (workspaceOpen && !workspaceRef.current?.contains(t)) setWorkspaceOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextOpen(false);
        setWorkspaceOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextOpen, workspaceOpen]);

  useEffect(() => {
    const onHotkey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setContextOpen(false);
      setWorkspaceOpen((v) => !v);
    };
    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, []);

  return (
    <>
      <div className="topbar-meta">
        <div className="system-context" ref={contextRef}>
          <button
            type="button"
            className={`system-context-btn${contextOpen ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={contextOpen}
            aria-label="System context"
            title={`${scannerId} / ${mode} · ${twinVersion}`}
            onClick={() => {
              setWorkspaceOpen(false);
              setContextOpen((v) => !v);
            }}
          >
            <MonitorDot size={14} strokeWidth={1.75} aria-hidden />
            <span className="system-context-label">
              <span className="system-context-primary">{scannerId}</span>
              <span className="system-context-sep"> / </span>
              <span className="system-context-secondary">{mode}</span>
            </span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          </button>
          {contextOpen ? (
            <div className="topbar-menu system-context-menu" role="menu">
              <div className="topbar-menu-section">System context</div>
              <div className="topbar-menu-row">
                <span>Scanner</span>
                <strong>{scannerId}</strong>
              </div>
              <div className="topbar-menu-row">
                <span>Mode</span>
                <strong>{mode}</strong>
              </div>
              <div className="topbar-menu-row">
                <span>Configuration</span>
                <strong>{twinVersion}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="workspace-switcher-wrap" ref={workspaceRef}>
        <button
          type="button"
          className={`workspace-switcher${workspaceOpen ? " is-open" : ""}`}
          aria-haspopup="menu"
          aria-expanded={workspaceOpen}
          aria-label={`Workspace: ${active.label}`}
          title={`${active.label} (⌘K)`}
          onClick={() => {
            setContextOpen(false);
            setWorkspaceOpen((v) => !v);
          }}
        >
          <ActiveIcon size={16} strokeWidth={1.75} aria-hidden />
          <span className="workspace-switcher-label">{active.label}</span>
          <span className="workspace-switcher-short">{active.short}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {workspaceOpen ? (
          <div className="topbar-menu workspace-menu" role="menu">
            <div className="topbar-menu-section">Workspaces</div>
            {WORKSPACES.map((w) => {
              const Icon = w.Icon;
              const selected = w.id === workspace;
              return (
                <button
                  key={w.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`topbar-menu-item${selected ? " is-selected" : ""}`}
                  onClick={() => {
                    onWorkspaceChange(w.id);
                    setWorkspaceOpen(false);
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span>{w.label}</span>
                </button>
              );
            })}
            <div className="topbar-menu-hint">⌘K to open</div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function persistWorkspace(id: WorkspaceId) {
  try {
    localStorage.setItem(WORKSPACE_KEY, id);
  } catch {
    /* ignore */
  }
}

export { readWorkspace, WORKSPACES };

type AppMenuProps = {
  workspace: WorkspaceId;
};

export function TopbarAppMenu({ workspace }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="topbar-app-menu" ref={wrapRef}>
      <button
        type="button"
        className={`topbar-icon-btn${open ? " is-open" : ""}`}
        aria-label="Menu"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <div className="topbar-menu app-menu" role="menu">
          {workspace === "imaging-console" ? (
            <>
              <div className="topbar-menu-section">Imaging Console</div>
              {IMAGING_CONSOLE_MENU.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item"
                  onClick={() => setOpen(false)}
                >
                  <span>{item}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="topbar-menu-section">Menu</div>
              <div className="topbar-menu-hint">No additional destinations in this workspace.</div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
