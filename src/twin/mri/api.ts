import { saveBlob } from "../../desktop/saveFile";
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

export type Mr0Image = {
  width: number;
  height: number;
  values: number[];
};

export type Mr0Simulation = {
  ok: true;
  suite: string;
  title: string;
  summary: string;
  phantom: string;
  spins: number;
  profiles: number;
  samples_per_profile: number;
  scanner_b0_t: number;
  gmax_mt_m: number;
  inhomogeneity_ppm: number;
  sequence: string;
  sequence_id: string;
  tr_ms: number;
  te_ms: number;
  flip_deg: number;
  averages: number;
  voxel_mm: number;
  fov_mm: number;
  matrix: number;
  bandwidth_hz: number;
  scan_time_s: number;
  snr: number;
  elapsed_s: number;
  echo: number[];
  image: Mr0Image | null;
  noisy_image: Mr0Image | null;
  inhomogeneous_image: Mr0Image | null;
  reconstruction_error: string;
};

export type Mr0Request = {
  sequence: "se_2D" | "tse_3D";
  b0_t: number;
  inhomogeneity_ppm: number;
  gmax_mt_m: number;
  tr_ms: number;
  te_ms: number;
  flip_deg: number;
  averages: number;
  voxel_mm: number;
  bandwidth_hz: number;
  etl: number;
};

export type CoilWire = {
  group: number;
  closed: boolean;
  points: number[][];
};

export type CoilLayout = {
  vertices: number[][];
  faces: number[][];
  colors: number[][];
  wires: CoilWire[];
  wire_radius: number;
  stream_min: number;
  stream_max: number;
};

export type CoilShape = "cylinder" | "planar" | "biplanar" | "circular";

export type CoilSimulation = {
  ok: true;
  shape: CoilShape;
  axis: "x" | "y" | "z";
  title: string;
  summary: string;
  radius_mm: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  gap_mm: number;
  levels: number;
  gradient_mt_m: number;
  achieved_mt_m: number | null;
  mean_field_error: number | null;
  layout: CoilLayout;
  layout_png: string;
  surface_png: string;
  loop_count: number;
  elapsed_s: number;
};

export type CoilRequest = {
  shape: CoilShape;
  axis: "x" | "y" | "z";
  radius_mm: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  gap_mm: number;
  levels: number;
  gradient_mt_m: number;
};

export type ShimMagnetPlacement = {
  position: number[];
  polarity: -1 | 1;
};

/** A measured field map as the upstream solver reads it: x, y, z in mm and B in mT. */
export type ShimFieldMapUpload = {
  name: string;
  data_b64: string;
};

export type ShimFieldSummary = {
  /** "synthetic" or the attached file name. */
  source: string;
  samples: number;
  mean_mt: number;
  p2p_mt: number;
  p2p_khz: number;
  std_ppm: number;
  extent_mm: { x: number[]; y: number[]; z: number[] };
  /** Sample positions in metres, thinned to a few thousand points. */
  points: number[][];
  before_mt: number[];
  after_mt?: number[];
};

export type ShimFieldInspection = {
  ok: true;
  title: string;
  field: ShimFieldSummary;
};

export type ShimSimulation = {
  ok: true;
  title: string;
  summary: string;
  field: ShimFieldSummary;
  diameter_mm: number;
  bottom_mm: number;
  top_mm: number;
  magnet_mm: number;
  thickness_mm: number;
  polarization_t: number;
  radial_spacing: number;
  azimuthal_spacing: number;
  pre_std_ppm: number;
  post_std_ppm: number;
  pre_p2p_mt: number;
  post_p2p_mt: number;
  n_positive: number;
  n_negative: number;
  magnet_size_mm: number[];
  states: number[];
  magnets: ShimMagnetPlacement[];
  elapsed_s: number;
};

export type ShimExportFile = {
  name: string;
  data_b64?: string;
};

export type ShimExport = {
  ok: true;
  title: string;
  folder: string | null;
  files: ShimExportFile[];
};

export type ShimRequest = {
  diameter_mm: number;
  bottom_mm: number;
  top_mm: number;
  magnet_mm: number;
  thickness_mm: number;
  polarization_t: number;
  radial_spacing: number;
  azimuthal_spacing: number;
  /** Shift the map so its bounding box is centred between the trays. */
  center_map: boolean;
  field_map?: ShimFieldMapUpload;
};

export async function simulateShim(request: ShimRequest): Promise<ShimSimulation> {
  return mriFetch("/shim/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function inspectShimFieldMap(field_map: ShimFieldMapUpload, center_map: boolean): Promise<ShimFieldInspection> {
  return mriFetch("/shim/fieldmap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ field_map, center_map }),
  });
}

export async function exportShimTrays(
  request: ShimRequest & { states: number[]; destination?: string },
): Promise<ShimExport> {
  return mriFetch("/shim/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function simulateCoil(request: CoilRequest): Promise<CoilSimulation> {
  return mriFetch("/coil/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function simulateMr0(request: Mr0Request): Promise<Mr0Simulation> {
  return mriFetch("/mr0/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suite: "low-field", ...request }),
  });
}

export async function uploadSeqFile(file: File): Promise<{ name: string }> {
  const name = file.name || "sequence.seq";
  return mriFetch(`/sequences/seq-files?filename=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-filename": name },
    body: file,
  });
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
  if (ping.simulation && ping.method === "tcp") {
    return ping.detail ? `Simulation · ${ping.detail}` : `Simulation · MaRCoS at ${ping.ip}`;
  }
  if (ping.simulation) {
    return `Simulation · no MaRCoS at ${ping.ip}`;
  }
  if (ping.method === "tcp") {
    return ping.detail || `MaRCoS server running at ${ping.ip}`;
  }
  if (ping.method === "icmp" && reachable) {
    return ping.detail || `Red Pitaya at ${ping.ip} answers ping; MaRCoS is not running`;
  }
  if (reachable) {
    return ping.detail || `Scanner reachable at ${ping.ip}`;
  }
  return ping.detail || `Scanner unreachable (${ping.ip})`;
}

export async function pingDevice(): Promise<DevicePing> {
  return mriFetch("/device/ping", { method: "POST" });
}

export type MarcosStartResult = {
  ok: boolean;
  started?: boolean;
  compiled?: boolean;
  bitstream?: boolean;
  detail?: string;
  ip?: string;
};

export async function startMarcosServer(): Promise<MarcosStartResult> {
  return mriFetch("/device/marcos/start", { method: "POST" });
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

export type ScanPsdResponse = {
  folder: string;
  file_path: string;
  result_type: string;
  result_name: string;
};

export async function createScanPsd(
  id: string,
  parameters?: Record<string, unknown>,
): Promise<ScanPsdResponse> {
  return mriFetch(`/scans/${encodeURIComponent(id)}/psd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parameters ? { parameters } : {}),
  });
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

export async function clearLog(name: "acq" | "recon" | "ui" | "api"): Promise<void> {
  await mriFetch(`/logs/${name}`, { method: "DELETE" });
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
  data_min?: number;
  data_max?: number;
  rows?: number;
  cols?: number;
  pixels?: string;
  histogram: number[];
  image: string;
  stack?: { index: number; rows: number; cols: number; pixels: string }[];
  series?: { axes: PlotAxes[] } | null;
  error?: string;
};

export async function fetchStudyPreview(
  folder: string,
  filePath: string,
  resultType: string,
  index = 0,
  size?: { width?: number; height?: number; scale?: number },
  allSlices = false,
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
  if (allSlices) query.set("all_slices", "true");
  return mriFetch(`/studies/preview?${query}`);
}

export function studyExportUrl(folder: string, filePath: string): string {
  const query = new URLSearchParams({ folder, file_path: filePath });
  return `${mriBaseUrl()}/studies/export?${query}`;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename\s*=\s*([^;]+)/i.exec(header);
  if (plain?.[1]) return plain[1].trim().replace(/^["']|["']$/g, "");
  return fallback;
}

function fallbackExportName(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return base || "export.zip";
}

/** Fetch the selected study result with session auth and save it locally. */
export async function downloadStudyExport(folder: string, filePath: string): Promise<string | null> {
  const res = await runtimeFetch(studyExportUrl(folder, filePath), { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get("content-disposition"), fallbackExportName(filePath));
  return saveBlob(name, blob);
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
