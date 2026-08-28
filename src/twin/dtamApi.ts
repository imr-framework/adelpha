import { apiRoot, runtimeFetch } from "../desktop/runtime";
import type {
  AssessFromTwinRequest,
  AssessFromTwinResponse,
  ForecastRequest,
  HealthResponse,
  MeasurementBatch,
  SystemState,
} from "./dtamTypes";

/** Prefer same-origin proxy (`/api/dtam`); Tauri prefixes the supervisor base URL. */
export function dtamBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_DTAM_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return `${apiRoot()}/api/dtam`;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    if (typeof json.detail === "string") return json.detail;
    if (json.detail != null) return JSON.stringify(json.detail);
  } catch {
    /* plain text */
  }
  return text || `${res.status} ${res.statusText}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await runtimeFetch(`${dtamBaseUrl()}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<HealthResponse>;
}

export async function fetchTwinState(
  query?: Partial<{
    predict_horizon_s: number;
    magnet_heating_rate_c_per_s: number;
    magnet_setpoint_c: number;
    alpha_t_tesla_per_c: number;
    use_thermal_pinn: boolean;
  }>,
): Promise<SystemState> {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  const res = await runtimeFetch(`${dtamBaseUrl()}/twin/state${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<SystemState>;
}

export async function runForecast(body: ForecastRequest): Promise<SystemState> {
  const res = await runtimeFetch(`${dtamBaseUrl()}/twin/forecast`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<SystemState>;
}

export async function assessFromTwin(
  body: AssessFromTwinRequest = { mode: "observe" },
): Promise<AssessFromTwinResponse> {
  const res = await runtimeFetch(`${dtamBaseUrl()}/assess/from-twin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<AssessFromTwinResponse>;
}

export async function fetchSensorsBatch(): Promise<MeasurementBatch> {
  const res = await runtimeFetch(`${dtamBaseUrl()}/sensors/batch`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<MeasurementBatch>;
}
