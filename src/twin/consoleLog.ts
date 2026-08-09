import { create } from "zustand";

export type ConsoleLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR" | "CMD";

export type ConsoleEntry = {
  id: number;
  ts: number;
  level: ConsoleLevel;
  message: string;
};

export type ConsoleTab = "system" | "terminal";

const MAX_ENTRIES = 200;
const OPEN_KEY = "twin_system_console_open";
const TAB_KEY = "twin_system_console_tab";

let nextId = 1;

function readOpenPref(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(OPEN_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function readTabPref(): ConsoleTab {
  if (typeof localStorage === "undefined") return "system";
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "system" || v === "terminal") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

type ConsoleStore = {
  entries: ConsoleEntry[];
  terminalEntries: ConsoleEntry[];
  open: boolean;
  tab: ConsoleTab;
  push: (level: ConsoleLevel, message: string) => void;
  pushTerminal: (level: ConsoleLevel, message: string) => void;
  clear: () => void;
  clearTerminal: () => void;
  setOpen: (open: boolean) => void;
  setTab: (tab: ConsoleTab) => void;
};

export const useConsoleStore = create<ConsoleStore>((set) => ({
  entries: [
    {
      id: nextId++,
      ts: Date.now(),
      level: "INFO",
      message: "Logging ready — system events appear here",
    },
  ],
  terminalEntries: [
    {
      id: nextId++,
      ts: Date.now(),
      level: "INFO",
      message: "Terminal ready — type help for commands",
    },
  ],
  open: readOpenPref(),
  tab: readTabPref(),
  push: (level, message) =>
    set((s) => ({
      entries: [
        ...s.entries.slice(-(MAX_ENTRIES - 1)),
        { id: nextId++, ts: Date.now(), level, message },
      ],
    })),
  pushTerminal: (level, message) =>
    set((s) => ({
      terminalEntries: [
        ...s.terminalEntries.slice(-(MAX_ENTRIES - 1)),
        { id: nextId++, ts: Date.now(), level, message },
      ],
    })),
  clear: () => set({ entries: [] }),
  clearTerminal: () => set({ terminalEntries: [] }),
  setOpen: (open) => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ open });
  },
  setTab: (tab) => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
    set({ tab });
  },
}));

export function pushConsole(level: ConsoleLevel, message: string) {
  useConsoleStore.getState().push(level, message);
}
