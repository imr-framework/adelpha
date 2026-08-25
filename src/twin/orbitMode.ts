import { useEffect, useState } from "react";

export type OrbitMode = "free" | "turntable";

const KEY = "adelpha.orbitMode.v2";
const EVENT = "adelpha:orbit-mode";

export function readOrbitMode(): OrbitMode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "free") return "free";
    if (value === "turntable") return "turntable";
  } catch {
    /* ignore */
  }
  return "turntable";
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
