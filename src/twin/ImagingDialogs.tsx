import { useEffect, useState } from "react";
import { fetchAbout } from "./mri/api";
import { ADELPHA_VERSION } from "./adelphaVersion";
import type { PatientInformation } from "./mri/types";
import { Overlay } from "./ImagingOverlay";

export { Overlay } from "./ImagingOverlay";
export { LogDialog, ConfigDialog, StatusDialog, StudyDialog, FlexDialog } from "./Mri4allWindows";
export type { ViewerTarget } from "./Mri4allWindows";

export const PATIENT_POSITIONS = [
  { code: "HFS", label: "Head-First Supine [HFS]" },
  { code: "HFP", label: "Head-First Prone [HFP]" },
  { code: "HFDL", label: "Head-First Decubitus Left [HFDL]" },
  { code: "HFDR", label: "Head-First Decubitus Right [HFDR]" },
  { code: "FFS", label: "Feet-First Supine [FFS]" },
  { code: "FFP", label: "Feet-First Prone [FFP]" },
  { code: "FFDL", label: "Feet-First Decubitus Left [FFDL]" },
  { code: "FFDR", label: "Feet-First Decubitus Right [FFDR]" },
] as const;

export function RegistrationForm({
  apiOk,
  busy,
  patient,
  acc,
  position,
  problems,
  onPatient,
  onAcc,
  onPosition,
  onPhantom,
  onSubmit,
  onCancel,
}: {
  apiOk: boolean | null;
  busy: boolean;
  patient: PatientInformation;
  acc: string;
  position: string;
  problems: string[];
  onPatient: (next: PatientInformation) => void;
  onAcc: (v: string) => void;
  onPosition: (v: string) => void;
  onPhantom: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const dob = patient.birth_date?.length === 8
    ? `${patient.birth_date.slice(0, 4)}-${patient.birth_date.slice(4, 6)}-${patient.birth_date.slice(6, 8)}`
    : "2000-01-01";
  return (
    <>
      <p className="ic-register-sub">
        {apiOk === false
          ? "MRI4ALL API is not running. Start it with python -m services.api from console/."
          : "Register the patient to start an exam. Same ScanTask fields as MRI4ALL."}
      </p>
      <div className="ic-register-grid">
        <label>
          Last name
          <input value={patient.last_name} onChange={(e) => onPatient({ ...patient, last_name: e.target.value })} />
        </label>
        <label>
          First name
          <input value={patient.first_name} onChange={(e) => onPatient({ ...patient, first_name: e.target.value })} />
        </label>
        <label>
          MRN
          <input value={patient.mrn} onChange={(e) => onPatient({ ...patient, mrn: e.target.value })} />
        </label>
        <label>
          Date of birth
          <input
            type="date"
            value={dob}
            onChange={(e) => onPatient({ ...patient, birth_date: e.target.value.replace(/-/g, "") })}
          />
        </label>
        <label>
          Gender
          <select value={patient.gender} onChange={(e) => onPatient({ ...patient, gender: e.target.value })}>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </label>
        <label>
          Weight (kg)
          <input
            type="number"
            value={patient.weight_kg}
            onChange={(e) => onPatient({ ...patient, weight_kg: Number(e.target.value) })}
          />
        </label>
        <label>
          Height (cm)
          <input
            type="number"
            value={patient.height_cm}
            onChange={(e) => onPatient({ ...patient, height_cm: Number(e.target.value) })}
          />
        </label>
        <label>
          Accession
          <input value={acc} onChange={(e) => onAcc(e.target.value)} />
        </label>
        <label className="ic-register-span">
          Patient position
          <select value={position} onChange={(e) => onPosition(e.target.value)}>
            {PATIENT_POSITIONS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problems.length ? <p className="ic-register-error">{problems.join(" ")}</p> : null}
      <div className="ic-register-actions">
        {onCancel ? (
          <button type="button" className="settings-btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="settings-btn" onClick={onPhantom}>
          Phantom
        </button>
        <button type="button" className="settings-btn settings-btn-accent" onClick={onSubmit} disabled={busy || apiOk !== true}>
          Start exam
        </button>
      </div>
    </>
  );
}

export function QueryDialog({
  request,
  inputType,
  min,
  max,
  onSubmit,
  onClose,
}: {
  request: string;
  inputType: "text" | "int" | "float";
  min: number;
  max: number;
  onSubmit: (value: string | number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(inputType === "text" ? "" : String(min));
  return (
    <Overlay title={request} onClose={onClose}>
      <label className="ic-field">
        <span>Enter {request}</span>
        <input
          type={inputType === "text" ? "text" : "number"}
          min={inputType === "text" ? undefined : min}
          max={inputType === "text" ? undefined : max}
          step={inputType === "float" ? "any" : undefined}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
        />
      </label>
      <div className="ic-register-actions">
        <button type="button" className="settings-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="settings-btn settings-btn-accent"
          onClick={() => onSubmit(inputType === "text" ? val : Number(val))}
        >
          OK
        </button>
      </div>
    </Overlay>
  );
}

export function AlertDialog({
  title,
  message,
  onAck,
}: {
  title: string;
  message: string;
  onAck: () => void;
}) {
  return (
    <Overlay title={title} onClose={onAck}>
      <p className="ic-register-sub">{message}</p>
      <div className="ic-register-actions">
        <button type="button" className="settings-btn settings-btn-accent" onClick={onAck}>
          OK
        </button>
      </div>
    </Overlay>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("Loading…");
  useEffect(() => {
    void fetchAbout()
      .then((a) => setText(`${a.title}\n${a.subtitle}\nVersion ${ADELPHA_VERSION}\n${a.url}\nBase: ${a.base}`))
      .catch((e) => setText(e instanceof Error ? e.message : "Unable to load"));
  }, []);
  return (
    <Overlay title="About MRI4ALL" onClose={onClose}>
      <pre className="ic-log">{text}</pre>
      <p className="ic-register-sub">The Open-Source MRI Software — mri4all.org</p>
    </Overlay>
  );
}

export function DefinitionDialog({ json, onClose }: { json: string; onClose: () => void }) {
  return (
    <Overlay title="Scan definition" onClose={onClose} wide>
      <pre className="ic-log">{json}</pre>
    </Overlay>
  );
}

export function ShimDialog({
  onApply,
  onClose,
  onChange,
}: {
  onApply: (values: { x: number; y: number; z: number }) => void;
  onClose: () => void;
  onChange?: (values: { x: number; y: number; z: number }) => void;
}) {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [z, setZ] = useState(0);
  const push = (next: { x: number; y: number; z: number }) => {
    setX(next.x);
    setY(next.y);
    setZ(next.z);
    onChange?.(next);
  };
  return (
    <Overlay title="Shimming Configuration" onClose={onClose}>
      <label className="ic-field">
        <span>Shim X {x}</span>
        <input type="range" min={-1000} max={1000} value={x} onChange={(e) => push({ x: Number(e.target.value), y, z })} />
      </label>
      <label className="ic-field">
        <span>Shim Y {y}</span>
        <input type="range" min={-1000} max={1000} value={y} onChange={(e) => push({ x, y: Number(e.target.value), z })} />
      </label>
      <label className="ic-field">
        <span>Shim Z {z}</span>
        <input type="range" min={-1000} max={1000} value={z} onChange={(e) => push({ x, y, z: Number(e.target.value) })} />
      </label>
      <div className="ic-register-actions">
        <button type="button" className="settings-btn settings-btn-accent" onClick={() => onApply({ x, y, z })}>
          Apply
        </button>
      </div>
    </Overlay>
  );
}
