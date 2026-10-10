import { isTauri } from "./runtime";

/** Native folder dialog. Returns null if the user cancels, or in the browser. */
export async function pickExportDirectory(title = "Save shim trays"): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    title,
    multiple: false,
    directory: true,
  });
  if (!selected) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  return path || null;
}
