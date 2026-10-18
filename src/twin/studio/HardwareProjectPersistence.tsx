import { useEffect, useState, type ReactNode } from "react";
import { useHardwareStudyStore } from "./hardwareStudyStore";
import { useProjectState } from "./ProjectPersistence";

/** Migrate the existing magnet-study history into the project's durable record. */
export function HardwareProjectPersistence({ id, children }: { id: string; children: ReactNode }) {
  const [saved] = useProjectState("hardware.studies", () => useHardwareStudyStore.getState().projects[id] ?? {});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useHardwareStudyStore.setState(state => ({ projects: { ...state.projects, [id]: saved } }));
    setReady(true);
    // Hydrate once; subsequent updates flow from the live store to durable state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return ready ? children : <div role="status">Restoring study history…</div>;
}
