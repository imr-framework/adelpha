import {
  createScan,
  fetchCurrentExam,
  fetchScan,
  patchScan,
  startExam,
} from "./mri/api";
import type { ExamResponse, ScanQueueEntry } from "./mri/types";

export type AcquisitionHandoff = {
  sequence: string;
  protocol_name: string;
  parameters: Record<string, unknown>;
};

const EVENT = "adelpha:use-acquisition-parameters";
let pending: AcquisitionHandoff | null = null;

export function requestUseAcquisitionParameters(handoff: AcquisitionHandoff) {
  pending = {
    sequence: handoff.sequence,
    protocol_name: handoff.protocol_name.trim() || handoff.sequence,
    parameters: { ...handoff.parameters },
  };
  window.dispatchEvent(new CustomEvent<AcquisitionHandoff>(EVENT, { detail: pending }));
}

export function takeAcquisitionHandoff(): AcquisitionHandoff | null {
  const next = pending;
  pending = null;
  return next;
}

export function subscribeAcquisitionHandoff(onHandoff: (handoff: AcquisitionHandoff) => void) {
  const handler = (event: Event) => {
    onHandoff((event as CustomEvent<AcquisitionHandoff>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function subscribeOpenImagingConsole(onOpen: () => void) {
  return subscribeAcquisitionHandoff(() => onOpen());
}

function simulationPatient(name: string) {
  const label = name.replace(/[^\w .-]/g, "").slice(0, 24) || "MRZero";
  return {
    first_name: label,
    last_name: "Simulation",
    mrn: `MR0${Date.now().toString(36).toUpperCase()}`.slice(0, 16),
    birth_date: "20231016",
    gender: "O",
    weight_kg: 20,
    height_cm: 100,
    age: 2,
  };
}

export async function applyAcquisitionHandoff(handoff: AcquisitionHandoff): Promise<{
  exam: ExamResponse;
  entry: ScanQueueEntry;
  parameters: Record<string, unknown>;
}> {
  let exam = await fetchCurrentExam();
  if (!exam) {
    exam = await startExam({
      patient: simulationPatient(handoff.protocol_name),
      acc: "MR0",
      patient_position: "HFS",
    });
  }
  const entry = await createScan(handoff.sequence, handoff.protocol_name);
  const detail = await fetchScan(entry.id);
  const parameters = { ...(detail.task?.parameters ?? {}), ...handoff.parameters };
  await patchScan(entry.id, { parameters, protocol_name: handoff.protocol_name });
  return { exam, entry, parameters };
}
