import type { MeasurementBatch, SystemState, TwinAssessment } from "../dtamTypes";
import type { TwinViewControls } from "../telemetryStore";
import { AssessCard } from "./AssessCard";
import { EmiCard } from "./EmiCard";
import { ForecastCard } from "./ForecastCard";
import { MagneticCard } from "./MagneticCard";
import { NotesCard } from "./NotesCard";
import { RawSensorsCard } from "./RawSensorsCard";
import { RfNoiseCard } from "./RfNoiseCard";
import { ThermalCard } from "./ThermalCard";
import { ViewCard } from "./ViewCard";

export function TelemetryPanel({
  systemState,
  lastError,
  connected,
  forecastBusy,
  assessBusy,
  lastAssessment,
  sensorsBatch,
  view,
  setView,
  scannerId,
  hasCadMagnet,
  explodePartCount,
  polishedFinish,
  setPolishedFinish,
}: {
  systemState: SystemState | null;
  lastError: string | null;
  connected: boolean;
  forecastBusy: boolean;
  assessBusy: boolean;
  lastAssessment: TwinAssessment | null;
  sensorsBatch: MeasurementBatch | null;
  view: TwinViewControls;
  setView: (patch: Partial<TwinViewControls>) => void;
  scannerId: string;
  hasCadMagnet: boolean;
  explodePartCount: number;
  polishedFinish: boolean;
  setPolishedFinish: (next: boolean) => void;
}) {
  return (
    <>
      {lastError ? (
        <div className="error-banner" role="status">
          {lastError}
        </div>
      ) : null}

      <div className="info-card-stack">
        <ThermalCard thermal={systemState?.thermal ?? null} />
        <MagneticCard magnetic={systemState?.magnetic ?? null} />
        <EmiCard emi={systemState?.emi ?? null} />
        <RfNoiseCard rf={systemState?.rf ?? null} />
        <ForecastCard forecastBusy={forecastBusy} connected={connected} />
        <AssessCard
          assessBusy={assessBusy}
          connected={connected}
          lastAssessment={lastAssessment}
        />
        <NotesCard systemState={systemState} />
        <RawSensorsCard sensorsBatch={sensorsBatch} />
        <ViewCard
          view={view}
          setView={setView}
          scannerId={scannerId}
          hasCadMagnet={hasCadMagnet}
          explodePartCount={explodePartCount}
          polishedFinish={polishedFinish}
          setPolishedFinish={setPolishedFinish}
        />
      </div>
    </>
  );
}
