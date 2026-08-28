import { useMemo } from "react";

import type { MeasurementBatch, SensorMeasurement } from "../dtamTypes";
import {
  inferPartRole,
  listPartsForScanner,
  resolvePartBinding,
  selectHiddenParts,
  usePartInspectorStore,
} from "../partInspectorStore";
import type { ScannerModelId } from "../scannerModel";
import { useTwinStore } from "../telemetryStore";

export type SensorOption = {
  id: string;
  /** Distinct quantities the sensor reported in the last batch. */
  quantities: string;
  rows: SensorMeasurement[];
};

/** One CAD part, flattened with its binding, visibility, and latest reading. */
export type ComponentRow = {
  partId: string;
  cadName: string;
  displayName: string;
  type: string;
  sensorId: string | null;
  inSimulation: boolean;
  colorHex: string | null;
  hidden: boolean;
  /** Newest measurement for the assigned sensor, or null when there is none. */
  reading: SensorMeasurement | null;
  /** True when a sensor is assigned but the last batch carried no sample. */
  sensorStale: boolean;
  /** Twin API is down, so an assigned sensor cannot be live. */
  sensorDisconnected: boolean;
};

export function groupSensors(batch: MeasurementBatch | null | undefined): SensorOption[] {
  const map = new Map<string, SensorMeasurement[]>();
  for (const item of batch?.measurements ?? []) {
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

export function useSensorOptions(): SensorOption[] {
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  return useMemo(() => groupSensors(sensorsBatch), [sensorsBatch]);
}

export function useComponentRows(scannerId: ScannerModelId): ComponentRow[] {
  const catalog = usePartInspectorStore((s) => s.catalog);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const hiddenIds = usePartInspectorStore((s) => selectHiddenParts(s, scannerId));
  const sensors = useSensorOptions();
  const connection = useTwinStore((s) => s.connection);
  const health = useTwinStore((s) => s.health);
  const twinLive = connection === "connected" && (health?.connected ?? false);

  return useMemo(() => {
    const hidden = new Set(hiddenIds);
    const byId = new Map(sensors.map((sensor) => [sensor.id, sensor]));
    return listPartsForScanner(scannerId, catalog, bindings).map((part) => {
      const binding = resolvePartBinding({ ...part, scannerId }, bindings);
      const sensor = binding.sensorId ? byId.get(binding.sensorId) : undefined;
      const reading = sensor?.rows[sensor.rows.length - 1] ?? null;
      return {
        partId: part.partId,
        cadName: part.cadName,
        displayName: binding.displayName,
        type: inferPartRole(part.cadName),
        sensorId: binding.sensorId,
        inSimulation: binding.inSimulation,
        colorHex: binding.colorHex,
        hidden: hidden.has(part.partId),
        reading,
        sensorStale: Boolean(binding.sensorId) && !reading && twinLive,
        sensorDisconnected: Boolean(binding.sensorId) && !twinLive,
      };
    });
  }, [scannerId, catalog, bindings, hiddenIds, sensors, twinLive]);
}

export function componentTypes(rows: ComponentRow[]): string[] {
  return [...new Set(rows.map((row) => row.type))].sort((a, b) => a.localeCompare(b));
}

/** Search covers display name, CAD node, type, and assigned sensor. */
export function filterComponentRows(
  rows: ComponentRow[],
  query: string,
  type: string,
): ComponentRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (type !== "all" && row.type !== type) return false;
    if (!q) return true;
    return (
      row.displayName.toLowerCase().includes(q) ||
      row.cadName.toLowerCase().includes(q) ||
      row.type.toLowerCase().includes(q) ||
      (row.sensorId ?? "").toLowerCase().includes(q)
    );
  });
}

export function formatMeasurement(row: SensorMeasurement): string {
  const value = Number.isFinite(row.value) ? row.value.toPrecision(4) : "—";
  return `${value}${row.unit ? ` ${row.unit}` : ""}`;
}
