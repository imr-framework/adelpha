import { useEffect, useState } from "react";

const KEY = "adelpha.useModelColors";
const EVENT = "adelpha:use-model-colors";

export function readUseModelColors(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setUseModelColors(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: value }));
}

export function useModelColors(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(readUseModelColors);
  useEffect(() => {
    const onChange = (event: Event) => setValue((event as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [value, setUseModelColors];
}
