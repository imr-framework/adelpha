import { isTauri } from "./runtime";

export type DesktopOs = "macos" | "windows" | "linux" | "web";

const CHROME_EVENT = "adelpha:chrome";

function osFromDom(): DesktopOs | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.dataset.tauriOs;
  if (value === "macos" || value === "windows" || value === "linux" || value === "web") {
    return value;
  }
  return null;
}

function osFromUserAgent(): DesktopOs {
  if (!isTauri()) return "web";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  const ua = navigator.userAgent;
  // Prefer platform: "MacIntel" / "Win32". Avoid matching "like Mac OS X" in Chromium UAs.
  if (/^Mac/i.test(platform)) return "macos";
  if (/^Win/i.test(platform)) return "windows";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua) && !/Windows/i.test(ua)) return "macos";
  return "linux";
}

export function desktopOs(): DesktopOs {
  return osFromDom() ?? osFromUserAgent();
}

/** True when Adelpha draws its own caption buttons (Windows / Linux). */
export function usesCustomCaption(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.desktopChrome === "custom") {
    return true;
  }
  const os = desktopOs();
  return os === "windows" || os === "linux";
}

/** Apply OS chrome hints before the first paint so CSS can inset the header. */
export function applyDesktopChromeAttrs(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.desktopChrome === "custom" || root.dataset.desktopChrome === "native") {
    return;
  }
  const os = desktopOs();
  root.dataset.tauriOs = os;
  if (os === "windows" || os === "linux") root.dataset.desktopChrome = "custom";
  else if (os === "macos") root.dataset.desktopChrome = "native";
  else delete root.dataset.desktopChrome;
}

export function subscribeDesktopChrome(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener(CHROME_EVENT, handler);
  return () => window.removeEventListener(CHROME_EVENT, handler);
}
