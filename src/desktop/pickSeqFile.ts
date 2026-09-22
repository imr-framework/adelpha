import { isTauri } from "./runtime";

const SEQ_FILTERS = [{ name: "Pulseq sequence", extensions: ["seq"] }];

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || "sequence.seq";
}

/** Native or HTML file dialog filtered to .seq. Returns null if the user cancels. */
export async function pickSeqFile(): Promise<File | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      title: "Choose a .seq file",
      multiple: false,
      directory: false,
      filters: SEQ_FILTERS,
    });
    if (!selected) return null;
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return null;
    const bytes = await readFile(path);
    return new File([bytes], fileNameFromPath(path), { type: "text/plain" });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".seq,text/plain";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
