/** Live fields you can map from SCADA / MQTT / WebSocket into the twin UI */
export type TwinTelemetry = {
  /** Main field, mT */
  b0_mT: number;
  b0_setpoint_mT: number;
  /** Homogeneity over ROI */
  homogeneity_ppm: number;
  magnet_temp_C: number;
  electronics_temp_C: number;
  avg_power_W: number;
  /** True while RF pulses / readout active (simplified) */
  sequence_active: boolean;
  door_interlock_ok: boolean;
  /** RMS gradient activity for visualization scaling */
  gradient_rms_mTm: number;
  /** Electromagnetic interference level (relative), dBuV */
  emi_dBuV: number;
  /** Effective system noise floor (relative), dB */
  noise_floor_dB: number;
  /** Timestamp from device clock (ms) */
  device_time_ms: number;
};
