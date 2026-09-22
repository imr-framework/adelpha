import { readWorkspacePrefs } from "../workspacePrefs";

export const PANEL_WIDTH_KEY = "twin_side_panel_width_px";
export const PANEL_COLLAPSED_KEY = "twin_side_panel_collapsed";
export const PANEL_MODE_KEY = "twin_side_panel_mode";
export const PANEL_DEFAULT_WIDTH = 380;
export const PANEL_CHAT_MIN_WIDTH = 360;
export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH_FRAC = 0.72;

export type PanelMode = "telemetry" | "agents";

export function readPanelMode(): PanelMode {
  if (typeof localStorage === "undefined") return "telemetry";
  try {
    return localStorage.getItem(PANEL_MODE_KEY) === "agents" ? "agents" : "telemetry";
  } catch {
    return "telemetry";
  }
}

export function readPanelWidth(): number {
  if (typeof localStorage === "undefined") return PANEL_DEFAULT_WIDTH;
  try {
    if (!readWorkspacePrefs().rememberPanel) return PANEL_DEFAULT_WIDTH;
    const n = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(n) && n >= PANEL_MIN_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return PANEL_DEFAULT_WIDTH;
}

export function readPanelCollapsed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    if (!readWorkspacePrefs().restoreLayout) return false;
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function clampPanelWidth(px: number, viewportWidth: number) {
  const max = Math.max(PANEL_MIN_WIDTH, Math.floor(viewportWidth * PANEL_MAX_WIDTH_FRAC));
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, Math.round(px)));
}
