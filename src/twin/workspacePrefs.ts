import { useEffect, useState } from "react";
import { readWorkspace, type WorkspaceId } from "./TopbarControls";

export type WorkspacePrefs = {
  startupWorkspace: WorkspaceId;
  restoreLayout: boolean;
  rememberPanel: boolean;
};

const KEY = "adelpha.workspacePrefs";
export const WORKSPACE_PREFS_EVENT = "adelpha:workspace-prefs";

const DEFAULTS: WorkspacePrefs = {
  startupWorkspace: "digital-twin",
  restoreLayout: true,
  rememberPanel: true,
};

function isWorkspaceId(value: string | null | undefined): value is WorkspaceId {
  return value === "digital-twin" || value === "imaging-console" || value === "engineering-studio";
}

export function readWorkspacePrefs(): WorkspacePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
    const startup = parsed.startupWorkspace;
    return {
      startupWorkspace: isWorkspaceId(startup) ? startup : DEFAULTS.startupWorkspace,
      restoreLayout: typeof parsed.restoreLayout === "boolean" ? parsed.restoreLayout : DEFAULTS.restoreLayout,
      rememberPanel: typeof parsed.rememberPanel === "boolean" ? parsed.rememberPanel : DEFAULTS.rememberPanel,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setWorkspacePrefs(patch: Partial<WorkspacePrefs>) {
  const next = { ...readWorkspacePrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<WorkspacePrefs>(WORKSPACE_PREFS_EVENT, { detail: next }));
}

export function resolveLaunchWorkspace(): WorkspaceId {
  const prefs = readWorkspacePrefs();
  if (prefs.restoreLayout) return readWorkspace();
  return prefs.startupWorkspace;
}

export function useWorkspacePrefs(): [WorkspacePrefs, (patch: Partial<WorkspacePrefs>) => void] {
  const [prefs, setPrefs] = useState<WorkspacePrefs>(readWorkspacePrefs);
  useEffect(() => {
    const onChange = (event: Event) => setPrefs((event as CustomEvent<WorkspacePrefs>).detail);
    window.addEventListener(WORKSPACE_PREFS_EVENT, onChange);
    return () => window.removeEventListener(WORKSPACE_PREFS_EVENT, onChange);
  }, []);
  return [prefs, setWorkspacePrefs];
}
