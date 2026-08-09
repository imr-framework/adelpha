import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export type ViewportToolId = "magnet" | "emi" | "rf" | "camera" | "gradient";

const POS_KEY = "twin_view_tool_rail_pos";
const MARGIN = 10;

type RailPos = { x: number; y: number };

const TOOLS: { id: ViewportToolId; label: string; icon: ReactNode }[] = [
  {
    id: "magnet",
    label: "Magnet",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <path
          d="M7 4v8.5a5 5 0 0 0 10 0V4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path d="M7 4h3.2v4.5H7V4zm6.8 0H17v4.5h-3.2V4z" fill="currentColor" opacity="0.85" />
      </svg>
    ),
  },
  {
    id: "emi",
    label: "EMI",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <path
          d="M4 12c1.6-2.4 3.2-3.6 4.8-3.6S12.4 11.2 14 12s3.2 1.2 4.8 0 3.2-3.6 1.2-5.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M4 17c1.6-2 3.2-3 4.8-3S12.4 16.4 14 17s3.2 1 4.8 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    ),
  },
  {
    id: "rf",
    label: "RF",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <circle cx="12" cy="17" r="1.6" fill="currentColor" />
        <path
          d="M8.2 13.6a5.2 5.2 0 0 1 7.6 0M5.6 10.4a9 9 0 0 1 12.8 0M3.4 7.4a12.4 12.4 0 0 1 17.2 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "camera",
    label: "Camera",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <rect x="3.5" y="7" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M8.5 7 9.8 5.2A1.4 1.4 0 0 1 11 4.5h2a1.4 1.4 0 0 1 1.2.7L15.5 7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    id: "gradient",
    label: "Gradient",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <path d="M6 18 18 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path
          d="M7.5 14.5h3M9.5 11.5h4M12 8.5h4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M5 19h4M15 5h4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    ),
  },
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
  const [pos, setPos] = useState<RailPos>(() => readSavedPos() ?? { x: 12, y: 120 });
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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
            <path
              d="M5 8h14M5 12h14M5 16h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
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
          <span className="view-tool-rail-grip-dots" aria-hidden />
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
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
          <path
            d="M7 7l10 10M17 7 7 17"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
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
        <span className="view-tool-rail-grip-dots" aria-hidden />
      </button>

      <div className="view-tool-rail-shell">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`view-tool-rail-btn${active === tool.id ? " view-tool-rail-btn-active" : ""}`}
            aria-label={tool.label}
            aria-pressed={active === tool.id}
            onClick={() => onActiveChange(tool.id)}
          >
            {tool.icon}
            <span className="view-tool-rail-tag">{tool.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
