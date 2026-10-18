import { SensorWaiting } from "../SensorWaiting";
import { formatHz, formatRmsV, formatTempC, formatTs } from "../../format";
import type { TwinTelemetry } from "../../types";
import { linePath } from "../chartPath";
import { DashCameraPreview } from "../DashCameraPreview";
import { FFT_BINS, type DashboardSeries } from "../useDashboardSeries";
import type { DashboardCard } from "../types";

export function LiveDashboard({
  waitingForSensors = false,
  sensorMode = "hardware",
  sensorNotes = [],
  series,
  stageMode,
  cameraPreviewStream,
  onExpand,
}: {
  waitingForSensors?: boolean;
  sensorMode?: string;
  sensorNotes?: string[];
  series: DashboardSeries;
  stageMode: "magnet" | "camera";
  cameraPreviewStream: MediaStream | null;
  telemetry: TwinTelemetry;
  onExpand: (card: DashboardCard) => void;
}) {
  const {
    tempHistory,
    tempMin,
    tempMax,
    rangeStart,
    rangeEnd,
    peakHz,
    johnsonTempC,
    johnsonNoise,
    johnsonMin,
    johnsonMax,
    johnsonSpectrum,
    johnsonSpecMax,
    emiBin,
    emiSpectrum,
    emiSpecMin,
    emiSpecMax,
    yawHistory,
    yawMin,
    yawMax,
    pitchHistory,
    pitchMin,
    pitchMax,
    rollHistory,
    rollMin,
    rollMax,
  } = series;

  if (waitingForSensors && stageMode !== "camera") return <div className="liquid-dashboard sensor-dashboard"><SensorWaiting mode={sensorMode} notes={sensorNotes} /></div>;

  return (
    <div className="liquid-dashboard">
      <div className="dash-grid">
        {stageMode === "camera" ? (
          <>
            <button
              type="button"
              className="dash-card"
              onClick={() => onExpand("camPreview")}
            >
              <div className="dash-title">
                Camera preview{" "}
                <span className="dash-stamp-inline">live duplicate</span>
              </div>
              <DashCameraPreview stream={cameraPreviewStream} />
            </button>

            <button type="button" className="dash-card" onClick={() => onExpand("yaw")}>
              <div className="dash-title">
                Yaw{" "}
                <span className="dash-stamp-inline">
                  {yawHistory.length ? `${yawHistory[yawHistory.length - 1]!.toFixed(1)}°` : "—"}
                </span>
              </div>
              <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                <path
                  d={linePath(yawHistory, yawMin, yawMax, 300, 88)}
                  className="dash-line dash-line-spectrum dash-line-pose-yaw"
                />
              </svg>
              <div className="dash-stamp-row">
                <span>left</span>
                <span>time</span>
                <span>right</span>
              </div>
            </button>

            <button type="button" className="dash-card" onClick={() => onExpand("pitch")}>
              <div className="dash-title">
                Pitch{" "}
                <span className="dash-stamp-inline">
                  {pitchHistory.length
                    ? `${pitchHistory[pitchHistory.length - 1]!.toFixed(1)}°`
                    : "—"}
                </span>
              </div>
              <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                <path
                  d={linePath(pitchHistory, pitchMin, pitchMax, 300, 88)}
                  className="dash-line dash-line-spectrum dash-line-pose-pitch"
                />
              </svg>
              <div className="dash-stamp-row">
                <span>down</span>
                <span>time</span>
                <span>up</span>
              </div>
            </button>

            <button type="button" className="dash-card" onClick={() => onExpand("roll")}>
              <div className="dash-title">
                Roll{" "}
                <span className="dash-stamp-inline">
                  {rollHistory.length
                    ? `${rollHistory[rollHistory.length - 1]!.toFixed(1)}°`
                    : "—"}
                </span>
              </div>
              <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
                <path
                  d={linePath(rollHistory, rollMin, rollMax, 300, 88)}
                  className="dash-line dash-line-spectrum dash-line-pose-roll"
                />
              </svg>
              <div className="dash-stamp-row">
                <span>tilt −</span>
                <span>time</span>
                <span>tilt +</span>
              </div>
            </button>
          </>
        ) : (
          <>
        <button type="button" className="dash-card" onClick={() => series.temperatureAvailable && onExpand("temp")}>
          <div className="dash-title">Magnet temperature (time)</div>
          {series.temperatureAvailable ? <svg viewBox="0 0 300 88" className="dash-svg">
            <path
              d={linePath(tempHistory, tempMin, tempMax, 300, 88)}
              className="dash-line dash-line-temp"
            />
          </svg> : <p className="dash-unavailable">Temperature sensor not connected</p>}
          <div className="dash-stamp-row">
            <span>{series.temperatureAvailable ? formatTs(rangeStart) : "—"}</span>
            <span>{series.temperatureAvailable ? formatTs(rangeEnd) : "—"}</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => series.simulation && onExpand("noiseTime")}>
          <div className="dash-title">
            Johnson noise spectrum{" "}
            <span className="dash-stamp-inline">{series.simulation ? "Simulated · DFT · √T" : "Not measured"}</span>
          </div>
          {series.simulation ? <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <path
              d={linePath(johnsonSpectrum, 0, johnsonSpecMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
          </svg> : <p className="dash-unavailable">Johnson noise is simulated only; it is not measured in hardware</p>}
          <div className="dash-stamp-row">
            <span>0</span>
            <span>|X(f)|</span>
            <span>Nyquist</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => series.simulation && onExpand("noiseSpec")}>
          <div className="dash-title">
            Johnson noise (time){" "}
            <span className="dash-stamp-inline">
              {series.simulation ? `Simulated · √T · ${formatTempC(johnsonTempC, 1)}` : "Not measured"}
            </span>
          </div>
          {series.simulation ? <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <path
              d={linePath(johnsonNoise, johnsonMin, johnsonMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
          </svg> : <p className="dash-unavailable">Johnson noise is simulated only; it is not measured in hardware</p>}
          <div className="dash-stamp-row">
            <span>0</span>
            <span>thermal / Gaussian</span>
            <span>t</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => series.simulation && onExpand("emiSpec")}>
          <div className="dash-title">
            EMI sensor spectrum{" "}
            <span className="dash-stamp-inline">{series.simulation ? "Simulated · a.u." : series.emiAvailable ? `${formatRmsV(series.emiRms)} · no spectrum` : "Not connected"}</span>
          </div>
          {series.simulation ? <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <line
              x1={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
              y1="0"
              x2={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
              y2="88"
              className="dash-emi-marker"
            />
            <path
              d={linePath(emiSpectrum, emiSpecMin, emiSpecMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-mri"
            />
          </svg> : <p className="dash-unavailable">{series.emiAvailable ? "EMI RMS is on Telemetry; this protocol does not publish a spectrum" : "EMI sensor not connected"}</p>}
          <div className="dash-stamp-row">
            <span>1 kHz</span>
            <span>{series.simulation ? `Peak ${formatHz(peakHz)} · log frequency` : series.emiAvailable ? "RMS only" : "No EMI data"}</span>
            <span>100 kHz</span>
          </div>
        </button>
          </>
        )}
      </div>
    </div>
  );
}
