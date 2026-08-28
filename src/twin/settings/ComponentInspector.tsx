import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  FlaskConical,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";

import { pushConsole } from "../consoleLog";
import {
  humanizePartName,
  PART_COLOR_SWATCHES,
  type PartBinding,
} from "../partInspectorStore";
import type { ScannerModelId } from "../scannerModel";
import { iconForType } from "./componentIcons";
import { formatMeasurement, type ComponentRow, type SensorOption } from "./componentRows";
import { Mono, Select, StatusBadge, Switch, TextInput } from "./controls";

export function ComponentInspector({
  row,
  scannerId,
  sensors,
  sensorsLoading,
  sensorsError,
  onPatch,
  onFocus,
  onIsolate,
  onToggleVisibility,
  onClose,
}: {
  row: ComponentRow;
  scannerId: ScannerModelId;
  sensors: SensorOption[];
  sensorsLoading: boolean;
  sensorsError: string | null;
  onPatch: (patch: Partial<PartBinding>) => void;
  onFocus: () => void;
  onIsolate: () => void;
  onToggleVisibility: () => void;
  onClose: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const Icon = iconForType(row.type);
  const assigned = sensors.find((sensor) => sensor.id === row.sensorId);

  useEffect(() => setMenuOpen(false), [row.partId]);

  // Below 1180px the inspector stacks under the table, off screen; bring it up.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1180px)").matches) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.scrollIntoView({
      block: "nearest",
      behavior: smooth ? "smooth" : "auto",
    });
  }, [row.partId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function assignSensor(sensorId: string) {
    const next = sensorId || null;
    onPatch({ sensorId: next });
    if (next) pushConsole("INFO", `Assigned sensor ${next} to ${row.displayName}`);
    else pushConsole("INFO", `Cleared sensor on ${row.displayName}`);
  }

  function toggleSimulation() {
    const next = !row.inSimulation;
    onPatch({ inSimulation: next });
    pushConsole(
      next ? "SUCCESS" : "INFO",
      next
        ? `Added ${row.displayName} to simulation${row.sensorId ? ` · ${row.sensorId}` : ""}`
        : `Removed ${row.displayName} from simulation`,
    );
  }

  return (
    <aside
      ref={rootRef}
      className="sw-inspector"
      aria-label={`Properties for ${row.displayName}`}
      style={{ "--part-color": row.colorHex ?? "transparent" } as CSSProperties}
    >
      <header className="sw-inspector-head">
        <span className="sw-inspector-icon" aria-hidden>
          <Icon size={20} strokeWidth={1.6} />
        </span>
        <div className="sw-inspector-ident">
          <h4 className="sw-inspector-name">{row.displayName}</h4>
          <p className="sw-inspector-meta">
            {row.type}
            {row.cadName !== row.displayName ? (
              <>
                {" "}
                · <Mono>{row.cadName}</Mono>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="sw-icon-btn"
          aria-label="Close component properties"
          title="Close"
          onClick={onClose}
        >
          <X size={15} strokeWidth={1.8} aria-hidden />
        </button>
      </header>

      <div className="sw-inspector-badges">
        {row.reading ? (
          <StatusBadge tone="live" title="Sensor reported in the last Twin batch">
            Live
          </StatusBadge>
        ) : null}
        {row.inSimulation ? (
          <StatusBadge tone="sim" title="Included in the DTAM simulation">
            Simulation
          </StatusBadge>
        ) : null}
        {row.sensorStale ? (
          <StatusBadge tone="warning" title="Sensor assigned but absent from the last batch">
            No recent sample
          </StatusBadge>
        ) : null}
        {row.hidden ? (
          <StatusBadge tone="idle" title="Culled from the viewport for this session">
            Hidden
          </StatusBadge>
        ) : null}
        {row.sensorDisconnected && !row.reading ? (
          <StatusBadge tone="idle" title="Twin API is not connected">
            Disconnected
          </StatusBadge>
        ) : null}
      </div>

      {row.reading ? (
        <div className="sw-telemetry">
          <span className="sw-telemetry-value">{formatMeasurement(row.reading)}</span>
          <span className="sw-telemetry-label">
            {row.reading.quantity}
            {row.reading.validity ? ` · ${row.reading.validity}` : ""}
          </span>
        </div>
      ) : null}

      <div className="sw-field-grid">
        <label className="sw-field">
          <span className="sw-field-label">Display name</span>
          <TextInput
            label="Component display name"
            value={row.displayName}
            onChange={(value) => onPatch({ displayName: value })}
          />
        </label>

        <div className="sw-field">
          <span className="sw-field-label">DTAM sensor</span>
          <Select
            label="Assigned DTAM sensor"
            value={row.sensorId ?? ""}
            disabled={sensorsLoading}
            onChange={assignSensor}
            options={[
              { value: "", label: "Unassigned" },
              ...sensors.map((sensor) => ({
                value: sensor.id,
                label: sensor.quantities ? `${sensor.id} · ${sensor.quantities}` : sensor.id,
              })),
            ]}
          />
          {sensorsLoading ? <span className="sw-field-note">Loading DTAM sensors…</span> : null}
          {sensorsError ? <span className="sw-field-note is-warning">{sensorsError}</span> : null}
          {!sensorsLoading && !sensorsError && sensors.length === 0 ? (
            <span className="sw-field-note">No sensors in the last Twin batch</span>
          ) : null}
        </div>

        <div className="sw-field sw-field-inline">
          <span className="sw-field-label">Visible in viewport</span>
          <Switch
            label={`Show ${row.displayName} in the viewport`}
            checked={!row.hidden}
            onChange={onToggleVisibility}
          />
        </div>

        <div className="sw-field">
          <span className="sw-field-label">Color code</span>
          <div
            className="sw-swatches"
            role="group"
            aria-label={`Color code for ${row.displayName}`}
          >
            <button
              type="button"
              className={`sw-swatch is-clear${row.colorHex ? "" : " is-active"}`}
              aria-label="Studio default color"
              aria-pressed={!row.colorHex}
              title="Studio default"
              onClick={() => onPatch({ colorHex: null })}
            />
            {PART_COLOR_SWATCHES.map((hex) => (
              <button
                type="button"
                key={hex}
                className={`sw-swatch${row.colorHex === hex ? " is-active" : ""}`}
                style={{ background: hex }}
                aria-label={`Color code ${hex}`}
                aria-pressed={row.colorHex === hex}
                title={hex}
                onClick={() => onPatch({ colorHex: row.colorHex === hex ? null : hex })}
              />
            ))}
            <label className="sw-swatch-custom" title="Custom color">
              <input
                type="color"
                value={row.colorHex ?? "#8260fb"}
                aria-label="Custom component color"
                onChange={(event) => onPatch({ colorHex: event.target.value })}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="sw-inspector-actions">
        <button type="button" className="settings-btn" title="Frame in viewport" onClick={onFocus}>
          <Crosshair size={14} strokeWidth={1.8} aria-hidden />
          Focus
        </button>
        <button
          type="button"
          className="settings-btn"
          title="Hide every other part"
          onClick={onIsolate}
        >
          <Focus size={14} strokeWidth={1.8} aria-hidden />
          Isolate
        </button>
        <button
          type="button"
          className="settings-btn"
          title={row.hidden ? "Show in viewport" : "Hide in viewport"}
          onClick={onToggleVisibility}
        >
          {row.hidden ? (
            <Eye size={14} strokeWidth={1.8} aria-hidden />
          ) : (
            <EyeOff size={14} strokeWidth={1.8} aria-hidden />
          )}
          {row.hidden ? "Show" : "Hide"}
        </button>
        <div className="sw-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="sw-icon-btn"
            aria-label="More component actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="More actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
          </button>
          {menuOpen ? (
            <div className="sw-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="sw-menu-item"
                onClick={() => {
                  toggleSimulation();
                  setMenuOpen(false);
                }}
              >
                <FlaskConical size={14} strokeWidth={1.8} aria-hidden />
                {row.inSimulation ? "Remove from simulation" : "Add to simulation"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="sw-menu-item"
                onClick={() => {
                  onPatch({ displayName: humanizePartName(row.cadName) });
                  setMenuOpen(false);
                }}
              >
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden />
                Reset name to CAD node
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <details className="sw-advanced">
        <summary>Advanced properties</summary>
        <dl className="settings-specs">
          <div>
            <dt>CAD node</dt>
            <dd>
              <Mono>{row.cadName}</Mono>
            </dd>
          </div>
          <div>
            <dt>Part id</dt>
            <dd>
              <Mono>{row.partId}</Mono>
            </dd>
          </div>
          <div>
            <dt>Scanner</dt>
            <dd>
              <Mono>{scannerId}</Mono>
            </dd>
          </div>
          <div>
            <dt>Color</dt>
            <dd>{row.colorHex ? <Mono>{row.colorHex}</Mono> : "Studio default"}</dd>
          </div>
          {assigned?.rows.length ? (
            <div>
              <dt>Last batch</dt>
              <dd>
                <ul className="sw-reading-list">
                  {assigned.rows.slice(0, 6).map((reading) => (
                    <li key={reading.measurement_id}>
                      <span>{reading.quantity}</span>
                      <Mono>{formatMeasurement(reading)}</Mono>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {assigned?.rows[0] ? (
            <div>
              <dt>Calibration</dt>
              <dd>
                <Mono>{assigned.rows[0].calibration_version}</Mono>
              </dd>
            </div>
          ) : null}
          {assigned?.rows[0]?.provenance ? (
            <div>
              <dt>Provenance</dt>
              <dd>
                {assigned.rows[0].provenance.source} · {assigned.rows[0].provenance.method}
              </dd>
            </div>
          ) : null}
        </dl>
      </details>
    </aside>
  );
}
