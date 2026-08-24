import { useEffect, useState } from "react";

export type ConsoleTheme = "adelpha" | "mri4all";

const KEY = "adelpha.consoleTheme";
const EVENT = "adelpha:console-theme";

export function readConsoleTheme(): ConsoleTheme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "mri4all" || value === "adelpha") return value;
  } catch {
    /* ignore */
  }
  return "adelpha";
}

export function applyConsoleTheme(theme: ConsoleTheme) {
  document.documentElement.dataset.consoleTheme = theme;
}

export function setConsoleTheme(theme: ConsoleTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyConsoleTheme(theme);
  window.dispatchEvent(new CustomEvent<ConsoleTheme>(EVENT, { detail: theme }));
}

export function useConsoleTheme(): [ConsoleTheme, (theme: ConsoleTheme) => void] {
  const [theme, setTheme] = useState<ConsoleTheme>(readConsoleTheme);
  useEffect(() => {
    applyConsoleTheme(readConsoleTheme());
    const onChange = (event: Event) => setTheme((event as CustomEvent<ConsoleTheme>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [theme, setConsoleTheme];
}

if (typeof document !== "undefined") {
  applyConsoleTheme(readConsoleTheme());
}
