export type SettingsLaunch = {
  section?: "3d-model" | "ai-agents" | "digital-twin";
  openModelLibrary?: boolean;
  focusPartId?: string;
};

const EVENT = "adelpha:open-settings";

export function requestOpenSettings(launch: SettingsLaunch = {}) {
  window.dispatchEvent(new CustomEvent<SettingsLaunch>(EVENT, { detail: launch }));
}

export function subscribeOpenSettings(onOpen: (launch: SettingsLaunch) => void) {
  const handler = (event: Event) => {
    onOpen((event as CustomEvent<SettingsLaunch>).detail ?? {});
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
