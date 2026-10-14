import { useEffect, useState } from "react";
import { CONSOLE_THEME_EVENT, lightThemePalette, appliedConsoleTheme } from "./consoleTheme";

const KEY = "adelpha.viewportBg";
// Keep a dark-theme custom background from overriding the light-theme stage.
// Both light themes share Fog by default, with a separate optional customization.
const LIGHT_KEY = "adelpha.viewportBg.light";
const EVENT = "adelpha:viewport-bg";

function preferenceKey() {
  return lightThemePalette(appliedConsoleTheme()) ? LIGHT_KEY : KEY;
}
const DEFAULT_VIEWPORT_BG = "#030303";

export const VIEWPORT_BG_PRESETS = [
  { id: "void", label: "Void", color: "#030303" },
  { id: "graphite", label: "Graphite", color: "#2c313c" },
  { id: "slate", label: "Slate", color: "#5c6574" },
  { id: "fog", label: "Fog", color: "#b7bec9" },
  { id: "paper", label: "Paper", color: "#e8e4da" },
] as const;

function normalizeHex(value: string): string | null {
  const raw = value.trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  return null;
}

export function readViewportBg(): string {
  try {
    const normalized = normalizeHex(localStorage.getItem(preferenceKey()) ?? "");
    if (normalized) return normalized;
  } catch {
    /* ignore */
  }
  return lightThemePalette(appliedConsoleTheme())?.stage ?? DEFAULT_VIEWPORT_BG;
}

export function setViewportBg(color: string) {
  const normalized = normalizeHex(color) ?? DEFAULT_VIEWPORT_BG;
  try {
    localStorage.setItem(preferenceKey(), normalized);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: normalized }));
}

export function resetViewportBg() {
  try { localStorage.removeItem(preferenceKey()); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: readViewportBg() }));
}

export function useViewportBg(): [string, (color: string) => void] {
  const [color, setColor] = useState<string>(readViewportBg);
  useEffect(() => {
    const onChange = (event: Event) => setColor((event as CustomEvent<string>).detail);
    const onTheme = () => setColor(readViewportBg());
    window.addEventListener(CONSOLE_THEME_EVENT, onTheme);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener(CONSOLE_THEME_EVENT, onTheme);
    };
  }, []);
  return [color, setViewportBg];
}
