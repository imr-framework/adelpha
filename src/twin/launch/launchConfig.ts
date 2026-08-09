/** Session key — full cinematic intro once per browser tab session. */
export const LAUNCH_SEEN_KEY = "adelpha-launch-seen";

/** Dev replay: `?replayIntro=1` forces the full intro regardless of session. */
export const LAUNCH_REPLAY_PARAM = "replayIntro";

/**
 * Dev-only: set `true` locally to always play the intro (ignored in checks if false).
 * Prefer `?replayIntro=1` so production builds stay quiet.
 */
export const LAUNCH_FORCE_REPLAY = false;

/** Total cinematic duration (seconds). Overlay fade occupies the final 0.5s. */
export const LAUNCH_DURATION_S = 7.0;

/** Reduced-motion brand hold before fade (seconds). */
export const LAUNCH_REDUCED_DURATION_S = 1.0;

export const LAUNCH_COLORS = {
  bg: "#050607",
  text: "#F2F4F7",
  secondary: "#9299A4",
  ice: "#7DDCFF",
  emerald: "#31D89B",
} as const;

export const LAUNCH_COPY = {
  wordmark: "Adelpha",
  subtitle: "The Intelligent Magnetic Resonance Framework",
} as const;

export function shouldPlayLaunchIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (LAUNCH_FORCE_REPLAY) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get(LAUNCH_REPLAY_PARAM) === "1") return true;
    return sessionStorage.getItem(LAUNCH_SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markLaunchSeen(): void {
  try {
    sessionStorage.setItem(LAUNCH_SEEN_KEY, "1");
  } catch {
    /* private mode / blocked storage */
  }
}
