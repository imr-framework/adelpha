import { useEffect, useState } from "react";

const KEY = "adelpha.viewportBg";
const EVENT = "adelpha:viewport-bg";
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
    const normalized = normalizeHex(localStorage.getItem(KEY) ?? "");
    if (normalized) return normalized;
  } catch {
    /* ignore */
  }
  return DEFAULT_VIEWPORT_BG;
}

export function setViewportBg(color: string) {
  const normalized = normalizeHex(color) ?? DEFAULT_VIEWPORT_BG;
  try {
    localStorage.setItem(KEY, normalized);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: normalized }));
}

export function useViewportBg(): [string, (color: string) => void] {
  const [color, setColor] = useState<string>(readViewportBg);
  useEffect(() => {
    const onChange = (event: Event) => setColor((event as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [color, setViewportBg];
}
