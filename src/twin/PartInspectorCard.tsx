import { useMemo } from "react";
import { X } from "lucide-react";
import { formatTempC } from "./format";
import {
  inferPartRole,
  resolvePartBinding,
  usePartInspectorStore,
} from "./partInspectorStore";
import { cadForScanner, getScannerProfile, useScannerModel } from "./scannerModel";
import { useTwinStore } from "./telemetryStore";
import type { SensorMeasurement } from "./dtamTypes";

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

function formatReading(row: SensorMeasurement): string {
  const value = Number.isFinite(row.value) ? row.value.toPrecision(5) : "—";
  return `${value} ${row.unit}`.trim();
}

export function PartInspectorCard() {
  const selected = usePartInspectorStore((s) => s.selected);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const clearSelection = usePartInspectorStore((s) => s.clearSelection);
  const telemetry = useTwinStore((s) => s.telemetry);
  const systemState = useTwinStore((s) => s.systemState);
  const connection = useTwinStore((s) => s.connection);
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const [scannerId] = useScannerModel();
  const hasCad = Boolean(cadForScanner(scannerId));

  const binding = selected ? resolvePartBinding(selected, bindings) : null;
  const sensors = useMemo(
    () => uniqueSensors(sensorsBatch?.measurements),
    [sensorsBatch],
  );
  const assignedRows = useMemo(() => {
    if (!binding?.sensorId) return [];
    return sensors.find((sensor) => sensor.id === binding.sensorId)?.rows ?? [];
  }, [binding?.sensorId, sensors]);

  const scannerLabel = selected
    ? getScannerProfile(selected.scannerId).displayName
    : "";
  const twinMode = systemState?.mode ?? "—";
  const connected = connection === "connected";

  if (!selected && inspectionMode && hasCad) {
    return (
      <div className="part-inspect-hint">
        Inspection mode · click a part to inspect
      </div>
    );
  }
  if (!selected || !binding) return null;

  return (
    <article className="part-inspect-card" aria-label="Selected part">
      <header className="part-inspect-head">
        <div className="part-inspect-kicker">Component</div>
        <div className="part-inspect-actions">
          <button
            type="button"
            className="part-inspect-icon"
            aria-label="Deselect part"
            onClick={() => clearSelection()}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <h3 className="part-inspect-title">
        {binding.colorHex ? (
          <span className="part-inspect-chip" style={{ background: binding.colorHex }} aria-hidden />
        ) : null}
        {binding.displayName}
      </h3>

      <p className="part-inspect-meta">
        {inferPartRole(selected.cadName)} · {scannerLabel}
        {binding.inSimulation ? <span className="part-inspect-sim">In simulation</span> : null}
      </p>

      <dl className="part-inspect-dl">
        <div>
          <dt>CAD node</dt>
          <dd>{selected.cadName}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>
            {connected ? "Live" : connection} · {twinMode}
            <br />
            Magnet {formatTempC(telemetry.magnet_temp_C, 2)}
            {telemetry.sequence_active ? " · sequence" : " · idle"}
          </dd>
        </div>
        <div>
          <dt>Sensor</dt>
          <dd>
            {binding.sensorId ? (
              <>
                <span className="part-inspect-sensor-id">{binding.sensorId}</span>
                {assignedRows.length > 0 ? (
                  <ul className="part-inspect-readings">
                    {assignedRows.slice(0, 4).map((row) => (
                      <li key={row.measurement_id}>
                        {row.quantity} {formatReading(row)}
                        {row.validity ? ` · ${row.validity}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="part-inspect-muted">No live sample in last batch</div>
                )}
              </>
            ) : (
              <span className="part-inspect-muted">Unassigned</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Color</dt>
          <dd>
            {binding.colorHex ? (
              <span className="part-inspect-color-value">
                <span className="part-inspect-chip" style={{ background: binding.colorHex }} aria-hidden />
                {binding.colorHex}
              </span>
            ) : (
              <span className="part-inspect-muted">Studio default</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}
