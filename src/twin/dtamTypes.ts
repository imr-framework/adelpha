/** DTAM Twin HTTP API types (mirror of SystemState / QuantitySource). */

export type QuantitySource = "measured" | "estimated" | "predicted" | "nominal";

export interface TimestampedQuantity {
  value: number;
  unit: string;
  source: QuantitySource;
  timestamp: string;
  confidence: number | null;
  uncertainty_std: number | null;
  model_version: string | null;
  channel_id: string | null;
}

export interface ThermalState {
  timestamp: string;
  scanner_id: string;
  channels: TimestampedQuantity[];
  mean_magnet_temperature_c: TimestampedQuantity | null;
  room_temperature_c: TimestampedQuantity | null;
  thermal_gradient_c: TimestampedQuantity | null;
  reference_magnet_temperature_c: number | null;
  delta_magnet_temperature_c: TimestampedQuantity | null;
  predicted_mean_magnet_temperature_c: TimestampedQuantity | null;
  model_version: string;
  measurement_window_start: string | null;
  measurement_window_end: string | null;
  correlation_id: string | null;
}

export interface MagneticState {
  timestamp: string;
  scanner_id: string;
  nominal_b0_t: number;
  b0_t: TimestampedQuantity | null;
  delta_b0_t: TimestampedQuantity | null;
  resonant_frequency_mhz: TimestampedQuantity | null;
  predicted_b0_t: TimestampedQuantity | null;
  predicted_delta_b0_t: TimestampedQuantity | null;
  predicted_frequency_mhz: TimestampedQuantity | null;
  model_version: string;
  correlation_id: string | null;
}

export interface EmiState {
  timestamp: string;
  scanner_id: string;
  channels: TimestampedQuantity[];
  rms_v: TimestampedQuantity | null;
  peak_frequency_hz: TimestampedQuantity | null;
  classification_label: string | null;
  model_version: string;
  measurement_window_start: string | null;
  measurement_window_end: string | null;
  correlation_id: string | null;
}

export interface RfState {
  timestamp: string;
  scanner_id: string;
  channels: TimestampedQuantity[];
  noise_floor_dbm_per_hz: TimestampedQuantity | null;
  snr_estimate_db: TimestampedQuantity | null;
  noise_bandwidth_hz: number | null;
  model_version: string;
  measurement_window_start: string | null;
  measurement_window_end: string | null;
  correlation_id: string | null;
}

export interface SystemState {
  timestamp: string;
  scanner_id: string;
  mode: string;
  thermal: ThermalState | null;
  magnetic: MagneticState | null;
  emi: EmiState | null;
  rf: RfState | null;
  correlation_id: string | null;
  twin_version: string;
  notes: string[];
}

export interface HealthResponse {
  status: string;
  scanner_id: string;
  mode: string;
  connected: boolean;
}

export interface ForecastRequest {
  predict_horizon_s: number;
  magnet_heating_rate_c_per_s?: number;
  magnet_setpoint_c?: number | null;
  alpha_t_tesla_per_c?: number;
  use_thermal_pinn?: boolean;
}

export interface SensorProvenance {
  source: string;
  method: string;
  version: string;
  notes: string | null;
}

export interface SensorMeasurement {
  measurement_id: string;
  sensor_id: string;
  scanner_id: string;
  timestamp: string;
  quantity: string;
  value: number;
  unit: string;
  calibration_version: string;
  uncertainty: number | null;
  acquisition_quality: number | null;
  validity: string;
  provenance: SensorProvenance;
  metadata: Record<string, unknown> | null;
}

export interface MeasurementBatch {
  measurements: SensorMeasurement[];
  batch_id?: string;
  scanner_id?: string;
  timestamp?: string;
}

export type AssessMode = "observe" | "recommend";

export interface AssessFromTwinRequest {
  mode?: AssessMode;
}

/** Subset of Twin assessment payload used by the GUI (see :8080/docs). */
export interface AssessmentFinding {
  code?: string;
  summary?: string;
  severity?: string;
  confidence?: number | null;
  domain?: string | null;
  evidence_ids?: string[];
}

export interface TwinAssessment {
  timestamp?: string;
  operating_mode?: string;
  overall_status?: string;
  overall_confidence?: number | null;
  explanation?: string | null;
  activated_agents?: string[];
  skipped_agents?: string[];
  findings?: AssessmentFinding[];
  approved_recommendations?: unknown[];
  rejected_recommendations?: unknown[];
  safety_decisions?: unknown[];
  human_review_items?: unknown[];
  correlation_id?: string | null;
  [key: string]: unknown;
}

export interface AssessFromTwinResponse {
  ok: boolean;
  twin: SystemState;
  assessment: TwinAssessment;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
