import type { ReactNode } from "react";
import "./workspace.css";

export function WorkspaceShell({
  kind,
  label,
  projectName,
  title,
  status,
  actions,
  children,
}: {
  kind: "shim" | "gradient";
  label: string;
  projectName: string;
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`studio-work adelpha-simulation-workspace is-${kind}`} aria-label={label}>
      <header className="ws-project">
        <div>
          <span className="ws-muted">{projectName}</span>
          <span className="ws-slash">/</span>
          <strong>{title}</strong>
        </div>
        <div className="ws-row">
          {status}
          {actions}
        </div>
      </header>
      {children}
    </section>
  );
}

export function ProjectMenu({
  onAssembly,
  onClose,
}: {
  onAssembly?: () => void;
  onClose?: () => void;
}) {
  if (!onAssembly && !onClose) return null;
  return (
    <details className="ws-project-menu">
      <summary aria-label="Project actions">
        Project <span aria-hidden="true">⌄</span>
      </summary>
      <div className="ws-menu">
        {onAssembly ? (
          <button type="button" onClick={onAssembly}>
            View assembly
          </button>
        ) : null}
        {onClose ? (
          <button type="button" onClick={onClose}>
            Close project
          </button>
        ) : null}
      </div>
    </details>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  className,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; name?: string }[];
  className?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className={["ws-seg", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-label={option.name}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function NumericField({
  label,
  unit,
  value,
  min,
  max,
  step,
  name,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  name?: string;
  onChange: (value: number) => void;
}) {
  const accessible = unit ? `${label} (${unit})` : label;
  return (
    <label className="ws-formrow">
      <span>
        {label}
        {unit ? <span className="ws-muted">{unit.startsWith("·") ? ` ${unit}` : ` ${unit}`}</span> : null}
      </span>
      <input
        type="number"
        aria-label={name ?? accessible}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(next);
        }}
      />
    </label>
  );
}

export function Metric({
  label,
  value,
  unit,
  previous,
  warning = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  previous?: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="ws-metric">
      <div className="ws-metric-label">{label}</div>
      <div className={`ws-metric-value${warning ? " is-warning" : ""}`}>
        {previous != null ? <span className="ws-metric-old">{previous} → </span> : null}
        {value}
        {unit ? <span className="ws-metric-unit"> {unit}</span> : null}
      </div>
    </div>
  );
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

export function formatFixed(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
