import { useCallback, useEffect, useState, type RefObject } from "react";

import { subscribeOpenSettings, type SettingsLaunch } from "../../settingsOpen";

/**
 * Open/close state for the settings workspace, plus the two accessibility
 * behaviours it owns: Escape closes it, and everything behind it leaves the
 * tab order.
 */
export function useSettingsOverlay({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLaunch, setSettingsLaunch] = useState<SettingsLaunch | null>(null);

  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
        setSettingsLaunch(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  // The settings workspace is opaque, so the twin behind it must also leave the
  // tab order — aria-modal alone does not stop keyboard focus reaching it.
  useEffect(() => {
    const root = mainRef.current;
    if (!root || !showSettings) return;
    const behind = [...root.children].filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && !el.classList.contains("settings-overlay"),
    );
    for (const el of behind) el.inert = true;
    return () => {
      for (const el of behind) el.inert = false;
    };
  }, [showSettings, mainRef]);

  useEffect(() => {
    return subscribeOpenSettings((launch) => {
      setSettingsLaunch(launch);
      setShowSettings(true);
    });
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((open) => {
      if (open) setSettingsLaunch(null);
      return !open;
    });
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setSettingsLaunch(null);
  }, []);

  return { showSettings, settingsLaunch, toggleSettings, closeSettings };
}
