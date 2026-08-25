import { create } from "zustand";
import { fetchHealth, fetchSensorsBatch, fetchTwinState, assessFromTwin, runForecast } from "./dtamApi";
import { pushConsole } from "./consoleLog";
import type {
  AssessFromTwinResponse,
  AssessMode,
  ConnectionStatus,
  ForecastRequest,
  HealthResponse,
  MeasurementBatch,
  SystemState,
  TwinAssessment,
} from "./dtamTypes";
import { cadForScanner, readScannerModel } from "./scannerModel";
import type { TwinTelemetry } from "./types";

const CAD_VIEW_PREFS_KEY = "twin_magnet_cad_view_v2";
const CAD_VIEW_PREFS_LEGACY_KEY = "twin_magnet_cad_view_v1";
const POLL_MS = 1500;

type CadViewPrefs = {
  magnet_cad_scale?: number;
  magnet_cad_scale_by_model?: Record<string, number>;
  cad_offset_x?: number;
  cad_offset_y?: number;
  cad_offset_z?: number;
  show_symbolic_internals?: boolean;
  show_generic_housing?: boolean;
  wireframe?: boolean;
  hybrid_render?: boolean;
  show_temperature_map?: boolean;
};

function readCadViewPrefs(): CadViewPrefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const cur = localStorage.getItem(CAD_VIEW_PREFS_KEY);
    if (cur) return JSON.parse(cur) as CadViewPrefs;
    const legacy = localStorage.getItem(CAD_VIEW_PREFS_LEGACY_KEY);
    if (legacy) {
      const o = JSON.parse(legacy) as CadViewPrefs;
      const hasCad = Boolean(cadForScanner());
      const migrated: CadViewPrefs = {
        magnet_cad_scale: o.magnet_cad_scale,
        show_symbolic_internals: true,
        show_generic_housing: hasCad ? false : true,
        wireframe: false,
        hybrid_render: false,
        show_temperature_map: false,
        cad_offset_x: 0,
        cad_offset_y: 0,
        cad_offset_z: 0,
      };
      localStorage.setItem(CAD_VIEW_PREFS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCadViewPrefs(prefs: CadViewPrefs) {
  if (typeof localStorage === "undefined") return;
  try {
    const merged = { ...readCadViewPrefs(), ...prefs };
    localStorage.setItem(CAD_VIEW_PREFS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota / private mode */
  }
}

export function scaleForScannerModel(id = readScannerModel()): number {
  const saved = readCadViewPrefs();
  const byModel = saved.magnet_cad_scale_by_model?.[id];
  if (typeof byModel === "number" && byModel > 0) return byModel;
  const cad = cadForScanner(id);
  if (cad && typeof saved.magnet_cad_scale === "number" && saved.magnet_cad_scale > 0) {
    const looksLikeLegacyHalbach = saved.magnet_cad_scale < 0.05;
    if (cad.explodeParts ? !looksLikeLegacyHalbach : looksLikeLegacyHalbach) {
      return saved.magnet_cad_scale;
    }
  }
  const env = Number(import.meta.env.VITE_MAGNET_CAD_SCALE);
  if (cad && !cad.explodeParts && Number.isFinite(env) && env > 0) return env;
  return cad?.scale ?? 1;
}

function initialMagnetCadScale(): number {
  return scaleForScannerModel();
}

function initialCadOffsetX(): number {
  const saved = readCadViewPrefs().cad_offset_x;
  if (typeof saved === "number" && Number.isFinite(saved)) return saved;
  return 0;
}

function initialCadOffsetZ(): number {
  const saved = readCadViewPrefs().cad_offset_z;
  if (typeof saved === "number" && Number.isFinite(saved)) return saved;
  return 0;
}

function initialCadOffsetY(): number {
  const saved = readCadViewPrefs().cad_offset_y;
  if (typeof saved === "number" && Number.isFinite(saved)) return saved;
  return 0;
}

function initialShowSymbolicInternals(): boolean {
  const saved = readCadViewPrefs().show_symbolic_internals;
  if (typeof saved === "boolean") return saved;
  return true;
}

function initialShowGenericHousing(): boolean {
  const saved = readCadViewPrefs().show_generic_housing;
  if (typeof saved === "boolean") return saved;
  return !cadForScanner();
}

function initialWireframe(): boolean {
  const saved = readCadViewPrefs().wireframe;
  if (typeof saved === "boolean") return saved;
  return false;
}

function initialShowTemperatureMap(): boolean {
  const saved = readCadViewPrefs().show_temperature_map;
  if (typeof saved === "boolean") return saved;
  return false;
}

function initialHybridRender(): boolean {
  const saved = readCadViewPrefs().hybrid_render;
  if (typeof saved === "boolean") return saved;
  return false;
}

export type TwinViewControls = {
  exploded: number;
  xray: number;
  show_field_hint: boolean;
  highlight_gradients: boolean;
  magnet_cad_scale: number;
  cad_offset_x: number;
  cad_offset_y: number;
  cad_offset_z: number;
  show_symbolic_internals: boolean;
  show_generic_housing: boolean;
  wireframe: boolean;
  hybrid_render: boolean;
  show_temperature_map: boolean;
};

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
};

/** Map SystemState into the compact fields the 3D scene still consumes. */
export function systemStateToTelemetry(state: SystemState): TwinTelemetry {
  const b0T = state.magnetic?.b0_t?.value ?? state.magnetic?.nominal_b0_t ?? 0.048;
  const nominalT = state.magnetic?.nominal_b0_t ?? 0.048;
  const magnetTemp = state.thermal?.mean_magnet_temperature_c?.value ?? 23;
  const roomTemp = state.thermal?.room_temperature_c?.value ?? magnetTemp;
  const noise = state.rf?.noise_floor_dbm_per_hz?.value ?? -100;
  const emiRms = state.emi?.rms_v?.value ?? 0.01;
  // Relative EMI drive for spectrum viz (~0.01 V → ~40 on legacy scale).
  const emiRel = 20 * Math.log10(Math.max(emiRms, 1e-6) / 1e-6) / 1000;

  return {
    b0_mT: b0T * 1000,
    b0_setpoint_mT: nominalT * 1000,
    homogeneity_ppm: 0,
    magnet_temp_C: magnetTemp,
    electronics_temp_C: roomTemp,
    avg_power_W: 0,
    sequence_active: false,
    door_interlock_ok: true,
    gradient_rms_mTm: 0,
    emi_dBuV: emiRel,
    noise_floor_dB: noise,
    device_time_ms: Date.parse(state.timestamp) || Date.now(),
  };
}

type TwinStore = {
  telemetry: TwinTelemetry;
  systemState: SystemState | null;
  health: HealthResponse | null;
  connection: ConnectionStatus;
  lastError: string | null;
  forecastBusy: boolean;
  assessBusy: boolean;
  lastAssessment: TwinAssessment | null;
  sensorsBatch: MeasurementBatch | null;
  view: TwinViewControls;
  cameraPose: CameraPose;
  setTelemetry: (patch: Partial<TwinTelemetry>) => void;
  applySystemState: (state: SystemState) => void;
  setHealth: (health: HealthResponse | null) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setLastError: (err: string | null) => void;
  setForecastBusy: (busy: boolean) => void;
  setAssessBusy: (busy: boolean) => void;
  setLastAssessment: (a: TwinAssessment | null) => void;
  setSensorsBatch: (batch: MeasurementBatch | null) => void;
  setView: (patch: Partial<TwinViewControls>) => void;
  setCameraPose: (pose: CameraPose) => void;
};

const defaultTelemetry = (): TwinTelemetry => ({
  b0_mT: 48,
  b0_setpoint_mT: 48,
  homogeneity_ppm: 0,
  magnet_temp_C: 23,
  electronics_temp_C: 22,
  avg_power_W: 0,
  sequence_active: false,
  door_interlock_ok: true,
  gradient_rms_mTm: 0,
  emi_dBuV: 40,
  noise_floor_dB: -100,
  device_time_ms: Date.now(),
});

export const useTwinStore = create<TwinStore>((set) => ({
  telemetry: defaultTelemetry(),
  systemState: null,
  health: null,
  connection: "connecting",
  lastError: null,
  forecastBusy: false,
  assessBusy: false,
  lastAssessment: null,
  sensorsBatch: null,
  view: {
    exploded: 0,
    xray: 0.15,
    show_field_hint: true,
    highlight_gradients: false,
    magnet_cad_scale: initialMagnetCadScale(),
    cad_offset_x: initialCadOffsetX(),
    cad_offset_y: initialCadOffsetY(),
    cad_offset_z: initialCadOffsetZ(),
    show_symbolic_internals: initialShowSymbolicInternals(),
    show_generic_housing: initialShowGenericHousing(),
    wireframe: initialWireframe(),
    hybrid_render: initialHybridRender(),
    show_temperature_map: initialShowTemperatureMap(),
  },
  cameraPose: {
    position: [2.8, 1.6, 2.4],
    target: [0, 0, 0],
    distance: Math.sqrt(2.8 * 2.8 + 1.6 * 1.6 + 2.4 * 2.4),
  },
  setTelemetry: (patch) =>
    set((s) => ({ telemetry: { ...s.telemetry, ...patch } })),
  applySystemState: (state) =>
    set({
      systemState: state,
      telemetry: systemStateToTelemetry(state),
      lastError: null,
      connection: "connected",
    }),
  setHealth: (health) => set({ health }),
  setConnection: (connection) => set({ connection }),
  setLastError: (lastError) => set({ lastError }),
  setForecastBusy: (forecastBusy) => set({ forecastBusy }),
  setAssessBusy: (assessBusy) => set({ assessBusy }),
  setLastAssessment: (lastAssessment) => set({ lastAssessment }),
  setSensorsBatch: (sensorsBatch) => set({ sensorsBatch }),
  setView: (patch) =>
    set((s) => {
      const view = { ...s.view, ...patch };
      if (
        "magnet_cad_scale" in patch ||
        "cad_offset_x" in patch ||
        "cad_offset_y" in patch ||
        "cad_offset_z" in patch ||
        "show_symbolic_internals" in patch ||
        "show_generic_housing" in patch ||
        "wireframe" in patch ||
        "hybrid_render" in patch ||
        "show_temperature_map" in patch
      ) {
        const prev = readCadViewPrefs();
        writeCadViewPrefs({
          magnet_cad_scale: view.magnet_cad_scale,
          magnet_cad_scale_by_model: {
            ...prev.magnet_cad_scale_by_model,
            [readScannerModel()]: view.magnet_cad_scale,
          },
          cad_offset_x: view.cad_offset_x,
          cad_offset_y: view.cad_offset_y,
          cad_offset_z: view.cad_offset_z,
          show_symbolic_internals: view.show_symbolic_internals,
          show_generic_housing: view.show_generic_housing,
          wireframe: view.wireframe,
          hybrid_render: view.hybrid_render,
          show_temperature_map: view.show_temperature_map,
        });
      }
      return { ...s, view };
    }),
  setCameraPose: (cameraPose) => set((s) => ({ ...s, cameraPose })),
}));

/**
 * Poll DTAM Twin API for live SystemState + periodic health checks.
 * Replaces the synthetic demo driver.
 */
export function attachDtamTelemetryDriver(pollMs = POLL_MS) {
  let stopped = false;
  let inFlight = false;
  let tickCount = 0;
  let wasConnected: boolean | null = null;
  let lastEmiLabel: string | null = null;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const store = useTwinStore.getState();
    try {
      const [health, state] = await Promise.all([fetchHealth(), fetchTwinState()]);
      if (stopped) return;
      store.setHealth(health);
      store.applySystemState(state);

      const nowConnected = health.connected;
      if (wasConnected !== true && nowConnected) {
        pushConsole("INFO", `Connection established to ${health.scanner_id}`);
        pushConsole("SUCCESS", `Streaming ${state.twin_version}`);
      } else if (wasConnected === true && !nowConnected) {
        pushConsole("WARN", "API reports scanner not connected");
      }
      wasConnected = nowConnected;

      if (!health.connected) {
        store.setConnection("disconnected");
        store.setLastError("API reports scanner not connected");
      }

      tickCount += 1;
      // Periodic sensor snapshot (avoid flooding every poll).
      if (tickCount === 1 || tickCount % 5 === 0) {
        const channels = state.thermal?.channels ?? [];
        for (const ch of channels) {
          pushConsole(
            "INFO",
            `${ch.channel_id ?? "temp"}=${ch.value.toFixed(3)} ${ch.unit} (${ch.source})`,
          );
        }
        const emi = state.emi;
        if (emi?.rms_v) {
          pushConsole(
            "INFO",
            `emi_probe_01 rms=${emi.rms_v.value.toExponential(3)} V class=${emi.classification_label ?? "—"}`,
          );
        }
        const rf = state.rf?.noise_floor_dbm_per_hz;
        if (rf) {
          pushConsole(
            "INFO",
            `rf_noise_01 floor=${rf.value.toFixed(2)} ${rf.unit} (${rf.source})`,
          );
        }
        if (state.thermal?.mean_magnet_temperature_c && state.magnetic?.b0_t) {
          pushConsole(
            "SUCCESS",
            `Twin update mean_T=${state.thermal.mean_magnet_temperature_c.value.toFixed(3)}°C B0=${state.magnetic.b0_t.value.toExponential(4)} T`,
          );
        }
      }

      const emiLabel = state.emi?.classification_label ?? null;
      const emiRms = state.emi?.rms_v?.value ?? 0;
      if (emiLabel && emiLabel !== lastEmiLabel && lastEmiLabel != null) {
        pushConsole("WARN", `EMI classification changed ${lastEmiLabel} → ${emiLabel}`);
      }
      if (emiRms > 0.015 && (tickCount === 1 || tickCount % 5 === 0)) {
        pushConsole(
          "WARN",
          `Minor EMI fluctuation detected in ${emiLabel ?? "unknown"} range (rms=${emiRms.toExponential(3)} V)`,
        );
      }
      lastEmiLabel = emiLabel;
    } catch (err) {
      if (stopped) return;
      store.setConnection("disconnected");
      const msg = err instanceof Error ? err.message : String(err);
      store.setLastError(msg);
      if (wasConnected !== false) {
        pushConsole("ERROR", `Twin API unreachable on :8080 — ${msg}`);
      }
      wasConnected = false;
    } finally {
      inFlight = false;
    }
  };

  pushConsole("INFO", "Polling Twin API (/health + /twin/state)");
  void tick();
  const id = window.setInterval(() => void tick(), pollMs);
  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}

export async function requestForecast(body: ForecastRequest): Promise<SystemState> {
  const store = useTwinStore.getState();
  store.setForecastBusy(true);
  pushConsole(
    "INFO",
    `Forecast requested horizon=${body.predict_horizon_s}s setpoint=${body.magnet_setpoint_c ?? "null"}`,
  );
  try {
    const state = await runForecast(body);
    store.applySystemState(state);
    const predT = state.thermal?.predicted_mean_magnet_temperature_c?.value;
    const predB0 = state.magnetic?.predicted_b0_t?.value;
    pushConsole(
      "SUCCESS",
      `Forecast complete pred_T=${predT?.toFixed(3) ?? "—"}°C pred_B0=${predB0?.toExponential(4) ?? "—"} T`,
    );
    for (const note of state.notes ?? []) {
      pushConsole("INFO", note);
    }
    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.setLastError(msg);
    pushConsole("ERROR", `Forecast failed (Twin API :8080): ${msg}`);
    throw err;
  } finally {
    store.setForecastBusy(false);
  }
}

export async function requestAssess(
  mode: AssessMode = "observe",
): Promise<AssessFromTwinResponse> {
  const store = useTwinStore.getState();
  store.setAssessBusy(true);
  pushConsole("INFO", `Assess live twin mode=${mode}`);
  try {
    const result = await assessFromTwin({ mode });
    if (result.twin) store.applySystemState(result.twin);
    store.setLastAssessment(result.assessment ?? null);
    const a = result.assessment;
    const findings = a?.findings?.length ?? 0;
    const status = a?.overall_status ?? "unknown";
    const conf =
      a?.overall_confidence != null ? ` conf=${(a.overall_confidence * 100).toFixed(0)}%` : "";
    pushConsole(
      "SUCCESS",
      `Assess ${status}${conf} · ${findings} finding(s) · agents=${(a?.activated_agents ?? []).join(",") || "—"}`,
    );
    if (a?.explanation) {
      pushConsole("INFO", a.explanation);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.setLastError(msg);
    pushConsole("ERROR", `Assess failed (Twin API :8080): ${msg}`);
    throw err;
  } finally {
    store.setAssessBusy(false);
  }
}

export async function refreshSensorsBatch(): Promise<MeasurementBatch | null> {
  try {
    const batch = await fetchSensorsBatch();
    useTwinStore.getState().setSensorsBatch(batch);
    return batch;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useTwinStore.getState().setLastError(msg);
    pushConsole("ERROR", `sensors/batch failed (Twin API :8080): ${msg}`);
    return null;
  }
}

/** @deprecated Use attachDtamTelemetryDriver — kept for local offline demos. */
export function attachDemoTelemetryDriver() {
  const id = window.setInterval(() => {
    const t = performance.now() / 1000;
    const sequence = Math.sin(t * 0.7) > 0.65;
    useTwinStore.getState().setTelemetry({
      b0_mT: 48 + 0.35 * Math.sin(t * 0.3),
      homogeneity_ppm: 115 + Math.abs(8 * Math.sin(t * 0.5)),
      magnet_temp_C: 23 + 0.4 * Math.sin(t * 0.2),
      electronics_temp_C: 22 + 1.2 * Math.sin(t * 0.45),
      avg_power_W: 160 + (sequence ? 95 : 0) + 10 * Math.sin(t),
      sequence_active: sequence,
      door_interlock_ok: Math.sin(t * 0.15) > -0.92,
      gradient_rms_mTm: sequence ? 12 + 6 * Math.sin(t * 3) : 0.2,
      emi_dBuV: 35 + 7 * Math.abs(Math.sin(t * 0.9)) + (sequence ? 2.5 : 0),
      noise_floor_dB: -95 + 2.2 * Math.sin(t * 0.6) + (sequence ? 1.2 : 0),
      device_time_ms: Date.now(),
    });
  }, 200);
  return () => window.clearInterval(id);
}
