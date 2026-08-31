/** User-imported CAD. Tessellated meshes live in IndexedDB; metadata in localStorage. */

export const IMPORTED_PREFIX = "imported-";
export const CATALOG_EVENT = "adelpha:model-catalog";

const META_KEY = "adelpha.importedModels";
const DB_NAME = "adelpha-cad";
const STORE = "glb";
const DB_VERSION = 1;
const MAX_BYTES = 80 * 1024 * 1024;

export type ImportedCadFormat = "glb" | "step";

export type ImportedModelMeta = {
  id: string;
  fileName: string;
  displayName: string;
  scale: number;
  format?: ImportedCadFormat;
};

const urls = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export function isImportedModelId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(IMPORTED_PREFIX);
}

export function importedObjectUrl(id: string): string | undefined {
  return urls.get(id);
}

export function readImportedMeta(): ImportedModelMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeta);
  } catch {
    return [];
  }
}

function isMeta(value: unknown): value is ImportedModelMeta {
  if (!value || typeof value !== "object") return false;
  const row = value as ImportedModelMeta;
  return (
    isImportedModelId(row.id) &&
    typeof row.fileName === "string" &&
    typeof row.displayName === "string" &&
    typeof row.scale === "number" &&
    row.scale > 0 &&
    (row.format === undefined || row.format === "glb" || row.format === "step")
  );
}

function writeImportedMeta(rows: ImportedModelMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(rows));
}

function restoreImportedNativeScales() {
  try {
    localStorage.removeItem("adelpha.modelDefaultScales");
    const rows = readImportedMeta();
    if (!rows.some((row) => row.scale !== 1)) return;
    writeImportedMeta(rows.map((row) => ({ ...row, scale: 1 })));
  } catch {
    /* ignore quota / private mode */
  }
}

restoreImportedNativeScales();

function announceCatalog() {
  window.dispatchEvent(new Event(CATALOG_EVENT));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open CAD storage."));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("CAD storage failed."));
  });
}

async function isGlbFile(file: File): Promise<boolean> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".glb")) return false;
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return header[0] === 0x67 && header[1] === 0x6c && header[2] === 0x54 && header[3] === 0x46;
}

async function isStepFile(file: File): Promise<boolean> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".step") && !name.endsWith(".stp")) return false;
  const head = (await file.slice(0, 64).text()).replace(/^\uFEFF/, "");
  return /ISO-10303-21/i.test(head) || /HEADER;/i.test(head);
}

function displayNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.(glb|step|stp)$/i, "").trim();
  return base || "Imported model";
}

async function blobForImport(file: File): Promise<{ blob: Blob; format: ImportedCadFormat }> {
  if (await isGlbFile(file)) {
    return { blob: file.slice(0, file.size, file.type || "model/gltf-binary"), format: "glb" };
  }
  if (await isStepFile(file)) {
    const { stepFileToGlbBlob } = await import("./stepToGlb");
    return { blob: await stepFileToGlbBlob(file), format: "step" };
  }
  throw new Error("Choose a .glb or STEP (.step / .stp) file.");
}

export async function hydrateImportedModels(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const meta = readImportedMeta();
    if (meta.length === 0) {
      hydrated = true;
      return;
    }
    try {
      const db = await openDb();
      try {
        const kept: ImportedModelMeta[] = [];
        for (const row of meta) {
          try {
            const blob = await idbRequest(
              db.transaction(STORE, "readonly").objectStore(STORE).get(row.id),
            );
            if (!(blob instanceof Blob) || blob.size === 0) continue;
            const prev = urls.get(row.id);
            if (prev) URL.revokeObjectURL(prev);
            urls.set(row.id, URL.createObjectURL(blob));
            kept.push(row);
          } catch {
            /* skip a corrupt row */
          }
        }
        if (kept.length !== meta.length) writeImportedMeta(kept);
      } finally {
        db.close();
      }
    } catch {
      writeImportedMeta([]);
    }
    hydrated = true;
    announceCatalog();
  })().finally(() => {
    hydratePromise = null;
  });
  return hydratePromise;
}

/** Drop every imported CAD blob so a bad file cannot take the UI down again. */
export async function clearAllImportedModels(): Promise<void> {
  const rows = readImportedMeta();
  for (const row of rows) {
    try {
      await removeImportedModel(row.id);
    } catch {
      /* continue */
    }
  }
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  writeImportedMeta([]);
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Could not clear CAD storage."));
      req.onblocked = () => resolve();
    });
  } catch {
    /* already empty */
  }
  hydrated = false;
  hydratePromise = null;
  try {
    const { setScannerModel, readScannerModel } = await import("./scannerModel");
    if (isImportedModelId(readScannerModel())) setScannerModel("halbach-48");
  } catch {
    /* catalog not ready */
  }
  announceCatalog();
}

export async function importCadFile(file: File): Promise<ImportedModelMeta> {
  if (file.size <= 0) throw new Error("That file is empty.");
  if (file.size > MAX_BYTES) {
    throw new Error("CAD files larger than 80 MB cannot be imported.");
  }
  const { blob, format } = await blobForImport(file);
  const id = `${IMPORTED_PREFIX}${crypto.randomUUID()}`;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the model."));
    });
  } finally {
    db.close();
  }
  const row: ImportedModelMeta = {
    id,
    fileName: file.name,
    displayName: displayNameFromFile(file.name),
    scale: 1,
    format,
  };
  writeImportedMeta([...readImportedMeta(), row]);
  urls.set(id, URL.createObjectURL(blob));
  hydrated = true;
  announceCatalog();
  return row;
}

export const importGlbFile = importCadFile;

export async function removeImportedModel(id: string): Promise<void> {
  if (!isImportedModelId(id)) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not remove the GLB."));
    });
  } finally {
    db.close();
  }
  const url = urls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(id);
  }
  writeImportedMeta(readImportedMeta().filter((row) => row.id !== id));
  try {
    const { clearDevicePreview } = await import("./devicePreviews");
    clearDevicePreview(id);
  } catch {
    /* preview store is optional */
  }
  announceCatalog();
}
