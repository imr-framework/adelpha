import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Check,
  Eye,
  EyeOff,
  Focus,
  Layers,
  LocateFixed,
  MousePointerClick,
  Move3d,
  Palette,
  RotateCw,
  SlidersHorizontal,
  Thermometer,
} from "lucide-react";
import { useTwinStore } from "./telemetryStore";
import { recenterViewport } from "./viewportRecenter";
import { useOrbitMode } from "./orbitMode";
import { useModelColors } from "./useModelColors";
import { selectHiddenParts, usePartInspectorStore } from "./partInspectorStore";
import { useScannerModel } from "./scannerModel";
import { requestOpenSettings } from "./settingsOpen";

const DRAG_PX = 6;

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);

/** Control + Command chords, so they never collide with plain typing. */
const SHORTCUTS = {
  inspection: IS_MAC ? "⌃⌘I" : "Ctrl+Meta+I",
  rotation: IS_MAC ? "⌃⌘R" : "Ctrl+Meta+R",
  recenter: IS_MAC ? "⌃⌘C" : "Ctrl+Meta+C",
};

type MenuPos = { x: number; y: number };

export function ViewportContextMenu({ enabled }: { enabled: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const view = useTwinStore((s) => s.view);
  const setView = useTwinStore((s) => s.setView);
  const [orbitMode, setOrbitMode] = useOrbitMode();
  const [modelColors, setModelColors] = useModelColors();
  const selectedPart = usePartInspectorStore((s) => s.selected);
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const setInspectionMode = usePartInspectorStore((s) => s.setInspectionMode);
  const hidePart = usePartInspectorStore((s) => s.hidePart);
  const isolatePart = usePartInspectorStore((s) => s.isolatePart);
  const showAllParts = usePartInspectorStore((s) => s.showAllParts);
  const [scannerId] = useScannerModel();
  const hiddenCount = usePartInspectorStore((s) => selectHiddenParts(s, scannerId).length);

  useEffect(() => {
    if (!enabled) {
      setPos(null);
      return;
    }
    const stage = hostRef.current?.parentElement;
    if (!stage) return;

    const onContextMenu = (event: Event) => {
      event.preventDefault();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      dragOrigin.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      const origin = dragOrigin.current;
      dragOrigin.current = null;
      if (event.button !== 2 || !origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest("canvas")) return;
      const rect = stage.getBoundingClientRect();
      const next = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      requestAnimationFrame(() => setPos(next));
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPos(null);
    };

    stage.addEventListener("contextmenu", onContextMenu);
    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKey);
    return () => {
      stage.removeEventListener("contextmenu", onContextMenu);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onChord = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "r" && key !== "c") return;
      event.preventDefault();
      setPos(null);
      if (key === "i") setInspectionMode(!inspectionMode);
      else if (key === "r") setOrbitMode(orbitMode === "turntable" ? "free" : "turntable");
      else recenterViewport();
    };
    window.addEventListener("keydown", onChord);
    return () => window.removeEventListener("keydown", onChord);
  }, [enabled, inspectionMode, orbitMode, setInspectionMode, setOrbitMode]);

  useLayoutEffect(() => {
    const stage = hostRef.current?.parentElement;
    const menu = menuRef.current;
    if (!stage || !menu || !pos) return;
    const pad = 10;
    const next = { ...pos };
    const maxX = Math.max(pad, stage.clientWidth - menu.offsetWidth - pad);
    const maxY = Math.max(pad, stage.clientHeight - menu.offsetHeight - pad);
    next.x = Math.min(Math.max(pad, next.x), maxX);
    next.y = Math.min(Math.max(pad, next.y), maxY);
    if (next.x !== pos.x || next.y !== pos.y) setPos(next);
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const onDismiss = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.contains(event.target as Node)) return;
      setPos(null);
    };
    window.addEventListener("pointerdown", onDismiss, true);
    return () => window.removeEventListener("pointerdown", onDismiss, true);
  }, [pos]);

  function run(action: () => void) {
    action();
    setPos(null);
  }

  if (!enabled) return null;

  return (
    <>
      <div ref={hostRef} className="viewport-context-host" aria-hidden />
      {pos ? (
        <div
          ref={menuRef}
          className="viewport-context-menu"
          role="menu"
          aria-label="Viewport controls"
          style={{ left: pos.x, top: pos.y }}
        >
          {selectedPart ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="viewport-context-item is-primary"
                onClick={() =>
                  run(() =>
                    requestOpenSettings({
                      section: "3d-model",
                      openModelLibrary: true,
                      focusPartId: selectedPart.partId,
                    }),
                  )
                }
              >
                <SlidersHorizontal size={15} strokeWidth={1.7} aria-hidden />
                <span>Properties</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="viewport-context-item"
                onClick={() => run(() => hidePart(scannerId, selectedPart.partId))}
              >
                <EyeOff size={15} strokeWidth={1.7} aria-hidden />
                <span>Hide part</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="viewport-context-item"
                onClick={() => run(() => isolatePart(scannerId, selectedPart.partId))}
              >
                <Focus size={15} strokeWidth={1.7} aria-hidden />
                <span>Isolate part</span>
              </button>
              <div className="viewport-context-rule" />
            </>
          ) : null}

          {inspectionMode && hiddenCount > 0 ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="viewport-context-item"
                onClick={() => run(() => showAllParts(scannerId))}
              >
                <Eye size={15} strokeWidth={1.7} aria-hidden />
                <span>Show all parts ({hiddenCount} hidden)</span>
              </button>
              <div className="viewport-context-rule" />
            </>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="viewport-context-item"
            onClick={() => run(() => recenterViewport())}
          >
            <LocateFixed size={15} strokeWidth={1.7} aria-hidden />
            <span>Recenter view</span>
            <kbd className="viewport-context-keys">{SHORTCUTS.recenter}</kbd>
          </button>

          <div className="viewport-context-rule" />

          <div className="viewport-context-kicker">Mode</div>
          <ToggleRow
            icon={MousePointerClick}
            label="Inspection"
            keys={SHORTCUTS.inspection}
            checked={inspectionMode}
            onToggle={() => run(() => setInspectionMode(!inspectionMode))}
          />

          <div className="viewport-context-rule" />

          <div className="viewport-context-kicker">
            <span>Rotation</span>
            <kbd className="viewport-context-keys">{SHORTCUTS.rotation}</kbd>
          </div>
          <ToggleRow
            icon={RotateCw}
            label="Side to side"
            checked={orbitMode === "turntable"}
            radio
            onToggle={() => run(() => setOrbitMode("turntable"))}
          />
          <ToggleRow
            icon={Move3d}
            label="Free orbit"
            checked={orbitMode === "free"}
            radio
            onToggle={() => run(() => setOrbitMode("free"))}
          />

          <div className="viewport-context-rule" />

          <div className="viewport-context-kicker">Appearance</div>
          <ToggleRow
            icon={Box}
            label="Wireframe"
            checked={view.wireframe}
            onToggle={() => run(() => setView({ wireframe: !view.wireframe }))}
          />
          <ToggleRow
            icon={Layers}
            label="Hybrid render"
            checked={view.hybrid_render}
            onToggle={() => run(() => setView({ hybrid_render: !view.hybrid_render }))}
          />
          <ToggleRow
            icon={Thermometer}
            label="Temperature map"
            checked={view.show_temperature_map}
            onToggle={() => run(() => setView({ show_temperature_map: !view.show_temperature_map }))}
          />
          <ToggleRow
            icon={Palette}
            label="Model colors"
            checked={modelColors}
            onToggle={() => run(() => setModelColors(!modelColors))}
          />
        </div>
      ) : null}
    </>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  keys,
  radio = false,
}: {
  icon: typeof Box;
  label: string;
  checked: boolean;
  onToggle: () => void;
  keys?: string;
  radio?: boolean;
}) {
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={checked}
      className={`viewport-context-item${checked ? " is-active" : ""}`}
      onClick={onToggle}
    >
      <Icon size={15} strokeWidth={1.7} aria-hidden />
      <span>{label}</span>
      {keys ? <kbd className="viewport-context-keys">{keys}</kbd> : null}
      <Check size={14} strokeWidth={2.2} aria-hidden className="viewport-context-tick" />
    </button>
  );
}
