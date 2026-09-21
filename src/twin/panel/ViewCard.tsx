import type { TwinViewControls } from "../telemetryStore";
import {
  cadExplodesParts,
  cadForScanner,
  MAGNET_CAD_SCALE_MAX,
  MAGNET_CAD_SCALE_MIN,
} from "../scannerModel";
import { InfoCard } from "./metrics";

export function ViewCard({
  view,
  setView,
  scannerId,
  hasCadMagnet,
  explodePartCount,
  polishedFinish,
  setPolishedFinish,
}: {
  view: TwinViewControls;
  setView: (patch: Partial<TwinViewControls>) => void;
  scannerId: string;
  hasCadMagnet: boolean;
  explodePartCount: number;
  polishedFinish: boolean;
  setPolishedFinish: (next: boolean) => void;
}) {
  return (
    <InfoCard title="View">
      <label className="control">
        <span>
          Exploded magnet
          {explodePartCount >= 2 ? (
            <span className="muted"> ({explodePartCount} parts)</span>
          ) : null}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={view.exploded}
          onChange={(e) => setView({ exploded: Number(e.target.value) })}
        />
      </label>
      {hasCadMagnet ? (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.4 }}>
          {cadExplodesParts(cadForScanner(scannerId))
            ? explodePartCount === 1
              ? "This file is a single fused mesh, so exploded view cannot pull bodies apart. Re-export from CAD with each assembly body as its own mesh."
              : "Separates the largest assembly parts. Fasteners stay put. Right-click the viewport for Inspection mode."
            : "This scanner ships as a single STL mesh, so exploded view scales the whole magnet. Import a GLB with separate bodies for a true explode."}
        </p>
      ) : null}
      {hasCadMagnet ? (
        <>
          <label className="control">
            <span>
              Model scale{" "}
              <span className="muted">({view.magnet_cad_scale.toPrecision(4)}×)</span>
            </span>
            <input
              type="range"
              min={MAGNET_CAD_SCALE_MIN}
              max={MAGNET_CAD_SCALE_MAX}
              step={0.0001}
              value={Math.min(
                Math.max(view.magnet_cad_scale, MAGNET_CAD_SCALE_MIN),
                MAGNET_CAD_SCALE_MAX,
              )}
              onChange={(e) => setView({ magnet_cad_scale: Number(e.target.value) })}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={polishedFinish}
              onChange={(e) => setPolishedFinish(e.target.checked)}
            />
            <span>Polished metal</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={view.wireframe}
              onChange={(e) => setView({ wireframe: e.target.checked })}
            />
            <span>Wireframe mode</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={view.hybrid_render}
              onChange={(e) => setView({ hybrid_render: e.target.checked })}
            />
            <span>Hybrid render (solid + wireframe)</span>
          </label>
          <button
            type="button"
            className="action-btn"
            onClick={() => setView({ show_temperature_map: !view.show_temperature_map })}
          >
            {view.show_temperature_map ? "Hide temperature map" : "Show temperature map"}
          </button>
        </>
      ) : null}
    </InfoCard>
  );
}
