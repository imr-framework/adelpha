import { isTauri } from "./runtime";

const CAD_FILTERS = [{ name: "CAD models", extensions: ["glb", "step", "stp"] }];

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "model.glb";
}

/** Native dialog filtered to GLB/STEP. Returns null if the user cancels. */
export async function pickCadFile(): Promise<File | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const selected = await open({
    title: "Import CAD",
    multiple: false,
    directory: false,
    filters: CAD_FILTERS,
  });
  if (!selected) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  const bytes = await readFile(path);
  const name = fileNameFromPath(path);
  const lower = name.toLowerCase();
  const type = lower.endsWith(".glb") ? "model/gltf-binary" : "application/step";
  return new File([bytes], name, { type });
}
