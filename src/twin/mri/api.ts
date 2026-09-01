import { apiRoot, runtimeFetch, withToken } from "../../desktop/runtime";
import type {
  ExamResponse,
  HealthResponse,
  MriEvent,
  PatientInformation,
  ScanDetail,
  ScanQueueEntry,
  ScanTask,
  SequenceInfo,
  ValidateResponse,
} from "./types";

export function mriBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_MRI_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return `${apiRoot()}/api/mri`;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      if (typeof json.detail === "string") return json.detail;
      if (json.detail && typeof json.detail === "object") {
        const detail = json.detail as { problems?: unknown };
        if (Array.isArray(detail.problems) && detail.problems.length) {
          return detail.problems.map(String).join("; ");
        }
        return JSON.stringify(json.detail);
      }
    } catch {
      /* plain */
    }
  return text || `${res.status} ${res.statusText}`;
}

async function mriFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await runtimeFetch(`${mriBaseUrl()}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchMriHealth(): Promise<HealthResponse> {
  return mriFetch("/health");
}

export async function fetchCurrentExam(): Promise<ExamResponse | null> {
  const res = await runtimeFetch(`${mriBaseUrl()}/exams/current`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json();
  return body ?? null;
}

export async function startExam(input: {
  patient: PatientInformation;
  acc?: string;
  patient_position?: string;
}): Promise<ExamResponse> {
  return mriFetch("/exams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function endExam(): Promise<void> {
  await mriFetch("/exams/current", { method: "DELETE" });
}

export async function fetchSequences(adjustments = false): Promise<SequenceInfo[]> {
  const qs = adjustments ? "?adjustments=true" : "";
  return mriFetch(`/sequences${qs}`);
}

export async function validateSequence(
  name: string,
  parameters: Record<string, unknown>,
): Promise<ValidateResponse> {
  return mriFetch(`/sequences/${encodeURIComponent(name)}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parameters }),
  });
}

export async function fetchScans(): Promise<ScanQueueEntry[]> {
  return mriFetch("/scans");
}

export async function createScan(sequence: string, protocol_name = "", prepared = false): Promise<ScanQueueEntry> {
  return mriFetch("/scans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sequence, protocol_name, prepared }),
  });
}

export async function fetchScan(id: string): Promise<ScanDetail> {
  return mriFetch(`/scans/${encodeURIComponent(id)}`);
}

export async function patchScan(
  id: string,
  body: { parameters?: Record<string, unknown>; protocol_name?: string },
): Promise<ScanTask> {
  return mriFetch(`/scans/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function prepareScan(id: string): Promise<ScanQueueEntry> {
  return mriFetch(`/scans/${encodeURIComponent(id)}/prepare`, { method: "POST" });
}

export async function editScan(id: string): Promise<ScanQueueEntry> {
  return mriFetch(`/scans/${encodeURIComponent(id)}/edit`, { method: "POST" });
}

export async function stopScan(id: string): Promise<void> {
  await mriFetch(`/scans/${encodeURIComponent(id)}/stop`, { method: "POST" });
}

export type DevicePing = {
  ip: string;
  ok: boolean;
  simulation: boolean;
  reachable?: boolean;
  method?: string;
  detail?: string;
};

export function formatDevicePingStatus(ping: DevicePing): string {
  const reachable = ping.reachable ?? ping.ok;
  if (ping.simulation && reachable) {
    return ping.detail ? `Simulation · ${ping.detail}` : `Simulation · Red Pitaya at ${ping.ip}`;
  }
  if (ping.simulation) {
    return `Simulation · no Red Pitaya at ${ping.ip}`;
  }
  if (reachable) {
    return ping.detail || `Scanner reachable at ${ping.ip}`;
  }
  return ping.detail || `Scanner unreachable (${ping.ip})`;
}

export async function pingDevice(): Promise<DevicePing> {
  return mriFetch("/device/ping", { method: "POST" });
}

export async function deleteScan(id: string): Promise<void> {
  try {
    await mriFetch(`/scans/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    await mriFetch(`/scans/${encodeURIComponent(id)}/delete`, { method: "POST" });
  }
}

export async function duplicateScan(id: string): Promise<ScanQueueEntry> {
  return mriFetch(`/scans/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
}

export async function fetchAbout(): Promise<{
  title: string;
  subtitle: string;
  version: string;
  url: string;
  base: string;
  system: { name: string; model: string; serial_number: string; software_version: string };
}> {
  return mriFetch("/about");
}

export async function fetchLog(name: "acq" | "recon" | "ui" | "api"): Promise<{ name: string; lines: string[] }> {
  return mriFetch(`/logs/${name}`);
}

export async function fetchStudies(): Promise<StudyExam[]> {
  return mriFetch("/studies");
}

export async function cloneStudyScan(path: string): Promise<ScanQueueEntry> {
  return mriFetch("/studies/clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function sendDicoms(target: string, folders: string[]): Promise<void> {
  await mriFetch("/dicom/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target, folders }),
  });
}

export function scannerAssetUrl(): string {
  return `${mriBaseUrl()}/assets/scanner.png`;
}

export type PlotSeries = {
  name: string;
  x: Array<number | null>;
  y: Array<number | null>;
};

export type PlotAxes = {
  title: string;
  xlabel: string;
  ylabel: string;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  series: PlotSeries[];
};

export type StudyPreview = {
  kind: "dicom" | "plot" | "empty";
  slices: number;
  index: number;
  vmin: number;
  vmax: number;
  histogram: number[];
  image: string;
  series?: { axes: PlotAxes[] } | null;
  error?: string;
};

export async function fetchStudyPreview(
  folder: string,
  filePath: string,
  resultType: string,
  index = 0,
  size?: { width?: number; height?: number; scale?: number },
): Promise<StudyPreview> {
  const query = new URLSearchParams({
    folder,
    file_path: filePath,
    result_type: resultType,
    index: String(index),
  });
  if (size?.width && size.width > 0) query.set("width", String(Math.round(size.width)));
  if (size?.height && size.height > 0) query.set("height", String(Math.round(size.height)));
  if (size?.scale && size.scale > 1) query.set("scale", String(size.scale));
  return mriFetch(`/studies/preview?${query}`);
}

export function studyExportUrl(folder: string, filePath: string): string {
  const query = new URLSearchParams({ folder, file_path: filePath });
  return `${mriBaseUrl()}/studies/export?${query}`;
}

export async function fetchConfig(): Promise<MriConfig> {
  return mriFetch("/config");
}

export async function saveConfig(body: Partial<MriConfig>): Promise<MriConfig> {
  return mriFetch("/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type AcqConfig = {
  rf_parameters: {
    larmor_frequency_MHz: number;
    rf_maximum_amplitude_Hze: number;
    rf_pi2_fraction: number;
  };
  gradients_parameters: {
    gx_maximum: number;
    gy_maximum: number;
    gz_maximum: number;
  };
  shim_parameters: {
    shim_x: number;
    shim_y: number;
    shim_z: number;
    shim_mc: number[];
  };
  marcos_parameters: {
    port: number;
    fpga_clock_frequency_MHz: number;
    gradient_board_type: string;
    gpa_fhdo_current_per_volt: number;
    flocra_pulseq_path: string;
    initialize_gpa?: boolean;
  };
};

export async function fetchAcqConfig(): Promise<AcqConfig> {
  return mriFetch("/config/acq");
}

export async function saveAcqConfig(body: Partial<AcqConfig>): Promise<AcqConfig> {
  return mriFetch("/config/acq", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type ServiceStatus = {
  acq: boolean | null;
  recon: boolean | null;
  mode: string;
  last_error?: string;
  sequence_registry?: boolean;
};

export async function fetchServices(): Promise<ServiceStatus> {
  return mriFetch("/device/services");
}

export async function controlOneService(
  service: "acq" | "recon",
  action: "start" | "stop" | "kill",
): Promise<{ acq: boolean | null; recon: boolean | null; mode: string }> {
  return mriFetch(`/device/services/${service}/${action}`, { method: "POST" });
}

export async function fetchDisk(): Promise<{ total: number; used: number; free: number; percent: number }> {
  return mriFetch("/device/disk");
}

export async function testDevice(): Promise<{ ok: boolean }> {
  return mriFetch("/device/test", { method: "POST" });
}

export async function resetDevice(): Promise<{ ok: boolean }> {
  return mriFetch("/device/reset", { method: "POST" });
}

export async function respondEvent(
  id: string,
  response: unknown,
  source: "acq" | "recon" = "acq",
  error = false,
): Promise<void> {
  await mriFetch(`/events/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response, source, error }),
  });
}

export type DicomTarget = {
  target_type?: string;
  name: string;
  ip: string;
  port: number;
  aet_target: string;
  aet_source?: string;
};

export type MriConfig = {
  scanner_ip: string;
  debug_mode: string;
  hardware_simulation: string;
  dicom_targets: DicomTarget[];
};

export type StudyExam = {
  id: string;
  acc: string;
  patientName: string;
  mrn: string;
  examTime: string;
  scans: {
    id: string;
    folder: string;
    path: string;
    protocol_name: string;
    scan_number: number;
    sequence: string;
    failed: boolean;
    results: { type: string; name: string; file_path: string }[];
    task?: Record<string, unknown>;
  }[];
};

export function connectMriEvents(onEvent: (event: MriEvent) => void): () => void {
  const base = mriBaseUrl();
  const url = base.startsWith("http")
    ? base.replace(/^http/, "ws") + "/events"
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${base}/events`;
  const ws = new WebSocket(withToken(url));
  ws.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(String(ev.data)) as MriEvent);
    } catch {
      /* ignore */
    }
  };
  return () => ws.close();
}

export function emptyPatient(): PatientInformation {
  return {
    first_name: "",
    last_name: "",
    mrn: "",
    birth_date: "20000101",
    gender: "O",
    weight_kg: 0,
    height_cm: 0,
    age: 0,
  };
}
