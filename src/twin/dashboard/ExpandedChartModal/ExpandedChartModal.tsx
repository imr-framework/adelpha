import { formatHz, formatTempC, formatTs } from "../../format";
import { linePathOffset } from "../chartPath";
import { DashCameraPreview } from "../DashCameraPreview";
import { FFT_BINS, type DashboardSeries } from "../useDashboardSeries";
import type { DashboardCard } from "../types";

export function ExpandedChartModal({
  expandedCard,
  series,
  cameraPreviewStream,
  onClose,
}: {
  expandedCard: DashboardCard;
  series: DashboardSeries;
  cameraPreviewStream: MediaStream | null;
  onClose: () => void;
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

  const expandedTitle =
    expandedCard === "temp"
      ? "Temperature vs Time"
      : expandedCard === "noiseTime"
        ? "Johnson noise spectrum (DFT magnitude)"
        : expandedCard === "noiseSpec"
          ? "Johnson / thermal noise (time domain)"
          : expandedCard === "mriSpec"
            ? "MRI Signal Frequency Spectrum (EMI Highlighted)"
            : expandedCard === "camPreview"
              ? "Camera preview"
              : expandedCard === "yaw"
                ? "Head yaw vs time"
                : expandedCard === "pitch"
                  ? "Head pitch vs time"
                  : expandedCard === "roll"
                    ? "Head roll vs time"
                    : "";

  return (
    <div className="chart-modal-backdrop" onClick={() => onClose()}>
      <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chart-modal-head">
          <div className="chart-modal-title">{expandedTitle}</div>
          <button type="button" className="chart-modal-close" onClick={() => onClose()}>
            Close
          </button>
        </div>

        {expandedCard === "temp" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <text x="402" y="398" className="axis-label">
              Time
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Temperature (°C)
            </text>
            <path
              d={linePathOffset(tempHistory, tempMin, tempMax, 676, 330, 64, 30)}
              className="dash-line dash-line-temp"
            />
            <text x="64" y="380" className="axis-tick">
              {formatTs(rangeStart)}
            </text>
            <text x="640" y="380" className="axis-tick">
              {formatTs(rangeEnd)}
            </text>
          </svg>
        ) : expandedCard === "noiseTime" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <text x="402" y="398" className="axis-label">
              Frequency bin
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              |X(f)|
            </text>
            <path
              d={linePathOffset(johnsonSpectrum, 0, johnsonSpecMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
            <text x="64" y="380" className="axis-tick">
              0
            </text>
            <text x="300" y="380" className="axis-tick">
              DFT of Johnson noise
            </text>
            <text x="640" y="380" className="axis-tick">
              Nyquist
            </text>
          </svg>
        ) : expandedCard === "noiseSpec" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
            <text x="402" y="398" className="axis-label">
              Time
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Voltage (a.u.)
            </text>
            <path
              d={linePathOffset(johnsonNoise, johnsonMin, johnsonMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-noise"
            />
            <text x="64" y="380" className="axis-tick">
              0
            </text>
            <text x="320" y="380" className="axis-tick">
              Johnson–Nyquist · {formatTempC(johnsonTempC, 1)}
            </text>
            <text x="700" y="380" className="axis-tick">
              t
            </text>
          </svg>
        ) : expandedCard === "mriSpec" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <text x="402" y="398" className="axis-label">
              Frequency
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Magnitude
            </text>
            <line
              x1={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676}
              y1="30"
              x2={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676}
              y2="360"
              className="dash-emi-marker"
            />
            <path
              d={linePathOffset(mriSpectrum, mriSpecMin, mriSpecMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-mri"
            />
            <text x="64" y="380" className="axis-tick">
              1 kHz
            </text>
            <text
              x={64 + (emiBin / Math.max(FFT_BINS - 1, 1)) * 676 - 20}
              y="380"
              className="axis-tick"
            >
              {formatHz(peakHz)}
            </text>
            <text x="640" y="380" className="axis-tick">
              100 kHz
            </text>
          </svg>
        ) : expandedCard === "camPreview" ? (
          <div className="chart-modal-camera">
            <DashCameraPreview stream={cameraPreviewStream} expanded />
          </div>
        ) : expandedCard === "yaw" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
            <text x="402" y="398" className="axis-label">
              Time
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Yaw (°)
            </text>
            <path
              d={linePathOffset(yawHistory, yawMin, yawMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-pose-yaw"
            />
            <text x="64" y="380" className="axis-tick">
              left
            </text>
            <text x="360" y="380" className="axis-tick">
              {yawHistory.length
                ? `${yawHistory[yawHistory.length - 1]!.toFixed(1)}°`
                : "—"}
            </text>
            <text x="700" y="380" className="axis-tick">
              right
            </text>
          </svg>
        ) : expandedCard === "pitch" ? (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
            <text x="402" y="398" className="axis-label">
              Time
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Pitch (°)
            </text>
            <path
              d={linePathOffset(pitchHistory, pitchMin, pitchMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-pose-pitch"
            />
            <text x="64" y="380" className="axis-tick">
              down
            </text>
            <text x="360" y="380" className="axis-tick">
              {pitchHistory.length
                ? `${pitchHistory[pitchHistory.length - 1]!.toFixed(1)}°`
                : "—"}
            </text>
            <text x="700" y="380" className="axis-tick">
              up
            </text>
          </svg>
        ) : (
          <svg viewBox="0 0 780 420" className="chart-modal-svg">
            <line x1="64" y1="30" x2="64" y2="360" className="axis-line" />
            <line x1="64" y1="360" x2="740" y2="360" className="axis-line" />
            <line x1="64" y1="195" x2="740" y2="195" className="axis-line" opacity="0.35" />
            <text x="402" y="398" className="axis-label">
              Time
            </text>
            <text x="18" y="200" className="axis-label" transform="rotate(-90, 18, 200)">
              Roll (°)
            </text>
            <path
              d={linePathOffset(rollHistory, rollMin, rollMax, 676, 330, 64, 30)}
              className="dash-line dash-line-spectrum dash-line-pose-roll"
            />
            <text x="64" y="380" className="axis-tick">
              tilt −
            </text>
            <text x="360" y="380" className="axis-tick">
              {rollHistory.length
                ? `${rollHistory[rollHistory.length - 1]!.toFixed(1)}°`
                : "—"}
            </text>
            <text x="700" y="380" className="axis-tick">
              tilt +
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
