import { useEffect, useState } from "react";

import { ADELPHA_VERSION } from "../adelphaVersion";
import {
  checkForAppUpdate,
  installPendingUpdate,
  readAutoUpdate,
  writeAutoUpdate,
} from "../../desktop/updater";
import { isTauri } from "../../desktop/runtime";
import { SettingsRow, SettingsSection, StatusBadge, Switch, type BadgeTone } from "./controls";

function phaseTone(phase: string): BadgeTone {
  if (phase === "up-to-date") return "live";
  if (phase === "available" || phase === "downloading" || phase === "installing") return "ai";
  if (phase === "error") return "fault";
  return "idle";
}

export function UpdatesSection() {
  const desktop = isTauri();
  const [auto, setAuto] = useState(readAutoUpdate);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [nextVersion, setNextVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    writeAutoUpdate(auto);
  }, [auto]);

  async function check(thenInstall: boolean) {
    if (!desktop) {
      setPhase("error");
      setMessage("Open the installed Adelpha app to check for updates.");
      return;
    }
    setBusy(true);
    setPhase("checking");
    setMessage(null);
    setProgress("");
    try {
      const result = await checkForAppUpdate();
      if (!result.available) {
        setPhase("up-to-date");
        setNextVersion(null);
        setMessage(`Adelpha ${ADELPHA_VERSION} is the latest published release.`);
        return;
      }
      setNextVersion(result.version ?? null);
      setPhase("available");
      setMessage(
        result.notes?.trim()
          ? `Version ${result.version} is available. ${result.notes.trim()}`
          : `Version ${result.version} is available.`,
      );
      if (thenInstall) {
        await install(result.version);
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function install(version?: string | null) {
    setBusy(true);
    setPhase("downloading");
    setMessage(`Downloading Adelpha ${version ?? nextVersion ?? ""}…`);
    try {
      await installPendingUpdate((downloaded, total) => {
        if (total > 0) {
          const pct = Math.min(100, Math.round((downloaded / total) * 100));
          setProgress(`${pct}%`);
          setPhase("downloading");
        }
      });
      setPhase("installing");
      setMessage("Installing. Adelpha will restart.");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsSection
        title="Application"
        actions={
          <StatusBadge tone={phaseTone(phase)}>
            {phase === "up-to-date"
              ? "Up to date"
              : phase === "available"
                ? "Update available"
                : phase === "checking"
                  ? "Checking…"
                  : phase === "downloading"
                    ? `Downloading${progress ? ` ${progress}` : ""}`
                    : phase === "installing"
                      ? "Installing"
                      : phase === "error"
                        ? "Update error"
                        : "Idle"}
          </StatusBadge>
        }
      >
        <SettingsRow
          title="Current version"
          description={`Adelpha ${ADELPHA_VERSION}`}
        >
          <button
            type="button"
            className="settings-btn"
            disabled={busy}
            onClick={() => void check(false)}
          >
            Check for updates
          </button>
        </SettingsRow>
        {nextVersion && phase === "available" ? (
          <SettingsRow
            title="Install update"
            description={`Download Adelpha ${nextVersion} and restart.`}
          >
            <button
              type="button"
              className="settings-btn"
              disabled={busy}
              onClick={() => void install(nextVersion)}
            >
              Install and restart
            </button>
          </SettingsRow>
        ) : null}
        <SettingsRow
          title="Automatic updates"
          description="After startup, check GitHub Releases and install a newer signed build, then restart."
        >
          <Switch
            label="Automatic updates"
            checked={auto}
            onChange={setAuto}
            disabled={!desktop}
          />
        </SettingsRow>
        {message ? <p className="settings-about">{message}</p> : null}
        {!desktop ? (
          <p className="muted">
            In-app updates run in the packaged Adelpha app, not in the browser.
          </p>
        ) : null}
      </SettingsSection>
    </>
  );
}
