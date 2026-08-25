import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, FlaskConical, Radio, X } from "lucide-react";
import { pushConsole } from "./consoleLog";
import type { SensorMeasurement } from "./dtamTypes";
import {
  humanizePartName,
  inferPartRole,
  listPartsForScanner,
  PART_COLOR_SWATCHES,
  resolvePartBinding,
  usePartInspectorStore,
  type CadPartRef,
  type PartBinding,
} from "./partInspectorStore";
import { cadForScanner, getScannerProfile, type ScannerModelId } from "./scannerModel";
import { refreshSensorsBatch, useTwinStore } from "./telemetryStore";

function uniqueSensors(measurements: SensorMeasurement[] | undefined) {
  const map = new Map<string, SensorMeasurement[]>();
  for (const item of measurements ?? []) {
    const list = map.get(item.sensor_id) ?? [];
    list.push(item);
    map.set(item.sensor_id, list);
  }
  return [...map.entries()].map(([id, rows]) => ({
    id,
    quantities: [...new Set(rows.map((row) => row.quantity))].join(", "),
    rows,
  }));
}

export function ModelLibraryParts({
  scannerId,
  focusPartId,
}: {
  scannerId: ScannerModelId;
  focusPartId?: string;
}) {
  const catalog = usePartInspectorStore((s) => s.catalog);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const patchBinding = usePartInspectorStore((s) => s.patchBinding);
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  const cad = cadForScanner(scannerId);
  const profile = getScannerProfile(scannerId);
  const parts = useMemo(
    () => listPartsForScanner(scannerId, catalog, bindings),
    [scannerId, catalog, bindings],
  );
  const [openId, setOpenId] = useState<string | null>(focusPartId ?? null);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const sensors = useMemo(
    () => uniqueSensors(sensorsBatch?.measurements),
    [sensorsBatch],
  );
  const selectedPart = parts.find((part) => part.partId === openId) ?? null;
  const selectedBinding = selectedPart
    ? resolvePartBinding({ ...selectedPart, scannerId }, bindings)
    : null;

  useEffect(() => {
    if (focusPartId) setOpenId(focusPartId);
  }, [focusPartId]);

  useEffect(() => {
    if (!focusPartId) return;
    const node = document.querySelector(`[data-part-id="${CSS.escape(focusPartId)}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [focusPartId, parts]);

  useEffect(() => {
    if ((sensorsBatch?.measurements.length ?? 0) > 0) {
      setLoadingSensors(false);
      return;
    }
    let cancelled = false;
    setLoadingSensors(true);
    setSensorError(null);
    void refreshSensorsBatch().then((batch) => {
      if (cancelled) return;
      setLoadingSensors(false);
      if (!batch) setSensorError("Could not load sensors from Twin API");
    });
    return () => {
      cancelled = true;
      setLoadingSensors(false);
    };
  }, [sensorsBatch?.measurements.length]);

  if (!cad) {
    return (
      <p className="settings-part-empty">
        {profile.displayName} has no CAD assembly to configure.
      </p>
    );
  }

  if (parts.length === 0) {
    return (
      <p className="settings-part-empty">
        Open the Digital Twin viewport once to discover parts from this scanner’s CAD.
      </p>
    );
  }

  return (
    <div className="settings-part-library">
      <header className="settings-part-head">
        <p className="settings-part-intro">
          Names, colors, and DTAM sensors for {profile.displayName}. Saved with this scanner.
        </p>
        <span className="settings-part-count">
          {parts.length} {parts.length === 1 ? "part" : "parts"}
        </span>
      </header>

      <div className="settings-part-grid">
        {parts.map((part) => {
          const binding = resolvePartBinding({ ...part, scannerId }, bindings);
          const selected = openId === part.partId;
          const role = inferPartRole(part.cadName);
          return (
            <button
              key={part.partId}
              type="button"
              data-part-id={part.partId}
              className={`settings-part-tile${selected ? " is-selected" : ""}${binding.colorHex ? " is-coded" : ""}`}
              style={
                {
                  "--part-color": binding.colorHex ?? "rgba(255,255,255,0.16)",
                } as CSSProperties
              }
              aria-pressed={selected}
              onClick={() => setOpenId(selected ? null : part.partId)}
            >
              <span className="settings-part-swatch" aria-hidden />
              <span className="settings-part-tile-body">
                <span className="settings-part-role">{role}</span>
                <span className="settings-part-name">{binding.displayName}</span>
                <span className="settings-part-flags">
                  <span className={binding.sensorId ? "is-on" : undefined}>
                    <Radio size={11} strokeWidth={2} aria-hidden />
                    {binding.sensorId ? "Sensor" : "No sensor"}
                  </span>
                  <span className={binding.inSimulation ? "is-on" : undefined}>
                    <FlaskConical size={11} strokeWidth={2} aria-hidden />
                    {binding.inSimulation ? "Sim" : "Idle"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedPart && selectedBinding ? (
        <PartConfigFields
          part={selectedPart}
          scannerId={scannerId}
          binding={selectedBinding}
          sensors={sensors}
          loadingSensors={loadingSensors}
          sensorError={sensorError}
          onPatch={(patch) => patchBinding(scannerId, selectedPart.partId, patch)}
          onClose={() => setOpenId(null)}
        />
      ) : (
        <p className="settings-part-hint">Select a part to edit its properties.</p>
      )}
    </div>
  );
}

function PartConfigFields({
  part,
  scannerId,
  binding,
  sensors,
  loadingSensors,
  sensorError,
  onPatch,
  onClose,
}: {
  part: CadPartRef;
  scannerId: ScannerModelId;
  binding: PartBinding;
  sensors: ReturnType<typeof uniqueSensors>;
  loadingSensors: boolean;
  sensorError: string | null;
  onPatch: (patch: Partial<PartBinding>) => void;
  onClose: () => void;
}) {
  function onAssignSensor(sensorId: string) {
    const next = sensorId || null;
    onPatch({ sensorId: next });
    const name = binding.displayName || humanizePartName(part.cadName);
    if (next) pushConsole("INFO", `Assigned sensor ${next} to ${name}`);
    else pushConsole("INFO", `Cleared sensor on ${name}`);
  }

  function onToggleSimulation() {
    const next = !binding.inSimulation;
    onPatch({ inSimulation: next });
    const name = binding.displayName || humanizePartName(part.cadName);
    pushConsole(
      next ? "SUCCESS" : "INFO",
      next
        ? `Added ${name} to simulation${binding.sensorId ? ` · ${binding.sensorId}` : ""}`
        : `Removed ${name} from simulation`,
    );
  }

  return (
    <div
      className="settings-part-editor"
      style={
        {
          "--part-color": binding.colorHex ?? "rgba(255, 255, 255, 0.16)",
        } as CSSProperties
      }
    >
      <header className="settings-part-editor-head">
        <div>
          <div className="settings-part-editor-kicker">{inferPartRole(part.cadName)}</div>
          <h5 className="settings-part-editor-title">{binding.displayName}</h5>
          <p className="settings-part-note">CAD node {part.cadName} · {scannerId}</p>
        </div>
        <button
          type="button"
          className="settings-part-editor-close"
          aria-label="Close part editor"
          onClick={onClose}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>

      <label className="settings-part-field">
        <span>Name</span>
        <input
          className="settings-input"
          value={binding.displayName}
          onChange={(event) => onPatch({ displayName: event.target.value })}
        />
      </label>

      <label className="settings-part-field">
        <span>Assign sensor</span>
        <span className="settings-select-wrap">
          <select
            value={binding.sensorId ?? ""}
            disabled={loadingSensors}
            onChange={(event) => onAssignSensor(event.target.value)}
          >
            <option value="">Unassigned</option>
            {sensors.map((sensor) => (
              <option key={sensor.id} value={sensor.id}>
                {sensor.id}
                {sensor.quantities ? ` · ${sensor.quantities}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
        </span>
        {loadingSensors ? <span className="settings-part-note">Loading DTAM sensors…</span> : null}
        {sensorError ? <span className="settings-part-note is-error">{sensorError}</span> : null}
        {!loadingSensors && !sensorError && sensors.length === 0 ? (
          <span className="settings-part-note">No sensors in the last Twin batch</span>
        ) : null}
      </label>

      <div className="settings-part-field">
        <span>Color code</span>
        <div className="part-inspect-swatches" role="group" aria-label={`Color for ${binding.displayName}`}>
          <button
            type="button"
            className={`part-inspect-swatch is-clear${binding.colorHex ? "" : " is-active"}`}
            aria-label="Clear part color"
            onClick={() => onPatch({ colorHex: null })}
          />
          {PART_COLOR_SWATCHES.map((hex) => (
            <button
              type="button"
              key={hex}
              className={`part-inspect-swatch${binding.colorHex === hex ? " is-active" : ""}`}
              style={{ background: hex }}
              aria-label={`Color part ${hex}`}
              aria-pressed={binding.colorHex === hex}
              onClick={() => onPatch({ colorHex: binding.colorHex === hex ? null : hex })}
            />
          ))}
          <label className="part-inspect-custom-color" title="Custom color">
            <input
              type="color"
              value={binding.colorHex ?? "#8260fb"}
              aria-label="Custom part color"
              onChange={(event) => onPatch({ colorHex: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="settings-part-field">
        <span>Simulation</span>
        <button
          type="button"
          className={`settings-part-sim${binding.inSimulation ? " is-on" : ""}`}
          aria-pressed={binding.inSimulation}
          onClick={onToggleSimulation}
        >
          <FlaskConical size={14} strokeWidth={1.8} aria-hidden />
          Add to simulation
        </button>
      </div>
    </div>
  );
}
