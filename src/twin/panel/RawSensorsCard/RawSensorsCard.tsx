import { useState } from "react";

import type { MeasurementBatch } from "../../dtamTypes";
import { refreshSensorsBatch } from "../../telemetryStore";
import { InfoCard } from "../metrics";

export function RawSensorsCard({ sensorsBatch }: { sensorsBatch: MeasurementBatch | null }) {
  const [showRawSensors, setShowRawSensors] = useState(false);

  async function onLoadRawSensors() {
    setShowRawSensors(true);
    await refreshSensorsBatch();
  }

  return (
    <InfoCard title="Raw sensors">
      <button type="button" className="action-btn" onClick={() => void onLoadRawSensors()}>
        {showRawSensors ? "Refresh /sensors/batch" : "Load /sensors/batch"}
      </button>
      {showRawSensors && sensorsBatch?.measurements?.length ? (
        <div className="raw-table-wrap">
          <table className="raw-table">
            <thead>
              <tr>
                <th>Sensor</th>
                <th>Quantity</th>
                <th>Value</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {sensorsBatch.measurements.map((m) => (
                <tr key={m.measurement_id}>
                  <td>{m.sensor_id}</td>
                  <td>{m.quantity}</td>
                  <td className="num">{m.value.toPrecision(5)}</td>
                  <td>{m.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </InfoCard>
  );
}
