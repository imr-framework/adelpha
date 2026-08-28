import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  clearGoogleApiKey,
  googleApiKeyStatus,
  isTauri,
  setGoogleApiKey,
  type GoogleApiKeyStatus,
} from "../../desktop/runtime";
import { SettingsRow, SettingsSection, StatusBadge, type BadgeTone } from "./controls";

function agentsTone(status: string): BadgeTone {
  if (status === "healthy") return "live";
  if (status === "starting") return "ai";
  if (status === "error" || status === "unavailable") return "fault";
  return "idle";
}

function agentsLabel(status: string): string {
  if (status === "healthy") return "Agents online";
  if (status === "starting") return "Starting…";
  if (status === "error") return "Agents error";
  if (status === "unavailable") return "Agents unavailable";
  if (status === "stopped") return "Agents offline";
  return "Agents unknown";
}

function sourceCopy(status: GoogleApiKeyStatus): string {
  if (status.source === "settings" && status.hint) {
    return `Saved on this computer · ending in ${status.hint}`;
  }
  if (status.source === "environment") {
    return status.hint
      ? `Loaded from the environment · ending in ${status.hint}`
      : "Loaded from the environment";
  }
  return "No key saved yet. Agents stay offline until you add one.";
}

export function GoogleApiKeySection() {
  const desktop = isTauri();
  const [status, setStatus] = useState<GoogleApiKeyStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!desktop) return;
    void googleApiKeyStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  async function save() {
    const key = draft.trim();
    if (!key) {
      setMessage("Paste an API key first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await setGoogleApiKey(key);
      setStatus(next);
      setDraft("");
      setReveal(false);
      if (next.error) setMessage(next.error);
      else if (next.agents_status === "healthy") setMessage("Key saved. Agents are ready to use.");
      else setMessage("Key saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await clearGoogleApiKey();
      setStatus(next);
      setDraft("");
      setMessage("Saved key removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const agentsStatus = status?.agents_status ?? "unknown";

  return (
    <SettingsSection
      title="Google API key"
      description="Required for the Agents tab. The key stays on this computer and is never bundled with Adelpha."
      actions={
        desktop ? (
          <StatusBadge tone={agentsTone(agentsStatus)}>{agentsLabel(agentsStatus)}</StatusBadge>
        ) : null
      }
    >
      {desktop ? (
        <>
          <SettingsRow
            title="API key"
            description={status ? sourceCopy(status) : "Checking saved key…"}
            hint="Get a Gemini key from Google AI Studio, then save it here to enable agents."
            layout="stack"
          >
            <div className="settings-secret">
              <input
                className="settings-input"
                type={reveal ? "text" : "password"}
                value={draft}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  status?.configured ? "Enter a new key to replace the saved one" : "Paste your API key"
                }
                aria-label="Google API key"
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <button
                type="button"
                className="settings-secret-toggle"
                aria-label={reveal ? "Hide API key" : "Show API key"}
                disabled={busy || !draft}
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
            </div>
          </SettingsRow>
          <div className="settings-key-actions">
            <button
              type="button"
              className="settings-btn settings-btn-accent"
              disabled={busy || !draft.trim()}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save and enable agents"}
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={busy || status?.source !== "settings"}
              onClick={() => void remove()}
            >
              Remove saved key
            </button>
          </div>
          {message ? <p className="settings-key-feedback">{message}</p> : null}
        </>
      ) : (
        <p className="settings-about">
          API keys are stored by the Adelpha desktop app. In a browser session, start the Agents API
          yourself or run Adelpha with Tauri.
        </p>
      )}
    </SettingsSection>
  );
}
