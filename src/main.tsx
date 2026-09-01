import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { applyDesktopChromeAttrs } from "./desktop/chrome";
import { Boot } from "./desktop/Boot";

applyDesktopChromeAttrs();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
