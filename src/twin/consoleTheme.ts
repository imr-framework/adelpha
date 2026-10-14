import { useEffect, useState } from "react";

export type ConsoleTheme = "adelpha" | "mri4all" | "porcelain" | "glacier";
export const CONSOLE_THEME_EVENT = "adelpha:console-theme";
const KEY = "adelpha.consoleTheme";

export const CONSOLE_THEMES = [
  { id: "adelpha", name: "Adelpha", description: "Original dark · violet", canvas: "#08080a", surface: "#16181d", accent: "#8260fb" },
  { id: "mri4all", name: "MRI4ALL", description: "Legacy dark · navy & gold", canvas: "#040919", surface: "#262c44", accent: "#e0a526" },
  { id: "porcelain", name: "Porcelain", description: "Light · cloud white & cobalt", canvas: "#f3f5f7", surface: "#ffffff", accent: "#315ccc" },
  { id: "glacier", name: "Glacier", description: "Light · ice blue & petrol", canvas: "#edf3f6", surface: "#fcfeff", accent: "#086b8a" },
] as const;

const sharedLight = {
  "color-scheme": "light",
  "on-accent": "#ffffff",
  success: "#28704d", "success-soft": "#e9f4ed",
  warning: "#865718", "warning-soft": "#faf0db",
  danger: "#b13e49", "danger-soft": "#fbecef",
  scrim: "rgba(25, 39, 55, 0.28)",
  shadow: "rgba(25, 39, 55, 0.08)",
  glow: "transparent",
};

/** Shared by CSS surfaces and renderers that require resolved colors. */
export const LIGHT_THEME_PALETTES = {
  porcelain: {
    ...sharedLight,
    bg: "#f3f5f7", surface: "#ffffff", raised: "#f8f9fb", hover: "#eaf0f8",
    text: "#202b3b", muted: "#637084", border: "#dce2e9",
    accent: "#315ccc", "accent-hover": "#264aa8", "accent-soft": "#eaf0ff",
    stage: "#b7bec9", radius: "12px",
  },
  glacier: {
    ...sharedLight,
    bg: "#edf3f6", surface: "#fcfeff", raised: "#f4f8fb", hover: "#e4eef3",
    text: "#203744", muted: "#586f7d", border: "#d5e2e9",
    accent: "#086b8a", "accent-hover": "#07546d", "accent-soft": "#dff0f6",
    stage: "#b7bec9", radius: "8px",
  },
} as const;

export function lightThemePalette(theme: ConsoleTheme) {
  return theme === "porcelain" || theme === "glacier" ? LIGHT_THEME_PALETTES[theme] : null;
}

export function useThemeStageBackground(darkBackground = "#030303") {
  const [theme] = useConsoleTheme();
  return lightThemePalette(theme)?.stage ?? darkBackground;
}

function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return CONSOLE_THEMES.some((theme) => theme.id === value);
}

export function readConsoleTheme(): ConsoleTheme {
  try {
    const value = localStorage.getItem(KEY);
    if (isConsoleTheme(value)) return value;
  } catch { /* Storage may be unavailable in embedded webviews. */ }
  return "adelpha";
}

export function applyConsoleTheme(theme: ConsoleTheme) {
  const root = document.documentElement;
  root.dataset.consoleTheme = theme;
  const palette = lightThemePalette(theme);
  // Removing every light token restores the exact original fallback colors.
  for (const key of Object.keys(LIGHT_THEME_PALETTES.porcelain)) {
    const property = `--theme-${key}`;
    if (palette) root.style.setProperty(property, palette[key as keyof typeof palette]);
    else root.style.removeProperty(property);
  }
}

export function setConsoleTheme(theme: ConsoleTheme) {
  try { localStorage.setItem(KEY, theme); } catch { /* Still apply for this session. */ }
  applyConsoleTheme(theme);
  window.dispatchEvent(new CustomEvent<ConsoleTheme>(CONSOLE_THEME_EVENT, { detail: theme }));
}

export function appliedConsoleTheme(): ConsoleTheme {
  const applied = typeof document === "undefined" ? undefined : document.documentElement.dataset.consoleTheme;
  return isConsoleTheme(applied) ? applied : readConsoleTheme();
}

export function useConsoleTheme(): [ConsoleTheme, (theme: ConsoleTheme) => void] {
  const [theme, setTheme] = useState<ConsoleTheme>(appliedConsoleTheme);
  useEffect(() => {
    const onChange = (event: Event) => setTheme((event as CustomEvent<ConsoleTheme>).detail);
    window.addEventListener(CONSOLE_THEME_EVENT, onChange);
    return () => window.removeEventListener(CONSOLE_THEME_EVENT, onChange);
  }, []);
  return [theme, setConsoleTheme];
}

if (typeof document !== "undefined") {
  applyConsoleTheme(readConsoleTheme());
}
