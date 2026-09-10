/** Desktop auto-update via GitHub Releases (`latest.json`). */

import type { Update } from "@tauri-apps/plugin-updater";

import { isTauri } from "./runtime";

const AUTO_KEY = "adelpha-auto-update";

export function readAutoUpdate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAutoUpdate(enabled: boolean): void {
  try {
    window.localStorage.setItem(AUTO_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export type UpdateStatus = {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  downloaded?: number;
  total?: number;
  error?: string;
};

let pending: Update | null = null;

export function explainUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/fallback platforms/i.test(raw) || /were found in the response 'platforms'/i.test(raw)) {
    return "This Mac is not in the GitHub update feed yet. Download a new installer from the Adelpha releases page. In-app updates need a later tagged release that includes a signed darwin package.";
  }
  return raw;
}

export async function checkForAppUpdate(): Promise<{
  available: boolean;
  version?: string;
  notes?: string;
}> {
  if (!isTauri()) {
    throw new Error("Updates are installed from the Adelpha desktop app.");
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    pending = null;
    return { available: false };
  }
  pending = update;
  return {
    available: true,
    version: update.version,
    notes: update.body ?? undefined,
  };
}

export async function installPendingUpdate(
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  if (!pending) {
    throw new Error("No update is ready to install. Check for updates first.");
  }
  let downloaded = 0;
  let total = 0;
  await pending.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      downloaded = 0;
      onProgress?.(downloaded, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength ?? 0;
      onProgress?.(downloaded, total);
    }
  });
  pending = null;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** Silent check after launch when Automatic updates is on. */
export function scheduleAutoUpdateCheck(): () => void {
  if (!isTauri() || !readAutoUpdate()) {
    return () => undefined;
  }
  const timer = window.setTimeout(() => {
    void (async () => {
      try {
        const result = await checkForAppUpdate();
        if (result.available) {
          await installPendingUpdate();
        }
      } catch (err) {
        console.warn("auto-update:", err);
      }
    })();
  }, 12_000);
  return () => window.clearTimeout(timer);
}
