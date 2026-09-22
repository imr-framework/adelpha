import type { SettingsLaunch } from "../../settingsOpen";
import { SettingsCard } from "../../SettingsCard";

export function SettingsOverlay({
  showSettings,
  settingsLaunch,
  closeSettings,
}: {
  showSettings: boolean;
  settingsLaunch: SettingsLaunch | null;
  closeSettings: () => void;
}) {
  return (
    <>
  {/* Opaque, full-height settings workspace. The twin stays mounted behind
      it so switching back does not reload the CAD assembly. */}
  {showSettings ? (
    <div className="settings-overlay">
      <SettingsCard
        launch={settingsLaunch}
        onClose={closeSettings}
      />
    </div>
  ) : null}
    </>
  );
}
