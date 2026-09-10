import { useEffect, useState } from "react";

const COLORS_KEY = "adelpha.useModelColors";
const COLORS_EVENT = "adelpha:use-model-colors";
const POLISH_KEY = "adelpha.polishedFinish";
const POLISH_EVENT = "adelpha:polished-finish";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, event: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<boolean>(event, { detail: value }));
}

export function readUseModelColors(): boolean {
  return readFlag(COLORS_KEY);
}

export function setUseModelColors(value: boolean) {
  writeFlag(COLORS_KEY, COLORS_EVENT, value);
  if (value) writeFlag(POLISH_KEY, POLISH_EVENT, false);
}

export function useModelColors(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(readUseModelColors);
  useEffect(() => {
    const onChange = (event: Event) => setValue((event as CustomEvent<boolean>).detail);
    window.addEventListener(COLORS_EVENT, onChange);
    return () => window.removeEventListener(COLORS_EVENT, onChange);
  }, []);
  return [value, setUseModelColors];
}

export function readPolishedFinish(): boolean {
  return readFlag(POLISH_KEY);
}

export function setPolishedFinish(value: boolean) {
  writeFlag(POLISH_KEY, POLISH_EVENT, value);
  if (value) writeFlag(COLORS_KEY, COLORS_EVENT, false);
}

export function usePolishedFinish(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(readPolishedFinish);
  useEffect(() => {
    const onChange = (event: Event) => setValue((event as CustomEvent<boolean>).detail);
    window.addEventListener(POLISH_EVENT, onChange);
    return () => window.removeEventListener(POLISH_EVENT, onChange);
  }, []);
  return [value, setPolishedFinish];
}
