import type { FemFields } from "../mri/api";
import { traceFieldLines } from "./femStreamlines";
self.onmessage = (event: MessageEvent<FemFields>) => {
  try { self.postMessage({ lines: traceFieldLines(event.data) }); }
  catch { self.postMessage({ error: "Field lines could not be generated for this result." }); }
};
