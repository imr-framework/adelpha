import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AudioLines,
  Axis3d,
  Camera,
  Ellipsis,
  Magnet,
  Menu,
  RadioTower,
  X,
  type LucideIcon,
} from "lucide-react";

export type ViewportToolId = "magnet" | "emi" | "rf" | "camera" | "gradient";

const POS_KEY = "twin_view_tool_rail_pos_v2";
const MARGIN = 10;

type RailPos = { x: number; y: number };

/** Align with `.viewport-dashboard-btn` (top: 12px, left: 64px) — close sits at left. */
const DEFAULT_POS: RailPos = { x: 12, y: 12 };

const TOOLS: { id: ViewportToolId; label: string; Icon: LucideIcon }[] = [
  { id: "magnet", label: "Magnet", Icon: Magnet },
  { id: "emi", label: "EMI", Icon: AudioLines },
  { id: "rf", label: "RF", Icon: RadioTower },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "gradient", label: "Gradient", Icon: Axis3d },
];

function readSavedPos(): RailPos | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RailPos;
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function savePos(pos: RailPos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clampToStage(
  x: number,
  y: number,
  railW: number,
  railH: number,
  stageW: number,
  stageH: number,
): RailPos {
  const maxX = Math.max(MARGIN, stageW - railW - MARGIN);
  const maxY = Math.max(MARGIN, stageH - railH - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  };
}

/** Floating tool rail — draggable within the 3D stage only (not chat/telemetry/console). */
export function ViewportToolRail({
  active,
  onActiveChange,
}: {
  active: ViewportToolId;
  onActiveChange: (id: ViewportToolId) => void;
}) {
  const [open, setOpen] = useState(true);
  const [pos, setPos] = useState<RailPos>(() => readSavedPos() ?? DEFAULT_POS);
  const [dragging, setDragging] = useState(false);

  const railRef = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const draggingRef = useRef(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  // Keep inside stage when console opens/closes or panel resizes.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const stage = rail.offsetParent as HTMLElement | null;
    if (!stage) return;

    const reclamp = () => {
      const r = railRef.current;
      const s = r?.offsetParent as HTMLElement | null;
      if (!r || !s) return;
      setPos((prev) => {
        const next = clampToStage(
          prev.x,
          prev.y,
          r.offsetWidth,
          r.offsetHeight,
          s.clientWidth,
          s.clientHeight,
        );
        if (next.x !== prev.x || next.y !== prev.y) savePos(next);
        return next;
      });
    };

    requestAnimationFrame(reclamp);

    const ro = new ResizeObserver(reclamp);
    ro.observe(stage);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [open]);

  function onGripPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const rail = railRef.current;
    const stage = rail?.offsetParent as HTMLElement | null;
    if (!rail || !stage) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stageRect = stage.getBoundingClientRect();
    dragOffset.current = {
      dx: e.clientX - stageRect.left - posRef.current.x,
      dy: e.clientY - stageRect.top - posRef.current.y,
    };
    draggingRef.current = true;
    setDragging(true);
  }

  function onGripPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (!dragOffset.current || !draggingRef.current) return;
    const rail = railRef.current;
    const stage = rail?.offsetParent as HTMLElement | null;
    if (!rail || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    const next = clampToStage(
      e.clientX - stageRect.left - dragOffset.current.dx,
      e.clientY - stageRect.top - dragOffset.current.dy,
      rail.offsetWidth,
      rail.offsetHeight,
      stage.clientWidth,
      stage.clientHeight,
    );
    posRef.current = next;
    setPos(next);
  }

  function onGripPointerUp(e: ReactPointerEvent<HTMLElement>) {
    if (!draggingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragOffset.current = null;
    draggingRef.current = false;
    setDragging(false);
    savePos(posRef.current);
  }

  if (!open) {
    return (
      <div
        ref={railRef}
        className={`view-tool-rail view-tool-rail-collapsed${dragging ? " view-tool-rail-dragging" : ""}`}
        style={{ left: pos.x, top: pos.y }}
      >
        <button
          type="button"
          className="view-tool-rail-fab"
          aria-label="Open view tools"
          onClick={() => setOpen(true)}
        >
          <Menu size={18} strokeWidth={1.75} aria-hidden />
          <span className="view-tool-rail-tag">Tools</span>
        </button>
        <button
          type="button"
          className="view-tool-rail-grip"
          aria-label="Drag tools"
          title="Drag"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerUp}
        >
          <Ellipsis size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={railRef}
      className={`view-tool-rail${dragging ? " view-tool-rail-dragging" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      role="toolbar"
      aria-label="Viewport tools"
    >
      <button
        type="button"
        className="view-tool-rail-close"
        aria-label="Collapse tools"
        onClick={() => setOpen(false)}
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
        <span className="view-tool-rail-tag">Close</span>
      </button>

      <button
        type="button"
        className="view-tool-rail-grip"
        aria-label="Drag tools"
        title="Drag"
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerUp}
      >
        <Ellipsis size={16} strokeWidth={2} aria-hidden />
      </button>

      <div className="view-tool-rail-shell">
        {TOOLS.map((tool) => {
          const Icon = tool.Icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={`view-tool-rail-btn${active === tool.id ? " view-tool-rail-btn-active" : ""}`}
              aria-label={tool.label}
              aria-pressed={active === tool.id}
              onClick={() => onActiveChange(tool.id)}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
              <span className="view-tool-rail-tag">{tool.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
