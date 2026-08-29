import { useEffect, useState } from "react";

import {
  DTAM_AGENT_MODELS,
  DTAM_AGENT_MODES,
  DTAM_ENVIRONMENTS,
  DTAM_SCANNERS,
  DEFAULT_DTAM_PREFS,
  readDtamRuntimePrefs,
  revealDtamConfigDir,
  restartDtamRuntime,
  saveDtamRuntimePrefs,
  type DtamRuntimePrefs,
} from "../../desktop/dtamRuntime";
import { getRuntime, isTauri, type RuntimeStatus } from "../../desktop/runtime";
import { fetchHealth } from "../dtamApi";
import { requestOpenSettings } from "../settingsOpen";
import { Select, SettingsRow, SettingsSection, StatusBadge, type BadgeTone } from "./controls";

function serviceTone(status: string | undefined): BadgeTone {
  if (status === "healthy") return "live";
  if (status === "starting") return "ai";
  if (status === "error" || status === "unavailable") return "fault";
  return "idle";
}

function serviceLabel(id: string, status: string | undefined): string {
  const name = id === "twin" ? "Twin" : id === "agents" ? "Agents" : id === "console" ? "Console" : id;
  if (status === "healthy") return `${name} online`;
  if (status === "starting") return `${name} starting`;
  if (status === "error") return `${name} error`;
  if (status === "stopped") return `${name} offline`;
  return `${name} unknown`;
}

export function DtamRuntimeStatus() {
  const desktop = isTauri();
  const [runtime] = useState<RuntimeStatus | null>(desktop ? getRuntime() : null);
  const [health, setHealth] = useState<{ scanner_id: string; mode: string; connected: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchHealth()
      .then((next) => {
        if (!cancelled) {
          setHealth({
            scanner_id: next.scanner_id,
            mode: next.mode,
            connected: next.connected,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runtime?.session]);

  const services = runtime?.services ?? {};

  return (
    <SettingsSection
      title="Runtime"
      description="DTAM runs inside Adelpha. Twin and Imaging Console start automatically. Agents start after you save a Google API key."
    >
      <div className="settings-key-actions" style={{ marginBottom: 12 }}>
        <StatusBadge tone={serviceTone(services.twin?.status)}>{serviceLabel("twin", services.twin?.status)}</StatusBadge>
        <StatusBadge tone={serviceTone(services.agents?.status)}>
          {serviceLabel("agents", services.agents?.status)}
        </StatusBadge>
        <StatusBadge tone={serviceTone(services.console?.status)}>
          {serviceLabel("console", services.console?.status)}
        </StatusBadge>
      </div>
      {health ? (
        <p className="settings-about">
          Twin scanner <code>{health.scanner_id}</code> · mode <code>{health.mode}</code>
          {health.connected ? " · connected" : " · not connected"}
        </p>
      ) : (
        <p className="settings-about">Twin health is not available yet.</p>
      )}
    </SettingsSection>
  );
}

export function DtamTwinSetupSection() {
  const desktop = isTauri();
  const [prefs, setPrefs] = useState<DtamRuntimePrefs>(DEFAULT_DTAM_PREFS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void readDtamRuntimePrefs()
      .then(setPrefs)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
  }, [desktop]);

  async function apply(next: DtamRuntimePrefs) {
    setPrefs(next);
    if (!desktop) {
      setMessage("These settings apply in the Adelpha desktop app.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveDtamRuntimePrefs(next);
      setPrefs(saved);
      setMessage("Saved. The twin restarted with these settings.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Twin setup"
      description="Choose the DTAM scanner profile and environment. This is separate from the 3D model in the viewport."
    >
      {desktop ? (
        <>
          <SettingsRow
            title="Scanner profile"
            description="Which DTAM adapter the twin uses for telemetry and assessment."
            layout="stack"
          >
            <Select
              label="Scanner profile"
              value={prefs.scanner_id}
              disabled={busy}
              onChange={(value) => void apply({ ...prefs, scanner_id: value })}
              options={[...DTAM_SCANNERS]}
            />
          </SettingsRow>
          <SettingsRow
            title="Environment"
            description="Loads development, production, or testing YAML on top of the base config."
            layout="stack"
          >
            <Select
              label="Environment"
              value={prefs.environment}
              disabled={busy}
              onChange={(value) => void apply({ ...prefs, environment: value })}
              options={[...DTAM_ENVIRONMENTS]}
            />
          </SettingsRow>
          <div className="settings-key-actions">
            <button
              type="button"
              className="settings-btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage(null);
                void revealDtamConfigDir()
                  .then(() => setMessage("Opened the editable DTAM config folder."))
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Open config folder
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage(null);
                void restartDtamRuntime()
                  .then(() => setMessage("Runtime restarted."))
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Working…" : "Restart runtime"}
            </button>
          </div>
          {message ? <p className="settings-key-feedback">{message}</p> : null}
        </>
      ) : (
        <p className="settings-about">
          Scanner and environment are saved by the Adelpha desktop app. Browser sessions use whatever
          Twin API you started locally.
        </p>
      )}
    </SettingsSection>
  );
}

export function DtamAgentSetupSection() {
  const desktop = isTauri();
  const [prefs, setPrefs] = useState<DtamRuntimePrefs>(DEFAULT_DTAM_PREFS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void readDtamRuntimePrefs()
      .then(setPrefs)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
  }, [desktop]);

  async function apply(next: DtamRuntimePrefs) {
    setPrefs(next);
    if (!desktop) {
      setMessage("These settings apply in the Adelpha desktop app.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveDtamRuntimePrefs(next);
      setPrefs(saved);
      setMessage("Saved. Agents will use this after the runtime restart.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Agent defaults"
      description="Passed to DTAM as DT_MODEL and DT_DEFAULT_MODE. Requires a Google API key."
    >
      <SettingsRow title="Model" description="Gemini model used by the supervisor and specialists." layout="stack">
        <Select
          label="Model"
          value={prefs.agent_model}
          disabled={busy}
          onChange={(value) => void apply({ ...prefs, agent_model: value })}
          options={[...DTAM_AGENT_MODELS]}
        />
      </SettingsRow>
      <SettingsRow
        title="Default mode"
        description="Observe reports only. Recommend suggests actions. Act stays simulated in this build."
        layout="stack"
      >
        <Select
          label="Default mode"
          value={prefs.agent_mode}
          disabled={busy}
          onChange={(value) => void apply({ ...prefs, agent_mode: value })}
          options={[...DTAM_AGENT_MODES]}
        />
      </SettingsRow>
      {message ? <p className="settings-key-feedback">{message}</p> : null}
    </SettingsSection>
  );
}

export function DtamIntegrationsSection() {
  return (
    <>
      <DtamRuntimeStatus />
      <SettingsSection
        title="Setup"
        description="Twin, agents, and console are built into Adelpha. Configure them here rather than editing dtam/.env."
      >
        <div className="settings-key-actions">
          <button
            type="button"
            className="settings-btn settings-btn-accent"
            onClick={() => requestOpenSettings({ section: "digital-twin" })}
          >
            Open twin setup
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={() => requestOpenSettings({ section: "ai-agents" })}
          >
            Open agent setup
          </button>
        </div>
      </SettingsSection>
    </>
  );
}
