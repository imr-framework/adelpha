import { useEffect, useState } from "react";
import App from "../App";
import { LaunchScreen } from "../twin/launch/LaunchScreen";
import { shouldPlayLaunchIntro } from "../twin/launch/launchConfig";
import { CrashScreen } from "./CrashScreen";
import { RecoveryScreen } from "./RecoveryScreen";
import { ErrorBoundary } from "../twin/ErrorBoundary";
import {
  initDesktopRuntime,
  installDesktopBridges,
  isTauri,
  type RuntimeStatus,
} from "./runtime";
import "../styles.css";

/**
 * Paint the brand intro immediately, and wait for the Python sidecar in
 * parallel. The overlay stays up until both the cinematic and the handshake
 * are done, so the packaged-app cold start is not a black window.
 */
export function Boot() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [introDone, setIntroDone] = useState(
    () => !isTauri() && !shouldPlayLaunchIntro(),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await initDesktopRuntime();
      await installDesktopBridges();
      if (!cancelled) setRuntime(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!introDone) {
    return (
      <LaunchScreen
        hold={runtime === null && isTauri()}
        onComplete={() => setIntroDone(true)}
      />
    );
  }

  if (!runtime?.ok) {
    return (
      <RecoveryScreen
        runtime={
          runtime ?? {
            ok: false,
            ready: false,
            baseUrl: "",
            token: "",
            version: "",
            session: "",
            services: {},
            requiredFailed: [],
            error: "Python runtime did not become ready",
            pythonRuntimeVersion: "",
            adelphaVersion: "",
            tauriVersion: "",
          }
        }
      />
    );
  }

  return (
    <ErrorBoundary fallbackRender={(error) => <CrashScreen error={error} />}>
      <App />
    </ErrorBoundary>
  );
}
