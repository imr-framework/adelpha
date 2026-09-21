import { lazy } from "react";

export const ImagingConsole = lazy(() =>
  import("../ImagingConsole").then((m) => ({ default: m.ImagingConsole })),
);
export const EngineeringStudio = lazy(() =>
  import("../EngineeringStudio").then((m) => ({ default: m.EngineeringStudio })),
);
