import { useState } from "react";
import {
  Atom,
  Check,
  LayoutGrid,
  List,
  LogOut,
  Square,
  Wrench,
  X,
} from "lucide-react";

type SeqTab = "sequence" | "adjustments" | "system" | "processing" | "other";

type SequenceItem = {
  id: string;
  index: number;
  name: string;
  done?: boolean;
};

/** Shown in the topbar hamburger while Imaging Console is active. */
export const IMAGING_CONSOLE_MENU = ["Exam", "Control", "Help", "Debug"] as const;

const SEQUENCES: SequenceItem[] = [
  { id: "18", index: 18, name: "RF Spin-Echo", done: true },
  { id: "19", index: 19, name: "3D Turbo Spin-Echo", done: true },
  { id: "20", index: 20, name: "2D Turbo Spin-Echo", done: true },
  { id: "21", index: 21, name: "Gradient Echo", done: true },
  { id: "23", index: 23, name: "Localizer", done: true },
  { id: "25", index: 25, name: "T2 FLAIR", done: true },
  { id: "27", index: 27, name: "B0 Map", done: true },
  { id: "28", index: 28, name: "3D Turbo Spin-Echo" },
  { id: "29", index: 29, name: "RF Spin-Echo" },
  { id: "30", index: 30, name: "Proton Density" },
  { id: "31", index: 31, name: "Inversion Recovery" },
];

const TABS: { id: SeqTab; label: string }[] = [
  { id: "sequence", label: "SEQUENCE" },
  { id: "adjustments", label: "ADJUSTMENTS" },
  { id: "system", label: "SYSTEM" },
  { id: "processing", label: "PROCESSING" },
  { id: "other", label: "OTHER" },
];

const SEQUENCE_FIELDS_LEFT = [
  { key: "te", label: "TE", value: "20", unit: "ms" },
  { key: "tr", label: "TR", value: "500", unit: "ms" },
  { key: "etl", label: "ETL", value: "1", unit: "" },
  { key: "averages", label: "Averages", value: "1", unit: "" },
] as const;

const SEQUENCE_FIELDS_RIGHT = [
  { key: "orientation", label: "Orientation", value: "Axial", unit: "" },
  { key: "fov", label: "FOV", value: "15", unit: "" },
  { key: "slices", label: "Slices", value: "16", unit: "" },
  { key: "baseRes", label: "Base Resolution", value: "384", unit: "" },
  { key: "bw", label: "BW", value: "62000", unit: "" },
  { key: "trajectory", label: "Trajectory", value: "Cartesian", unit: "" },
  { key: "ordering", label: "Ordering", value: "center_out", unit: "" },
] as const;

export function ImagingConsole() {
  const [activeSeq, setActiveSeq] = useState("28");
  const [tab, setTab] = useState<SeqTab>("sequence");
  const [plotTiming, setPlotTiming] = useState(false);
  /** Titles and viewer chrome appear only while a scan experiment is running. */
  const [experimentActive] = useState(false);

  const active = SEQUENCES.find((s) => s.id === activeSeq) ?? SEQUENCES[10]!;

  return (
    <section className="imaging-console" aria-label="Imaging Console">
      <div className="ic-screens">
        <article className="ic-screen">
          {experimentActive ? <header className="ic-screen-title">Image</header> : null}
          <div
            className="ic-viewer-stage"
            aria-label={experimentActive ? "Image viewer" : "Image viewer idle"}
          >
            {/* Imaging data renders here once a scan is acquired. */}
          </div>
        </article>

        <article className="ic-screen">
          {experimentActive ? <header className="ic-screen-title">ADC Signal</header> : null}
          <div
            className="ic-viewer-stage"
            aria-label={experimentActive ? "ADC signal view" : "ADC signal view idle"}
          >
            {/* ADC / signal data renders here during a scan experiment. */}
          </div>
        </article>

        <article className="ic-screen">
          {experimentActive ? (
            <header className="ic-screen-title">Sequence Timing</header>
          ) : null}
          <div
            className="ic-viewer-stage"
            aria-label={experimentActive ? "Sequence timing view" : "Sequence timing view idle"}
          >
            {/* Sequence timing plots render here during a scan experiment. */}
          </div>
        </article>
      </div>

      <div className="ic-lower">
        <aside className="ic-seq-list" aria-label="Sequence list">
          <ul>
            {SEQUENCES.map((s) => {
              const selected = s.id === activeSeq;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`ic-seq-item${selected ? " is-selected" : ""}`}
                    onClick={() => setActiveSeq(s.id)}
                  >
                    <span className="ic-seq-name">
                      {s.index}. {s.name}
                    </span>
                    <span className="ic-seq-icons">
                      {selected ? <Wrench size={14} strokeWidth={1.75} aria-hidden /> : null}
                      {s.done ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ic-seq-footer">
            <button type="button" aria-label="Confirm" title="Confirm">
              <Check size={16} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Cancel" title="Cancel">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </aside>

        <div className="ic-config">
          <div className="ic-config-meta">
            <span>Phantom, 426 &nbsp; MRN: D034C25A</span>
            <span className="ic-config-meta-center">
              TA: 0:51:14 sec &nbsp;|&nbsp; Voxel Size: 0.39 × 0.39 × 9.38 mm
            </span>
            <span className="ic-config-meta-right">
              {active.index}. {active.name}
            </span>
          </div>

          <div className="ic-tabs" role="tablist" aria-label="Sequence parameters">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`ic-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ic-tab-panel" role="tabpanel">
            {tab === "sequence" ? (
              <>
                <div className="ic-form-grid">
                  <div className="ic-form-col">
                    {SEQUENCE_FIELDS_LEFT.map((f) => (
                      <label key={f.key} className="ic-field">
                        <span>{f.label}</span>
                        <span className="ic-field-control">
                          <input type="text" defaultValue={f.value} />
                          {f.unit ? <em>{f.unit}</em> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="ic-form-col">
                    {SEQUENCE_FIELDS_RIGHT.map((f) => (
                      <label key={f.key} className="ic-field">
                        <span>{f.label}</span>
                        <span className="ic-field-control">
                          <input type="text" defaultValue={f.value} />
                          {f.unit ? <em>{f.unit}</em> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="ic-check">
                  <input
                    type="checkbox"
                    checked={plotTiming}
                    onChange={(e) => setPlotTiming(e.target.checked)}
                  />
                  Plot Sequence Timing
                </label>
              </>
            ) : (
              <p className="ic-tab-placeholder">
                {TABS.find((t) => t.id === tab)?.label} parameters for this sequence will appear here.
              </p>
            )}
          </div>
        </div>

        <aside className="ic-rail" aria-label="Console tools">
          <button type="button" title="Scanner" aria-label="Scanner">
            <Atom size={22} strokeWidth={1.5} />
          </button>
          <button type="button" title="Viewport" aria-label="Viewport">
            <Square size={20} strokeWidth={1.5} />
          </button>
          <button type="button" title="Protocols" aria-label="Protocols" className="is-active">
            <List size={20} strokeWidth={1.5} />
          </button>
          <button type="button" title="Layout" aria-label="Layout">
            <LayoutGrid size={20} strokeWidth={1.5} />
          </button>
          <div className="ic-rail-spacer" />
          <button type="button" title="Exit console" aria-label="Exit console">
            <LogOut size={20} strokeWidth={1.5} />
          </button>
        </aside>
      </div>

      <footer className="ic-status">
        <span>Scanner ready</span>
      </footer>
    </section>
  );
}
