/** MRI4ALL console API types (Pydantic ScanTask / IPC). */

export type ScanState =
  | "created"
  | "scheduled_acq"
  | "acq"
  | "scheduled_recon"
  | "recon"
  | "complete"
  | "failure"
  | "invalid";

export type SeqTab = "sequence" | "adjustments" | "system" | "processing" | "other";

export type PatientInformation = {
  first_name: string;
  last_name: string;
  mrn: string;
  birth_date: string;
  gender: string;
  weight_kg: number;
  height_cm: number;
  age: number;
};

export type ExamInformation = {
  id: string;
  registration_time: string;
  scan_counter: number;
  dicom_study_uid: string;
  patient_position: string;
  acc: string;
};

export type SystemInformation = {
  name: string;
  model: string;
  serial_number: string;
  software_version: string;
};

export type ScanQueueEntry = {
  id: string;
  sequence: string;
  protocol_name: string;
  scan_counter: number;
  state: ScanState;
  has_results: boolean;
  folder_name: string;
  description: string;
};

export type ScanTask = {
  id: string;
  sequence: string;
  protocol_name: string;
  scan_number: number;
  system: SystemInformation;
  patient: PatientInformation;
  exam: ExamInformation;
  parameters: Record<string, unknown>;
  adjustment?: {
    shim: { shim_x: number; shim_y: number; shim_z: number };
    rf: { larmor_frequency: number; rf_max_amplitude: number; rf_pi2_fraction: number };
    gradients: { gx_max: number; gy_max: number; gz_max: number };
  };
  processing?: {
    trajectory: string;
    recon_mode: string;
    denoising_strength: number;
  };
  other: Record<string, unknown>;
  results: {
    type: string;
    name: string;
    file_path: string;
    primary?: boolean;
    autoload_viewer?: number;
  }[];
  journal: {
    created_at: string;
    prepared_at: string;
    acquisition_start: string;
    acquisition_end: string;
    reconstruction_start: string;
    reconstruction_end: string;
    failed_at: string;
    fail_stage: string;
  };
};

export type ParameterProperty = {
  title?: string;
  type?: string;
  default?: unknown;
  enum?: string[];
  unit?: string;
  minimum?: number;
  maximum?: number;
  step?: number;
  description?: string;
  tab?: SeqTab;
};

export type ParameterSchema = {
  type: string;
  properties: Record<string, ParameterProperty>;
};

export type SequenceInfo = {
  id: string;
  name: string;
  description: string;
  adjustment: boolean;
  defaults: Record<string, unknown>;
  parameter_schema: ParameterSchema;
};

export type ExamResponse = {
  exam: ExamInformation;
  patient: PatientInformation;
  system: SystemInformation;
};

export type ScanDetail = {
  entry: ScanQueueEntry;
  task: ScanTask | null;
  folder: string;
  editing: boolean;
  prepared: boolean;
};

export type HealthResponse = {
  status: string;
  service: string;
  exam_active: boolean;
  sequences: number;
  hardware_simulation: boolean;
  sequence_registry?: boolean;
  pipeline?: boolean;
};

export type ValidateResponse = {
  ok: boolean;
  problems: string[];
};

export type MriEvent = {
  source?: string;
  id?: string;
  value?: {
    type?: string;
    message?: string;
    alert_type?: "information" | "warning" | "critical";
    input_type?: "text" | "int" | "float";
    in_min?: number;
    in_max?: number;
    request?: string;
    plot?: unknown;
    dicom_files?: string[];
    data?: unknown;
    start_time?: string;
    expected_duration_sec?: number;
    disable_statustimer?: boolean;
  };
};
