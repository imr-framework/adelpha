import { useCallback, useEffect, useRef, useState } from "react";
import { SatelliteDish, Play } from "lucide-react";

import {
  fetchAcqConfig,
  fetchConfig,
  pingDevice,
  saveAcqConfig,
  saveConfig,
  startMarcosServer,
  type AcqConfig,
  type MriConfig,
} from "../mri/api";
import { Select, SettingsRow, SettingsSection, Switch, TextInput } from "./controls";

function NumberField({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <TextInput
      type="number"
      step={step}
      label={label}
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(next) => {
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}

export function ScannerHardwareSection({ compact = false }: { compact?: boolean }) {
  const [operator, setOperator] = useState<MriConfig | null>(null);
  const [acq, setAcq] = useState<AcqConfig | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const operatorTimer = useRef<number | null>(null);
  const acqTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextOperator, nextAcq] = await Promise.all([fetchConfig(), fetchAcqConfig()]);
      setOperator(nextOperator);
      setAcq(nextAcq);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load scanner settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queueOperator = (next: MriConfig) => {
    setOperator(next);
    if (operatorTimer.current) window.clearTimeout(operatorTimer.current);
    operatorTimer.current = window.setTimeout(() => {
      setSaving(true);
      void saveConfig(next)
        .then((saved) => {
          setOperator(saved);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
        .finally(() => setSaving(false));
    }, 400);
  };

  const queueAcq = (next: AcqConfig) => {
    setAcq(next);
    if (acqTimer.current) window.clearTimeout(acqTimer.current);
    acqTimer.current = window.setTimeout(() => {
      setSaving(true);
      void saveAcqConfig(next)
        .then((saved) => {
          setAcq(saved);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
        .finally(() => setSaving(false));
    }, 400);
  };

  const runPing = async () => {
    try {
      const result = await pingDevice();
      if (!(result.reachable ?? result.ok)) {
        setError(result.detail || "Scanner unreachable");
      } else {
        setError("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ping failed");
    }
  };

  const runStart = async () => {
    setStarting(true);
    setError("");
    try {
      const result = await startMarcosServer();
      if (!result.ok) setError(result.detail || "MaRCoS start failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "MaRCoS start failed");
    } finally {
      setStarting(false);
    }
  };

  if (!operator || !acq) {
    return (
      <SettingsSection title="Scanner">
        <p className="settings-about">{error || "Loading scanner settings…"}</p>
      </SettingsSection>
    );
  }

  const simulation = operator.hardware_simulation === "True";

  return (
    <>
      <SettingsSection title="Scanner">
        {error ? <p className="settings-about">{error}</p> : null}
        {saving ? <p className="settings-about">Saving…</p> : null}
        <SettingsRow title="Scanner IP" layout="stack">
          <TextInput
            label="Scanner IP"
            value={operator.scanner_ip}
            placeholder="10.42.0.251"
            onChange={(scanner_ip) => queueOperator({ ...operator, scanner_ip })}
          />
        </SettingsRow>
        <SettingsRow title="Hardware simulation">
          <Switch
            label="Hardware simulation"
            checked={simulation}
            onChange={(on) => queueOperator({ ...operator, hardware_simulation: on ? "True" : "False" })}
          />
        </SettingsRow>
        <SettingsRow title="MaRCoS ping">
          <button type="button" className="settings-btn" onClick={() => void runPing()}>
            <SatelliteDish size={14} strokeWidth={1.8} aria-hidden />
            Ping
          </button>
        </SettingsRow>
        <SettingsRow title="Start MaRCoS">
          <button type="button" className="settings-btn settings-btn-accent" onClick={() => void runStart()} disabled={starting || simulation}>
            <Play size={14} strokeWidth={1.8} aria-hidden />
            {starting ? "Starting…" : "Start MaRCoS"}
          </button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="RF" description="Larmor is the magnet frequency. RF max is the Hz that maps to transmit DAC ±1 (MRI4ALL default 7661.29 Hz). Lowering RF max increases TX voltage for the same pulse.">
        <SettingsRow title="Larmor frequency" description="Center frequency in MHz. MRI4ALL Z1 default 15.58 MHz (~366 mT). Use your measured Larmor.">
          <NumberField
            label="Larmor frequency (MHz)"
            value={acq.rf_parameters.larmor_frequency_MHz}
            step="0.001"
            onChange={(larmor_frequency_MHz) =>
              queueAcq({ ...acq, rf_parameters: { ...acq.rf_parameters, larmor_frequency_MHz } })
            }
          />
        </SettingsRow>
        <SettingsRow title="RF max amplitude" description="Full-scale TX calibration in Hz, not a clip. MRI4ALL default 7661.29. Do not lower this to 'limit power'.">
          <NumberField
            label="RF max amplitude (Hz)"
            value={acq.rf_parameters.rf_maximum_amplitude_Hze}
            onChange={(rf_maximum_amplitude_Hze) =>
              queueAcq({ ...acq, rf_parameters: { ...acq.rf_parameters, rf_maximum_amplitude_Hze } })
            }
          />
        </SettingsRow>
        {!compact ? (
          <SettingsRow title="π/2 fraction" description="Fraction of RF max expected to produce a 90° pulse.">
            <NumberField
              label="RF pi/2 fraction"
              value={acq.rf_parameters.rf_pi2_fraction}
              step="0.0001"
              onChange={(rf_pi2_fraction) =>
                queueAcq({ ...acq, rf_parameters: { ...acq.rf_parameters, rf_pi2_fraction } })
              }
            />
          </SettingsRow>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Gradients" description="Hz/m produced at amplifier DAC ±1. MRI4ALL Z1 defaults: Gx 8e6, Gy 9e6, Gz 1e7. Lowering these increases coil current for the same sequence. Flocra refuses any pulse above these values.">
        <SettingsRow title="Gx full scale" description="X-axis DAC ±1 in Hz/m. MRI4ALL default 8000000.">
          <NumberField
            label="Gx full scale (Hz/m)"
            value={acq.gradients_parameters.gx_maximum}
            onChange={(gx_maximum) =>
              queueAcq({ ...acq, gradients_parameters: { ...acq.gradients_parameters, gx_maximum } })
            }
          />
        </SettingsRow>
        <SettingsRow title="Gy full scale" description="Y-axis DAC ±1 in Hz/m. MRI4ALL default 9000000.">
          <NumberField
            label="Gy full scale (Hz/m)"
            value={acq.gradients_parameters.gy_maximum}
            onChange={(gy_maximum) =>
              queueAcq({ ...acq, gradients_parameters: { ...acq.gradients_parameters, gy_maximum } })
            }
          />
        </SettingsRow>
        <SettingsRow title="Gz full scale" description="Z-axis DAC ±1 in Hz/m. MRI4ALL default 10000000.">
          <NumberField
            label="Gz full scale (Hz/m)"
            value={acq.gradients_parameters.gz_maximum}
            onChange={(gz_maximum) =>
              queueAcq({ ...acq, gradients_parameters: { ...acq.gradients_parameters, gz_maximum } })
            }
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Shim" description="Offsets added to normalized gradient channels. Must stay within ±1. MRI4ALL defaults are 0.">
        <SettingsRow title="Shim X">
          <NumberField
            label="Shim X"
            value={acq.shim_parameters.shim_x}
            step="0.0001"
            onChange={(shim_x) => queueAcq({ ...acq, shim_parameters: { ...acq.shim_parameters, shim_x } })}
          />
        </SettingsRow>
        <SettingsRow title="Shim Y">
          <NumberField
            label="Shim Y"
            value={acq.shim_parameters.shim_y}
            step="0.0001"
            onChange={(shim_y) => queueAcq({ ...acq, shim_parameters: { ...acq.shim_parameters, shim_y } })}
          />
        </SettingsRow>
        <SettingsRow title="Shim Z">
          <NumberField
            label="Shim Z"
            value={acq.shim_parameters.shim_z}
            step="0.0001"
            onChange={(shim_z) => queueAcq({ ...acq, shim_parameters: { ...acq.shim_parameters, shim_z } })}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="MaRCoS" description="Red Pitaya control port, FPGA clock, and gradient board.">
        <SettingsRow title="Port" description="MaRCoS server port. Default 11111.">
          <NumberField
            label="MaRCoS port"
            value={acq.marcos_parameters.port}
            step="1"
            onChange={(port) =>
              queueAcq({ ...acq, marcos_parameters: { ...acq.marcos_parameters, port: Math.round(port) } })
            }
          />
        </SettingsRow>
        <SettingsRow title="FPGA clock" description="Red Pitaya 122-16 clock in MHz. MaRCoS only supports 122.88 on rp-122.">
          <NumberField
            label="FPGA clock (MHz)"
            value={acq.marcos_parameters.fpga_clock_frequency_MHz}
            step="0.01"
            onChange={(fpga_clock_frequency_MHz) =>
              queueAcq({ ...acq, marcos_parameters: { ...acq.marcos_parameters, fpga_clock_frequency_MHz } })
            }
          />
        </SettingsRow>
        <SettingsRow title="Gradient board">
          <Select
            compact
            label="Gradient board"
            value={acq.marcos_parameters.gradient_board_type}
            onChange={(gradient_board_type) =>
              queueAcq({ ...acq, marcos_parameters: { ...acq.marcos_parameters, gradient_board_type } })
            }
            options={[
              { value: "gpa-fhdo", label: "gpa-fhdo" },
              { value: "ocra1", label: "ocra1" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Initialize GPA"
          description="Send GPA-FHDO SPI setup when a scan starts. Leave off unless a gradient board is attached; those commands can close the MaRCoS connection."
        >
          <Switch
            label="Initialize GPA"
            checked={Boolean(acq.marcos_parameters.initialize_gpa)}
            onChange={(initialize_gpa) =>
              queueAcq({ ...acq, marcos_parameters: { ...acq.marcos_parameters, initialize_gpa } })
            }
          />
        </SettingsRow>
        <SettingsRow title="GPA-FHDO current per volt" description="Set by the board resistors. Default 2.5 A/V.">
          <NumberField
            label="GPA-FHDO current per volt"
            value={acq.marcos_parameters.gpa_fhdo_current_per_volt}
            step="0.01"
            onChange={(gpa_fhdo_current_per_volt) =>
              queueAcq({ ...acq, marcos_parameters: { ...acq.marcos_parameters, gpa_fhdo_current_per_volt } })
            }
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
