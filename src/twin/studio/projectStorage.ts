/** Large project drafts and result history belong in IndexedDB, not sessionStorage. */
export type SavedRun = { id: string; label: string; createdAt: number; values: Record<string, unknown> };
export type SavedProject = { version: 1; values: Record<string, unknown>; runs: SavedRun[] };
const DB = "adelpha-studio";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Project storage is blocked by another window."));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", mode);
    const request = action(tx.objectStore("projects"));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || request.error || new Error("Project storage failed.")); };
  });
}
export async function loadProjectState(id: string): Promise<SavedProject> {
  const value = await transaction("readonly", store => store.get(id));
  if (value && (value.version !== 1 || !value.values || !Array.isArray(value.runs))) throw new Error("Unsupported project data. The saved copy has been preserved.");
  return value ?? { version: 1, values: {}, runs: [] };
}
export async function saveProjectState(id: string, value: SavedProject) {
  await transaction("readwrite", store => store.put(value, id));
}
export async function removeProjectState(id: string) {
  await transaction("readwrite", store => store.delete(id));
}
