import { physicalModelKey, type GeometryIssue, type PhysicalPart } from "./geometryPrep";
import type { HardwareStudyKind, HardwareStudySettings } from "./hardwareStudyStore";

/** Visibility and selection deliberately do not change preparation. */
export function preparationKey(parts: PhysicalPart[], settings: HardwareStudySettings, exampleId: string | null) {
  return JSON.stringify([exampleId ? `example:${exampleId}` : physicalModelKey(parts), settings]);
}

export function settingsIssues(settings: HardwareStudySettings, study: HardwareStudyKind): GeometryIssue[] {
  const messages: string[] = [];
  if (settings.roi.centerM.some((n) => !Number.isFinite(n))) messages.push("ROI center must contain finite coordinates.");
  if (settings.roi.sizeM.some((n) => !Number.isFinite(n) || n <= 0)) messages.push("ROI dimensions must be positive.");
  if (settings.roi.samples.some((n) => !Number.isInteger(n) || n < 3 || n > 41)) messages.push("ROI samples must be whole numbers from 3 to 41.");
  if (settings.referenceFieldT !== null && (!Number.isFinite(settings.referenceFieldT) || settings.referenceFieldT <= 0)) messages.push("Reference field must be positive, or left blank for mean |B|.");
  if (study === "fem") {
    if (settings.mesh.grid.some((n) => !Number.isInteger(n) || n < 6 || n > 32)) messages.push("Mesh grid must contain whole numbers from 6 to 32.");
    if (!Number.isFinite(settings.mesh.airPaddingM) || settings.mesh.airPaddingM < 0.005 || settings.mesh.airPaddingM > 0.2) messages.push("Air padding must be between 5 and 200 mm.");
  }
  return messages.map((message, i) => ({ instanceId: "settings", partId: "", severity: "error", code: `SETTING_${i}`, message, correction: "Review Geometry & mesh or Physics before preparing the study." }));
}
