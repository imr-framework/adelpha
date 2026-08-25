import { useEffect, useState } from "react";

export type OrbitMode = "free" | "turntable";

const KEY = "adelpha.orbitMode";
const EVENT = "adelpha:orbit-mode";

export function readOrbitMode(): OrbitMode {
  try {
    return localStorage.getItem(KEY) === "turntable" ? "turntable" : "free";
  } catch {
    return "free";
  }
}

export function setOrbitMode(value: OrbitMode) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<OrbitMode>(EVENT, { detail: value }));
}

export function useOrbitMode(): [OrbitMode, (value: OrbitMode) => void] {
  const [value, setValue] = useState<OrbitMode>(readOrbitMode);
  useEffect(() => {
    const onChange = (event: Event) => setValue((event as CustomEvent<OrbitMode>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [value, setOrbitMode];
}
