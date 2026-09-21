import { formatHz, formatTempC, formatTs } from "../format";
import type { TwinTelemetry } from "../types";
import { linePath } from "./chartPath";
import { DashCameraPreview } from "./DashCameraPreview";
import { FFT_BINS, type DashboardSeries } from "./useDashboardSeries";
import type { DashboardCard } from "./types";

export function LiveDashboard({
  series,
  stageMode,
  cameraPreviewStream,
  telemetry,
  onExpand,
}: {
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
    mriSpectrum,
    mriSpecMin,
    mriSpecMax,
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
        <button type="button" className="dash-card" onClick={() => onExpand("temp")}>
          <div className="dash-title">Magnet temperature (time)</div>
          <svg viewBox="0 0 300 88" className="dash-svg">
            <path
              d={linePath(tempHistory, tempMin, tempMax, 300, 88)}
              className="dash-line dash-line-temp"
            />
          </svg>
          <div className="dash-stamp-row">
            <span>{formatTs(rangeStart)}</span>
            <span>{formatTs(rangeEnd)}</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => onExpand("noiseTime")}>
          <div className="dash-title">
            Johnson noise spectrum{" "}
            <span className="dash-stamp-inline">DFT · √T</span>
          </div>
          <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <path
              d={linePath(johnsonSpectrum, 0, johnsonSpecMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
          </svg>
          <div className="dash-stamp-row">
            <span>0</span>
            <span>|X(f)|</span>
            <span>Nyquist</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => onExpand("noiseSpec")}>
          <div className="dash-title">
            Johnson noise (time){" "}
            <span className="dash-stamp-inline">
              √T · {formatTempC(johnsonTempC, 1)}
            </span>
          </div>
          <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <path
              d={linePath(johnsonNoise, johnsonMin, johnsonMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
          </svg>
          <div className="dash-stamp-row">
            <span>0</span>
            <span>thermal / Gaussian</span>
            <span>t</span>
          </div>
        </button>

        <button type="button" className="dash-card" onClick={() => onExpand("mriSpec")}>
          <div className="dash-title">
            MRI signal spectrum (EMI @ {formatHz(peakHz)}){" "}
            <span className="dash-stamp-inline">{formatTs(telemetry.device_time_ms)}</span>
          </div>
          <svg viewBox="0 0 300 88" className="dash-svg" preserveAspectRatio="none">
            <line
              x1={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
              y1="0"
              x2={(emiBin / Math.max(FFT_BINS - 1, 1)) * 300}
              y2="88"
              className="dash-emi-marker"
            />
            <path
              d={linePath(mriSpectrum, mriSpecMin, mriSpecMax, 300, 88)}
              className="dash-line dash-line-spectrum dash-line-mri"
            />
          </svg>
          <div className="dash-stamp-row">
            <span>1 kHz</span>
            <span>EMI</span>
            <span>100 kHz</span>
          </div>
        </button>
          </>
        )}
      </div>
    </div>
  );
}
