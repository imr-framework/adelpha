import { useEffect, useState } from "react";

import { fetchAbout } from "../mri/api";
import { isTauri } from "../../desktop/runtime";
import {
  pickMriDataDirectory,
  readMriDataInfo,
  revealMriDataDirectory,
  setMriDataDirectory,
  type MriDataInfo,
} from "../../desktop/mriData";
import { SettingsRow, SettingsSection } from "./controls";

export function MriDataDirectorySection() {
  const desktop = isTauri();
  const [info, setInfo] = useState<MriDataInfo | null>(null);
  const [browserBase, setBrowserBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (desktop) {
      void readMriDataInfo()
        .then(setInfo)
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
      return;
    }
    void fetchAbout()
      .then((about) => setBrowserBase(about.base))
      .catch(() => setBrowserBase(""));
  }, [desktop]);

  const path = info?.path || browserBase;

  async function choose() {
    setBusy(true);
    setMessage(null);
    try {
      const selected = await pickMriDataDirectory();
      if (!selected) return;
      const next = await setMriDataDirectory(selected);
      setInfo(next);
      setMessage("Saved. Imaging Console now uses this folder.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Study data"
      description="Exams, DICOMs, and reconstruction output. Changing the folder restarts the imaging services; existing studies stay where they are."
    >
      <SettingsRow title="Folder" layout="stack">
        {path ? <code className="settings-path">{path}</code> : <p className="settings-about">Loading…</p>}
        {info?.is_default ? <p className="settings-about">This is the default location on this computer.</p> : null}
      </SettingsRow>
      {desktop ? (
        <>
          <div className="settings-key-actions">
            <button type="button" className="settings-btn" disabled={busy} onClick={() => void choose()}>
              {busy ? "Working…" : "Choose folder"}
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage(null);
                void revealMriDataDirectory()
                  .then(() => setMessage("Opened the data folder."))
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Open folder
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={busy || !info || info.is_default}
              onClick={() => {
                setBusy(true);
                setMessage(null);
                void setMriDataDirectory(null)
                  .then((next) => {
                    setInfo(next);
                    setMessage("Restored the default folder.");
                  })
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Use default
            </button>
          </div>
          {message ? <p className="settings-key-feedback">{message}</p> : null}
        </>
      ) : (
        <p className="settings-about">
          Choose a folder in the Adelpha desktop app. Browser sessions use whatever directory the local API was started with.
        </p>
      )}
    </SettingsSection>
  );
}
