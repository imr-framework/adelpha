import { useHardwareStudyStore } from "./hardwareStudyStore";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { loadProjectState, saveProjectState, type SavedProject } from "./projectStorage";
import "./projectPersistence.css";

type Session = { data: SavedProject; deleted: boolean; tail: Promise<void>; error: string; pending: number; scheduled: boolean; activeRuns: number; listeners: Set<() => void> };
const sessions = new Map<string, Session>();
if (typeof window !== "undefined") window.addEventListener("beforeunload", event => {
  if ([...sessions.values()].some(session => !session.deleted && (session.pending || session.error))) {
    event.preventDefault(); event.returnValue = "";
  }
});
const Context = createContext<{ session: Session; save: () => void } | null>(null);
const notify = (session: Session) => session.listeners.forEach(listener => listener());
function queueSave(id: string, session: Session) {
  if (session.deleted || session.scheduled) return;
  session.scheduled = true;
  session.pending += 1;
  queueMicrotask(() => notify(session));
  session.tail = session.tail.then(async () => {
    session.scheduled = false;
    if (session.deleted) { session.pending -= 1; return; }
    try { await saveProjectState(id, structuredClone(session.data)); session.error = ""; }
    catch { session.error = "Could not save this project. Keep it open and retry before quitting Adelpha."; }
    session.pending -= 1; notify(session);
  });
}
// Keep background magnet completions durable even after its view unmounts.
useHardwareStudyStore.subscribe((state, previous) => {
  for (const [id, session] of sessions) {
    if (!session.deleted && state.projects[id] && state.projects[id] !== previous.projects[id]) {
      session.data.values["hardware.studies"] = state.projects[id];
      queueSave(id, session);
    }
  }
});

export async function flushProject(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  let tail;
  do { tail = session.tail; await tail; } while (tail !== session.tail);
  if (session.error) throw new Error(session.error);
}
export async function prepareProjectDeletion(id: string) {
  const session = sessions.get(id);
  if (session) { await session.tail; session.deleted = true; }
}
export function finishProjectDeletion(id: string, success: boolean) {
  const session = sessions.get(id);
  if (success) sessions.delete(id);
  else if (session) session.deleted = false;
}

export function ProjectPersistence({ id, children }: { id: string; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(sessions.get(id) ?? null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [, refresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    if (!session) void loadProjectState(id).then(data => {
      if (stopped) return;
      const next: Session = { data, deleted: false, tail: Promise.resolve(), error: "", pending: 0, scheduled: false, activeRuns: 0, listeners: new Set() };
      sessions.set(id, next); setSession(next); setLoadError("");
    }).catch(() => { if (!stopped) setLoadError("Could not open saved project data. Retry to protect your existing work."); });
    return () => { stopped = true; };
  }, [id, attempt, session]);
  useEffect(() => {
    if (!session) return;
    const listener = () => refresh(n => n + 1);
    session.listeners.add(listener);
    return () => { session.listeners.delete(listener); };
  }, [session]);
  if (!session) return <div role={loadError ? "alert" : "status"}>{loadError || "Opening saved project…"}{loadError && <button onClick={() => setAttempt(n => n + 1)}>Retry</button>}</div>;
  const save = () => queueSave(id, session);
  return <Context.Provider value={{ session, save }}><div className="studio-persisted-project">
    {session.error && <div className="studio-save-error"><span role="alert">{session.error}</span><button onClick={save}>Retry save</button></div>}
    <div className="studio-persisted-content">{children}</div>
  </div></Context.Provider>;
}

/** Save on each setter, including results that resolve after the view is closed. */
export function useProjectState<T>(key: string, initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
  const context = useContext(Context);
  const [state, setState] = useState<T>(() => {
    if (context && Object.prototype.hasOwnProperty.call(context.session.data.values, key)) return context.session.data.values[key] as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const current = useRef(state);
  useEffect(() => {
    if (context && !Object.prototype.hasOwnProperty.call(context.session.data.values, key)) {
      context.session.data.values[key] = current.current; context.save();
    } else if (context && current.current !== context.session.data.values[key]) {
      current.current = context.session.data.values[key] as T;
      setState(current.current);
    }
  }, [context, key]);
  return [state, next => {
    const value = typeof next === "function" ? (next as (old: T) => T)(current.current) : next;
    current.current = value;
    if (context && !context.session.deleted) { context.session.data.values[key] = value; context.save(); }
    setState(value);
  }];
}

/** Capture inputs at submission, then archive the result without pruning older runs. */
export function useProjectRun(prefix: string) {
  const context = useContext(Context);
  return () => {
    const values = context ? structuredClone(Object.fromEntries(Object.entries(context.session.data.values).filter(([key]) => key.startsWith(prefix + ".")))) : {};
    if (context) { context.session.activeRuns += 1; notify(context.session); }
    let ended = false;
    const done = () => { if (context && !ended) { ended = true; context.session.activeRuns -= 1; notify(context.session); } };
    const archive = (label: string, resultValues: Record<string, unknown>) => {
      done();
      if (!context || context.session.deleted) return;
      context.session.data.runs.unshift({ id: crypto.randomUUID(), createdAt: Date.now(), label, values: { ...values, [prefix + ".error"]: "", ...resultValues } });
      context.save(); notify(context.session);
    };
    archive.cancel = done;
    return archive;
  };
}

/** In-memory jobs remain busy when their project is closed and reopened. */
export function useProjectBusy() {
  return (useContext(Context)?.session.activeRuns ?? 0) > 0;
}
