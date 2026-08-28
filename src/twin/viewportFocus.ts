import type { ScannerModelId } from "./scannerModel";

/**
 * Ask the twin viewport to frame one CAD part.
 *
 * Honored by `MagnetCAD` only while the viewport is mounted for the same
 * scanner and the part exists in the loaded assembly; a request for an unknown
 * part, a scanner profile without CAD, or an unmounted viewport is dropped. The
 * request is fire-and-forget by design — settings never blocks on the scene.
 */
export type PartFocusRequest = {
  scannerId: ScannerModelId;
  partId: string;
};

const EVENT = "adelpha:focus-part";

export function requestPartFocus(request: PartFocusRequest) {
  window.dispatchEvent(new CustomEvent<PartFocusRequest>(EVENT, { detail: request }));
}

export function subscribePartFocus(onFocus: (request: PartFocusRequest) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PartFocusRequest>).detail;
    if (detail) onFocus(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
