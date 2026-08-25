import { cadForScanner, readScannerModel, type ScannerCadSpec } from "./scannerModel";

/** CAD mesh for the currently selected scanner, if that profile has one. */
export function readMagnetCad(): ScannerCadSpec | undefined {
  return cadForScanner(readScannerModel());
}

/** Public URL for the magnet mesh, or undefined if the selected scanner has no CAD. */
export function readMagnetCadUrl(): string | undefined {
  return readMagnetCad()?.url;
}
