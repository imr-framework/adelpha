import { useState, type FormEvent } from "react";

import { requestForecast } from "../../telemetryStore";
import { InfoCard } from "../metrics";

export function ForecastCard({
  forecastBusy,
  connected,
}: {
  forecastBusy: boolean;
  connected: boolean;
}) {
  const [horizonS, setHorizonS] = useState(60);
  const [setpointC, setSetpointC] = useState("26");
  const [heatingRate, setHeatingRate] = useState("0");
  const [usePinn, setUsePinn] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);

  async function onForecast(e: FormEvent) {
    e.preventDefault();
    setForecastError(null);
    const setpoint = setpointC.trim() === "" ? null : Number(setpointC);
    const rate = Number(heatingRate);
    if (!(horizonS > 0)) {
      setForecastError("Horizon must be > 0 seconds");
      return;
    }
    try {
      await requestForecast({
        predict_horizon_s: horizonS,
        magnet_heating_rate_c_per_s: Number.isFinite(rate) ? rate : 0,
        magnet_setpoint_c: setpoint != null && Number.isFinite(setpoint) ? setpoint : null,
        use_thermal_pinn: usePinn,
      });
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <InfoCard title="Forecast">
      <form className="forecast-form" onSubmit={onForecast}>
        <label className="control">
          <span>Horizon (s)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={horizonS}
            onChange={(e) => setHorizonS(Number(e.target.value))}
          />
        </label>
        <label className="control">
          <span>Magnet setpoint (°C, optional)</span>
          <input
            type="number"
            step={0.1}
            value={setpointC}
            onChange={(e) => setSetpointC(e.target.value)}
            placeholder="e.g. 26"
          />
        </label>
        <label className="control">
          <span>Heating rate (°C/s)</span>
          <input
            type="number"
            step={0.001}
            value={heatingRate}
            onChange={(e) => setHeatingRate(e.target.value)}
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={usePinn}
            onChange={(e) => setUsePinn(e.target.checked)}
          />
          <span>Prefer thermal PINN when available</span>
        </label>
        <button type="submit" className="action-btn" disabled={forecastBusy || !connected}>
          {forecastBusy ? "Running forecast…" : "Run forecast"}
        </button>
        {forecastError ? <div className="error-banner">{forecastError}</div> : null}
      </form>
    </InfoCard>
  );
}
