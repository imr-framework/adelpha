import { initDesktopRuntime, isTauri } from "./runtime";

export type MriDataInfo = {
  path: string;
  data_path: string;
  complete_path: string;
  default_path: string;
  is_default: boolean;
};

export async function readMriDataInfo(): Promise<MriDataInfo | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<MriDataInfo>("mri_data_info");
}

export async function setMriDataDirectory(path: string | null): Promise<MriDataInfo> {
  if (!isTauri()) {
    throw new Error("The study data folder is chosen in the Adelpha desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const next = await invoke<MriDataInfo>("set_mri_data_dir", { path });
  await initDesktopRuntime();
  return next;
}

export async function pickMriDataDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    title: "Study data folder",
    directory: true,
    multiple: false,
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

export async function revealMriDataDirectory(): Promise<string> {
  if (!isTauri()) {
    throw new Error("The study data folder is managed by the Adelpha desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("reveal_mri_data_dir");
}
