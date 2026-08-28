import { useId, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import { useConsoleTheme } from "../consoleTheme";
import { useModelColors } from "../useModelColors";
import { useOrbitMode } from "../orbitMode";
import { VIEWPORT_BG_PRESETS, useViewportBg } from "../viewportBg";

/**
 * Shared settings primitives. Every settings panel renders through these so
 * spacing, typography, and focus behaviour stay identical across sections.
 */

/**
 * One settings destination: a fixed heading block, an independently scrolling
 * body constrained to a readable width, and a stable status footer. The heading
 * sits outside the scroll container, so content can never slide under it.
 */
export function SettingsPage({
  title,
  subtitle,
  nav,
  footer,
  wide = false,
  fill = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** Optional sub-navigation rendered under the title, inside the fixed head. */
  nav?: ReactNode;
  footer?: ReactNode;
  /** Let the body use the full workspace width (component browser + inspector). */
  wide?: boolean;
  /**
   * Body fills the workspace height and scrolls internally instead of scrolling
   * the page. Used by the component browser so the table owns the only scrollbar.
   */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`settings-page${fill ? " is-fill" : ""}`}>
      <header className="settings-page-head">
        <div className={`settings-page-head-inner${wide ? " is-wide" : ""}`}>
          <h3 className="settings-page-title">{title}</h3>
          <p className="settings-page-sub">{subtitle}</p>
        </div>
        {nav ? (
          <div className={`settings-page-nav${wide ? " is-wide" : ""}`}>{nav}</div>
        ) : null}
      </header>
      <div className="settings-page-scroll">
        <div className={`settings-page-content${wide ? " is-wide" : ""}`}>{children}</div>
      </div>
      <footer className="settings-page-foot">
        <div className={`settings-page-foot-inner${wide ? " is-wide" : ""}`}>
          {footer ?? (
            <span className="settings-autosave">
              <Check size={13} strokeWidth={2.4} aria-hidden />
              Changes save automatically
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="settings-block" aria-labelledby={headingId}>
      <header className="settings-block-head">
        <div className="settings-block-copy">
          <h4 id={headingId} className="settings-block-title">
            {title}
          </h4>
          {description ? <p className="settings-block-desc">{description}</p> : null}
        </div>
        {actions ? <div className="settings-block-actions">{actions}</div> : null}
      </header>
      <div className="settings-block-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  hint,
  layout = "inline",
  disabled = false,
  children,
}: {
  title: string;
  description?: string;
  /** Explains a dependency, e.g. why this control is currently unavailable. */
  hint?: ReactNode;
  layout?: "inline" | "stack";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`settings-row${layout === "stack" ? " is-stack" : ""}${
        disabled ? " is-disabled" : ""
      }`}
    >
      <div className="settings-row-copy">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
        {hint ? <div className="settings-row-hint">{hint}</div> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/** Uppercase category label. Reserved for small navigation-style headings. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="settings-eyebrow">{children}</span>;
}

/** Identifiers, CAD nodes, coordinates, and field values. */
export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="settings-mono" title={title}>
      {children}
    </span>
  );
}

export type BadgeTone = "live" | "sim" | "idle" | "warning" | "fault" | "ai";

export function StatusBadge({
  tone,
  children,
  title,
}: {
  tone: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`settings-badge is-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Required: the visible row title is not programmatically associated. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="settings-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-ui" aria-hidden />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`settings-select-wrap${compact ? " is-compact" : ""}`}>
      <select
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; title?: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="settings-segment" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          className={opt.value === value ? "is-active" : undefined}
          aria-pressed={opt.value === value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <input
      className="settings-input"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function RangeInput({
  value,
  onChange,
  label,
  min,
  max,
  step,
  readout,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min: number;
  max: number;
  step: number;
  readout: string;
}) {
  return (
    <span className="settings-range">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <Mono>{readout}</Mono>
    </span>
  );
}

/** Definition list used for read-only technical metadata. */
export function SpecList({
  items,
}: {
  items: { label: string; value: ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className="settings-specs">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.mono ? <Mono>{item.value}</Mono> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* —— Rows shared by the Digital Twin and 3D Model panels —— */

export function OrbitModeRow() {
  const [mode, setMode] = useOrbitMode();
  return (
    <SettingsRow
      title="Camera rotation"
      description="Free orbit in all directions, or side-to-side only. Pan and recenter work in both."
    >
      <Segmented
        label="Camera rotation"
        value={mode}
        onChange={setMode}
        options={[
          { value: "free", label: "Free" },
          { value: "turntable", label: "Side to side" },
        ]}
      />
    </SettingsRow>
  );
}

export function UseModelColorsRow() {
  const [enabled, setEnabled] = useModelColors();
  return (
    <SettingsRow
      title="Use model colors"
      description="Show colors and textures from the CAD file. Off keeps the studio look."
    >
      <Switch label="Use model colors" checked={enabled} onChange={setEnabled} />
    </SettingsRow>
  );
}

export function ViewportBgRow() {
  const [color, setColor] = useViewportBg();
  return (
    <SettingsRow
      title="Background color"
      description="Change the twin viewport behind the CAD."
      layout="stack"
    >
      <div className="settings-viewport-bg">
        <div
          className="settings-viewport-swatches"
          role="group"
          aria-label="Viewport background presets"
        >
          {VIEWPORT_BG_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`settings-viewport-swatch${color === preset.color ? " is-active" : ""}`}
              style={{ background: preset.color }}
              aria-label={preset.label}
              aria-pressed={color === preset.color}
              title={preset.label}
              onClick={() => setColor(preset.color)}
            />
          ))}
        </div>
        <label className="settings-viewport-custom">
          <span>Custom</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Custom viewport background"
          />
        </label>
        <Mono>{color}</Mono>
      </div>
    </SettingsRow>
  );
}

export function ConsoleThemeRow() {
  const [consoleTheme, setTheme] = useConsoleTheme();
  return (
    <SettingsRow
      title="Console theme"
      description="Adelpha violet, or the legacy MRI4ALL navy and gold."
    >
      <Segmented
        label="Console theme"
        value={consoleTheme}
        onChange={setTheme}
        options={[
          { value: "adelpha", label: "Adelpha" },
          { value: "mri4all", label: "MRI4ALL" },
        ]}
      />
    </SettingsRow>
  );
}
