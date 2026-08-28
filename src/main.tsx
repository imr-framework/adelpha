import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted (OFL-1.1) so the packaged desktop app never reaches a font CDN.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
