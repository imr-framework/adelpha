import { evaluateDsv } from "./femDsv";
self.onmessage = event => {
  try { self.postMessage({ result: evaluateDsv(event.data.data, event.data.config) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
