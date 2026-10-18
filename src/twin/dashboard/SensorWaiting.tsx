import { useState } from "react";
import { BookOpen, Cable, Settings, ArrowRight } from "lucide-react";
import { requestOpenSettings } from "../settingsOpen";
import "./sensorWaiting.css";

const configure = () => requestOpenSettings({ section: "devices" });

export function SensorIllustration() {
  return <svg className="sensor-illustration" viewBox="0 0 680 230" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M105 18 43 88Q39 93 45 97L105 129 165 97Q171 93 167 88L109 18ZM105 24 105 123M109 25 160 91 110 119M100 29 49 91 100 119" />
      <path d="M99 128h15v19H99zM102 147v10h9v-10M106 157v25q0 25 29 25h21" />
      <path d="M277 143h125l22 17v42H255v-42ZM255 160h169M265 202v7h15v-7M398 202v7h15v-7" />
      <circle cx="279" cy="180" r="5"/><circle cx="307" cy="180" r="5"/><circle cx="335" cy="180" r="5"/><circle cx="363" cy="180" r="5"/>
      <path d="M565 43q0-6 5-6t5 6v96h-10ZM562 139h16v30h-16ZM566 169v24q0 16-22 16t-22-8q0-9 22-9h22" />
    </g>
    <g stroke="var(--m4-accent)" strokeWidth="1.5"><path strokeDasharray="3 5" d="M156 207q25 0 48-21M475 186q22 0 47 15"/><circle cx="210" cy="182" r="5"/><circle cx="469" cy="183" r="5"/></g>
  </svg>;
}

function ConnectionNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="sensor-notes">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

export function SensorWaiting({
  compact = false,
  mode = "hardware",
  notes = [],
}: {
  compact?: boolean;
  mode?: string;
  notes?: string[];
}) {
  const [guide, setGuide] = useState(false);
  const connectionNotes = notes.filter((note) => !note.startsWith("Hardware measurements"));
  return <section className={`sensor-waiting${compact ? " is-compact" : ""}`} aria-label="Sensor connection status">
    {compact ? <Cable className="sensor-waiting-icon" size={38} strokeWidth={1.25} aria-hidden="true" /> : <SensorIllustration />}
    <h2>{compact ? "Waiting for sensor data" : "Ready when your sensors are"}</h2>
    <p>{compact ? "Connected channels appear as they publish. Missing sensors stay blank." : <>Your scanner is in {mode === "hardware" ? "hardware" : "live"} mode.<br />Connect sensors to start receiving measurements. Unpublished or missing channels are not drawn as zero.</>}</p>
    {compact ? <><dl><div><dt>Mode</dt><dd>{mode === "hardware" ? "Hardware" : mode}</dd></div><div><dt>Sensor data</dt><dd>Not received</dd></div><div><dt>Last sample</dt><dd>—</dd></div></dl><ConnectionNotes notes={connectionNotes} /><button className="sensor-check" onClick={configure}>Check connections <ArrowRight size={16} /></button></> : <div className="sensor-waiting-actions"><button className="sensor-configure" onClick={configure}><Settings size={17} />Configure sensors</button><button onClick={() => setGuide(v => !v)} aria-expanded={guide}><BookOpen size={17} />Connection guide</button></div>}
    {guide && <div className="sensor-guide"><h3>Connect your sensors</h3><ol><li>Open Settings → Devices, copy <code>devices.json</code>, and restart Adelpha.</li><li>Connect the Raspberry Pi or Arduino bridge. Idle device rows stay idle until that board publishes.</li><li>Publish only the sensors you have. Channels reported missing or omitted stay unavailable; they are never shown as zero.</li></ol><ConnectionNotes notes={connectionNotes} /><button onClick={configure}>Open device settings</button></div>}
  </section>;
}
