import { isTauri } from "./runtime";

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "export";
}

function extensionOf(filename: string): string | undefined {
  const base = fileNameFromPath(filename);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return base.slice(dot + 1);
}

/** Save a blob to a user-chosen path (desktop) or trigger a browser download. */
export async function saveBlob(filename: string, blob: Blob): Promise<string | null> {
  const name = fileNameFromPath(filename) || "export";
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const ext = extensionOf(name);
    const path = await save({
      title: "Export",
      defaultPath: name,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
    });
    if (!path) return null;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return path;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
