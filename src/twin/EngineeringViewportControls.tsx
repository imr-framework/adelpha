import { BoxSelect, Focus, Hand, MousePointer2, Rotate3d } from "lucide-react";
import { useEffect } from "react";
import { useEngineeringStore, type StudioCameraPreset, type StudioNavTool } from "./engineeringStore";

const NAV: { id: StudioNavTool; label: string; Icon: typeof Rotate3d; hint: string }[] = [
  { id: "orbit", label: "Orbit", Icon: Rotate3d, hint: "Drag to orbit" },
  { id: "pan", label: "Pan", Icon: Hand, hint: "Drag to pan" },
  { id: "inspect", label: "Inspect", Icon: MousePointer2, hint: "Click a part · Shift-click to add" },
];

const VIEWS: { id: StudioCameraPreset; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "iso", label: "Iso" },
];

export function EngineeringViewportControls() {
  const navTool = useEngineeringStore((s) => s.navTool);
  const setNavTool = useEngineeringStore((s) => s.setNavTool);
  const cameraPreset = useEngineeringStore((s) => s.cameraPreset);
  const setCameraPreset = useEngineeringStore((s) => s.setCameraPreset);
  const requestFit = useEngineeringStore((s) => s.requestFit);
  const modelLabel = useEngineeringStore((s) => s.modelLabel);
  const partCount = useEngineeringStore((s) => s.partCount);
  const catalogCount = useEngineeringStore((s) => s.catalogCount);
  const fallback = useEngineeringStore((s) => s.fallback);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "1") setCameraPreset("front");
      else if (key === "2") setCameraPreset("right");
      else if (key === "3") setCameraPreset("top");
      else if (key === "4" || key === "7") setCameraPreset("iso");
      else if (key === "5") setCameraPreset("left");
      else if (key === "6") setCameraPreset("back");
      else if (key === "f") requestFit();
      else if (key === "q") setNavTool("orbit");
      else if (key === "w") setNavTool("pan");
      else if (key === "e") setNavTool("inspect");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestFit, setCameraPreset, setNavTool]);

  return (
    <>
      <div className="eng-hud-chip" aria-live="polite">
        <span className="eng-hud-kicker">{fallback ? "Bundled simulation assembly" : "Simulation assembly"}</span>
        <strong>{modelLabel}</strong>
        <span className="eng-hud-meta">
          {catalogCount === 0
            ? "Loading parts…"
            : partCount === 0
              ? "No parts added to simulation"
              : `${partCount} of ${catalogCount} in simulation`}
        </span>
      </div>

      <div className="eng-nav-rail" role="toolbar" aria-label="Viewport navigation">
        {NAV.map((tool) => {
          const Icon = tool.Icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={`eng-nav-btn${navTool === tool.id ? " is-active" : ""}`}
              aria-label={tool.label}
              aria-pressed={navTool === tool.id}
              title={`${tool.label} — ${tool.hint}`}
              onClick={() => setNavTool(tool.id)}
            >
              <Icon size={17} strokeWidth={1.75} aria-hidden />
              <span className="eng-nav-tag">{tool.label}</span>
            </button>
          );
        })}
        <span className="eng-nav-rule" aria-hidden />
        <button
          type="button"
          className="eng-nav-btn"
          aria-label="Fit view"
          title="Fit view (F)"
          onClick={() => requestFit()}
        >
          <Focus size={17} strokeWidth={1.75} aria-hidden />
          <span className="eng-nav-tag">Fit</span>
        </button>
      </div>

      <div className="eng-view-bar" role="toolbar" aria-label="Standard views">
        <BoxSelect size={14} strokeWidth={1.75} aria-hidden />
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`eng-view-btn${cameraPreset === view.id ? " is-active" : ""}`}
            aria-pressed={cameraPreset === view.id}
            onClick={() => setCameraPreset(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <p className="eng-hint">
        {navTool === "inspect"
          ? "Click a part · Shift-click adds to the set · Scroll to zoom"
          : "Drag to orbit · Shift-drag to pan · Scroll to zoom · F fits the assembly"}
      </p>
    </>
  );
}
