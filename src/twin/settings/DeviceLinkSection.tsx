import { useCallback, useEffect, useState } from "react";

import { fetchDevices, fetchHealth, setDeviceControl, type DeviceListenerStatus } from "../dtamApi";
import { revealDtamConfigDir } from "../../desktop/dtamRuntime";
import { isTauri } from "../../desktop/runtime";
import { SettingsRow, SettingsSection, StatusBadge, Switch } from "./controls";

export function DeviceLinkSection() {
  const [status, setStatus] = useState<DeviceListenerStatus | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();

  const load = useCallback(async () => {
    try {
      const [devices, health] = await Promise.all([fetchDevices(), fetchHealth().catch(() => null)]);
      setStatus(devices);
      setMode(health?.mode ?? null);
      setError(devices.error ?? "");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not read the device listener.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const listening = Boolean(status?.port);
  const endpoint = listening
    ? `ws://${status?.host === "0.0.0.0" ? "<this-computer>" : status?.host}:${status?.port}/ws/<device_id>`
    : null;

  return (
    <SettingsSection
      title="Adelpha device link"
      description="Raspberry Pi boards connect over Ethernet with JSON-RPC. Arduino stays on a user Python process that uses the same client."
    >
      <SettingsRow title="Listener" description={endpoint ?? "No devices.json loaded. Copy the example into the Adelpha config folder and restart."}>
        <StatusBadge tone={listening ? "live" : error ? "fault" : "idle"}>
          {listening ? `Port ${status?.port}` : error ? "Unavailable" : "Not configured"}
        </StatusBadge>
      </SettingsRow>
      {(status?.devices ?? []).map((device) => (
        <SettingsRow
          key={device.device_id}
          title={device.device_id}
          description={`${device.scanner_id}${device.last_received ? ` · last ${device.last_received}` : ""}`}
        >
          <StatusBadge tone={device.connected ? "live" : "idle"}>{device.connected ? "Connected" : "Idle"}</StatusBadge>
        </SettingsRow>
      ))}
      <SettingsRow
        title="Physical control"
        description="Commands stay rejected until a hardware profile is selected, allow_control is true in devices.json, and this switch is on."
        hint={mode === "simulation" ? "Select a hardware scanner profile first." : !status?.allow_control ? "Set allow_control in devices.json." : undefined}
      >
        <Switch
          label="Physical control"
          checked={Boolean(status?.control_enabled)}
          disabled={busy || !status?.allow_control || mode === "simulation"}
          onChange={(enabled) => {
            setBusy(true);
            void setDeviceControl(enabled)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false));
          }}
        />
      </SettingsRow>
      {desktop ? (
        <div className="settings-key-actions">
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              void revealDtamConfigDir().catch((err: unknown) =>
                setError(err instanceof Error ? err.message : String(err)),
              );
            }}
          >
            Open config folder
          </button>
        </div>
      ) : null}
      {error ? <p className="settings-about">{error}</p> : null}
    </SettingsSection>
  );
}
