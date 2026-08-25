import { scaleForScannerModel, useTwinStore } from "./telemetryStore";

const EVENT = "adelpha:viewport-recenter";

/** Restore the original camera framing, assembled parts, and catalog model scale. */
export function recenterViewport() {
  useTwinStore.getState().setView({
    exploded: 0,
    magnet_cad_scale: scaleForScannerModel(),
  });
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeViewportRecenter(onRecenter: () => void) {
  window.addEventListener(EVENT, onRecenter);
  return () => window.removeEventListener(EVENT, onRecenter);
}
