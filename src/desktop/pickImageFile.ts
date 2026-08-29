import { isTauri } from "./runtime";

const IMAGE_FILTERS = [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }];

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "picture.png";
}

/** Native dialog filtered to images. Returns null if the user cancels. */
export async function pickImageFile(): Promise<File | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const selected = await open({
    title: "Device picture",
    multiple: false,
    directory: false,
    filters: IMAGE_FILTERS,
  });
  if (!selected) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  const bytes = await readFile(path);
  const name = fileNameFromPath(path);
  return new File([bytes], name, { type: "image/*" });
}
