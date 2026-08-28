/**
 * Local settings draft.
 *
 * Console theme, scanner model, viewport background, model colors, camera
 * rotation, render mode, temperature map, part bindings, and workspace prefs all
 * persist through their own stores and apply immediately. Everything left in
 * this draft is session-local preference state and is deliberately not wired to
 * the twin.
 */
export type Draft = {
  displayName: string;
  role: string;
  lab: string;
  theme: "dark" | "system" | "light";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  notifyScanner: boolean;
  notifyAgents: boolean;
  notifyTemp: boolean;
  notifyEmail: boolean;
  defaultWorkspace: string;
  restoreLayout: boolean;
  rememberPanel: boolean;
  defaultSequence: string;
  units: string;
  plotTiming: boolean;
  telemetryHz: string;
  showCad: boolean;
  cameraTracking: boolean;
  currentModel: string;
  renderQuality: "performance" | "balanced" | "ultra";
  pbrMaterials: boolean;
  showInternal: boolean;
  environment: string;
  sensorOverlays: boolean;
  fieldViz: string;
  liveTelemetry: boolean;
  primaryModel: string;
  fastModel: string;
  autonomy: "ask" | "balanced" | "act";
  explainDecisions: boolean;
  confirmCritical: boolean;
  webSearch: boolean;
  projectMemory: boolean;
  cameraEnabled: boolean;
  adkEnabled: boolean;
  dtamEnabled: boolean;
  cameraAccess: boolean;
  crashReports: boolean;
  usageAnalytics: boolean;
  autoUpdate: boolean;
};

export type PatchDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

export const INITIAL_DRAFT: Draft = {
  displayName: "MRI Uganda Operator",
  role: "Imaging physicist",
  lab: "Geethanath Lab",
  theme: "dark",
  density: "comfortable",
  reduceMotion: false,
  notifyScanner: true,
  notifyAgents: true,
  notifyTemp: true,
  notifyEmail: false,
  defaultWorkspace: "digital-twin",
  restoreLayout: true,
  rememberPanel: true,
  defaultSequence: "3d-tse",
  units: "si",
  plotTiming: false,
  telemetryHz: "2",
  showCad: true,
  cameraTracking: true,
  currentModel: "halbach-48",
  renderQuality: "balanced",
  pbrMaterials: true,
  showInternal: true,
  environment: "dark-studio",
  sensorOverlays: true,
  fieldViz: "none",
  liveTelemetry: true,
  primaryModel: "adelpha-auto",
  fastModel: "qwen-local",
  autonomy: "balanced",
  explainDecisions: true,
  confirmCritical: true,
  webSearch: true,
  projectMemory: true,
  cameraEnabled: true,
  adkEnabled: true,
  dtamEnabled: true,
  cameraAccess: true,
  crashReports: true,
  usageAnalytics: false,
  autoUpdate: false,
};
