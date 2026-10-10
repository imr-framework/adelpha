import { isTauri } from "./runtime";

const NPY_FILTERS = [{ name: "NumPy field map", extensions: ["npy"] }];

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "field_map.npy";
}

/** Native dialog filtered to .npy field maps, HTML input in the browser. Returns null if the user cancels. */
export async function pickFieldMapFile(): Promise<File | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      title: "Choose a field map (.npy)",
      multiple: false,
      directory: false,
      filters: NPY_FILTERS,
    });
    if (!selected) return null;
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return null;
    const bytes = await readFile(path);
    return new File([bytes], fileNameFromPath(path), { type: "application/octet-stream" });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".npy";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
