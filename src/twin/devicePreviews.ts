import { CATALOG_EVENT } from "./importedModels";

const KEY = "adelpha.devicePreviews";
const MAX_BYTES = 8 * 1024 * 1024;

type PreviewMap = Record<string, string>;

function readMap(): PreviewMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: PreviewMap = {};
    for (const [id, value] of Object.entries(parsed as PreviewMap)) {
      if (typeof value === "string" && value.startsWith("data:image/")) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: PreviewMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CATALOG_EVENT));
}

export function readDevicePreview(id: string): string | undefined {
  return readMap()[id];
}

export function hasDevicePreview(id: string): boolean {
  return Boolean(readDevicePreview(id));
}

export function setDevicePreview(id: string, dataUrl: string) {
  writeMap({ ...readMap(), [id]: dataUrl });
}

export function clearDevicePreview(id: string) {
  const next = readMap();
  if (!(id in next)) return;
  delete next[id];
  writeMap(next);
}

function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(name)) return true;
  return file.type.startsWith("image/");
}

/** Downscale to the Devices card aspect so localStorage stays small. */
export async function imageFileToPreview(file: File): Promise<string> {
  if (file.size <= 0) throw new Error("That file is empty.");
  if (file.size > MAX_BYTES) throw new Error("Pictures larger than 8 MB cannot be used.");
  if (!isImageFile(file)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not prepare that picture.");
  }
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, 320, 200);
  const scale = Math.max(320 / bitmap.width, 200 / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (320 - w) / 2, (200 - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
