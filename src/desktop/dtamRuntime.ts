import { initDesktopRuntime, isTauri, restartRuntime, type RuntimeStatus } from "./runtime";

export type DtamRuntimePrefs = {
  scanner_id: string;
  environment: string;
  agent_model: string;
  agent_mode: string;
};

export const DEFAULT_DTAM_PREFS: DtamRuntimePrefs = {
  scanner_id: "simulated_scanner",
  environment: "development",
  agent_model: "gemini-2.5-flash",
  agent_mode: "observe",
};

export const DTAM_SCANNERS = [
  { value: "simulated_scanner", label: "Simulated scanner" },
  { value: "halbach_48mt", label: "48 mT Halbach" },
] as const;

export const DTAM_ENVIRONMENTS = [
  { value: "development", label: "Development" },
  { value: "production", label: "Production" },
  { value: "testing", label: "Testing" },
] as const;

export const DTAM_AGENT_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
] as const;

export const DTAM_AGENT_MODES = [
  { value: "observe", label: "Observe" },
  { value: "recommend", label: "Recommend" },
  { value: "act", label: "Act (simulated)" },
] as const;

export async function readDtamRuntimePrefs(): Promise<DtamRuntimePrefs> {
  if (!isTauri()) return DEFAULT_DTAM_PREFS;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DtamRuntimePrefs>("dtam_runtime_prefs");
}

export async function saveDtamRuntimePrefs(prefs: DtamRuntimePrefs): Promise<DtamRuntimePrefs> {
  if (!isTauri()) {
    throw new Error("DTAM settings are saved in the Adelpha desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const next = await invoke<DtamRuntimePrefs>("set_dtam_runtime_prefs", { prefs });
  await initDesktopRuntime();
  return next;
}

export async function revealDtamConfigDir(): Promise<string> {
  if (!isTauri()) {
    throw new Error("The DTAM config folder is managed by the Adelpha desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("reveal_dtam_config_dir");
}

export async function restartDtamRuntime(): Promise<RuntimeStatus> {
  return restartRuntime();
}
