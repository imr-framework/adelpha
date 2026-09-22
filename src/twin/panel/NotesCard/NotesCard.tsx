import type { SystemState } from "../../dtamTypes";
import { InfoCard } from "../metrics";

export function NotesCard({ systemState }: { systemState: SystemState | null }) {
  return (
    <>
    {systemState?.notes?.length ? (
      <InfoCard title="Notes">
        <ul className="notes-list">
          {systemState.notes.map((n, i) => (
            <li key={`${i}-${n.slice(0, 24)}`}>{n}</li>
          ))}
        </ul>
      </InfoCard>
    ) : null}
    </>
  );
}
