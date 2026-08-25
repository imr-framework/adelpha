import { useEffect, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  humanizePartName,
  listPartsForScanner,
  resolvePartBinding,
  selectHiddenParts,
  usePartInspectorStore,
} from "./partInspectorStore";
import { useScannerModel } from "./scannerModel";

const TYPING_TAGS = /^(input|textarea|select)$/i;

/**
 * Roster of parts culled from the viewport, plus the Blender-style hide keys
 * (H, Shift+H, Alt+H). Every hidden part stays one click from coming back so a
 * culled assembly can never look like missing geometry.
 */
export function PartVisibilityTray() {
  const [scannerId] = useScannerModel();
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const hiddenIds = usePartInspectorStore((s) => selectHiddenParts(s, scannerId));
  const bindings = usePartInspectorStore((s) => s.bindings);
  const catalog = usePartInspectorStore((s) => s.catalog);
  const showPart = usePartInspectorStore((s) => s.showPart);
  const showAllParts = usePartInspectorStore((s) => s.showAllParts);

  const hiddenParts = useMemo(() => {
    const known = new Map(
      listPartsForScanner(scannerId, catalog, bindings).map((part) => [part.partId, part]),
    );
    return hiddenIds.map((partId) => {
      const part = known.get(partId) ?? { partId, cadName: partId };
      const binding = resolvePartBinding({ ...part, scannerId }, bindings);
      return {
        partId,
        name: binding.displayName || humanizePartName(part.cadName),
        colorHex: binding.colorHex,
      };
    });
  }, [hiddenIds, catalog, bindings, scannerId]);

  useEffect(() => {
    if (!inspectionMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || TYPING_TAGS.test(target?.tagName ?? "")) return;
      const store = usePartInspectorStore.getState();
      if (event.altKey) {
        store.showAllParts(scannerId);
        return;
      }
      const selected = store.selected;
      if (!selected || selected.scannerId !== scannerId) return;
      if (event.shiftKey) store.isolatePart(scannerId, selected.partId);
      else store.hidePart(scannerId, selected.partId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectionMode, scannerId]);

  if (!inspectionMode || hiddenParts.length === 0) return null;

  return (
    <aside className="part-hidden-tray" aria-label="Hidden parts">
      <header className="part-hidden-head">
        <span className="part-inspect-kicker">Hidden · {hiddenParts.length}</span>
        <button
          type="button"
          className="part-hidden-all"
          onClick={() => showAllParts(scannerId)}
        >
          <Eye size={13} strokeWidth={1.8} aria-hidden />
          Show all
        </button>
      </header>
      <ul className="part-hidden-list">
        {hiddenParts.map((part) => (
          <li key={part.partId}>
            <button
              type="button"
              className="part-hidden-chip"
              title={`Show ${part.name}`}
              onClick={() => showPart(scannerId, part.partId)}
            >
              {part.colorHex ? (
                <span
                  className="part-inspect-chip"
                  style={{ background: part.colorHex }}
                  aria-hidden
                />
              ) : (
                <EyeOff size={12} strokeWidth={1.8} aria-hidden />
              )}
              <span className="part-hidden-name">{part.name}</span>
              <Eye size={12} strokeWidth={1.8} aria-hidden className="part-hidden-restore" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
