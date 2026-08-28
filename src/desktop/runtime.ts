/** Desktop runtime client: Tauri injects the supervisor URL and session token. */

export type RuntimeService = {
  id: string;
  title?: string;
  required?: boolean;
  start?: string;
  status?: string;
  detail?: string;
  version?: string;
};

export type RuntimeStatus = {
  ok: boolean;
  ready: boolean;
  baseUrl: string;
  token: string;
  version: string;
  session: string;
  services: Record<string, RuntimeService>;
  requiredFailed: string[];
  error?: string | null;
  pythonRuntimeVersion: string;
  adelphaVersion: string;
  tauriVersion: string;
};

const BROWSER_OK: RuntimeStatus = {
  ok: true,
  ready: true,
  baseUrl: "",
  token: "",
  version: "",
  session: "",
  services: {},
  requiredFailed: [],
  error: null,
  pythonRuntimeVersion: "",
  adelphaVersion: "",
  tauriVersion: "",
};

let current: RuntimeStatus = BROWSER_OK;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getRuntime(): RuntimeStatus {
  return current;
}

export function apiRoot(): string {
  return current.baseUrl.replace(/\/$/, "");
}

function mapStatus(raw: Record<string, unknown>): RuntimeStatus {
  const services = (raw.services ?? {}) as Record<string, RuntimeService>;
  return {
    ok: Boolean(raw.ok),
    ready: Boolean(raw.ready),
    baseUrl: String(raw.base_url ?? raw.baseUrl ?? ""),
    token: String(raw.token ?? ""),
    version: String(raw.version ?? ""),
    session: String(raw.session ?? ""),
    services,
    requiredFailed: Array.isArray(raw.required_failed)
      ? (raw.required_failed as string[])
      : Array.isArray(raw.requiredFailed)
        ? (raw.requiredFailed as string[])
        : [],
    error: (raw.error as string | null | undefined) ?? null,
    pythonRuntimeVersion: String(raw.python_runtime_version ?? ""),
    adelphaVersion: String(raw.adelpha_version ?? ""),
    tauriVersion: String(raw.tauri_version ?? ""),
  };
}

export async function initDesktopRuntime(): Promise<RuntimeStatus> {
  if (!isTauri()) {
    current = BROWSER_OK;
    return current;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const raw = await invoke<Record<string, unknown>>("runtime_status");
    current = mapStatus(raw);
  } catch (err) {
    current = {
      ...BROWSER_OK,
      ok: false,
      ready: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return current;
}

export async function runtimeFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (current.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${current.token}`);
  }
  return fetch(input, { ...init, headers });
}

export function withToken(url: string): string {
  if (!current.token) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}token=${encodeURIComponent(current.token)}`;
}

export async function quitApp(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("app_quit");
    return;
  }
  if (window.adelphaApp?.quit) {
    window.adelphaApp.quit();
    return;
  }
  window.close();
}

export async function exportDiagnostics(): Promise<string> {
  if (!isTauri()) return "";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("export_diagnostics");
}

export async function restartRuntime(): Promise<RuntimeStatus> {
  if (!isTauri()) return current;
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<Record<string, unknown>>("runtime_restart");
  current = mapStatus(raw);
  return current;
}

export const AGENTS_CONFIG_EVENT = "adelpha:agents-config-changed";

export function notifyAgentsConfigChanged(): void {
  window.dispatchEvent(new Event(AGENTS_CONFIG_EVENT));
}

export type GoogleApiKeyStatus = {
  configured: boolean;
  hint: string;
  source: string;
  agents_status: string;
  error?: string | null;
};

function emptyKeyStatus(): GoogleApiKeyStatus {
  return {
    configured: false,
    hint: "",
    source: "none",
    agents_status: "unknown",
    error: null,
  };
}

export async function googleApiKeyStatus(): Promise<GoogleApiKeyStatus> {
  if (!isTauri()) return emptyKeyStatus();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GoogleApiKeyStatus>("google_api_key_status");
}

export async function setGoogleApiKey(key: string): Promise<GoogleApiKeyStatus> {
  if (!isTauri()) {
    throw new Error("API keys are saved in the Adelpha desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const status = await invoke<GoogleApiKeyStatus>("set_google_api_key", { key });
  notifyAgentsConfigChanged();
  return status;
}

export async function clearGoogleApiKey(): Promise<GoogleApiKeyStatus> {
  if (!isTauri()) return emptyKeyStatus();
  const { invoke } = await import("@tauri-apps/api/core");
  const status = await invoke<GoogleApiKeyStatus>("clear_google_api_key");
  notifyAgentsConfigChanged();
  return status;
}

export async function installDesktopBridges(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  window.adelphaApp = {
    quit: () => {
      void invoke("app_quit");
    },
  };

  window.adelphaTerminal = {
    available: true,
    start: (cols, rows) =>
      invoke<{ ok: boolean; shell?: string; cwd?: string; error?: string }>("terminal_start", {
        cols,
        rows,
      }),
    write: (data) => {
      void invoke("terminal_write", { data });
    },
    resize: (cols, rows) => {
      void invoke("terminal_resize", { cols, rows });
    },
    dispose: () => {
      void invoke("terminal_dispose");
    },
    onData: (cb) => {
      let unlisten: (() => void) | undefined;
      void listen<string>("terminal://data", (event) => cb(event.payload)).then((fn) => {
        unlisten = fn;
      });
      return () => unlisten?.();
    },
    onExit: (cb) => {
      let unlisten: (() => void) | undefined;
      void listen<number>("terminal://exit", (event) => cb(event.payload)).then((fn) => {
        unlisten = fn;
      });
      return () => unlisten?.();
    },
  };
}
