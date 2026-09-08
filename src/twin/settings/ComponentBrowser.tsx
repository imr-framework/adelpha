import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { Crosshair, Eye, EyeOff, Search, SlidersHorizontal } from "lucide-react";

import { iconForType } from "./componentIcons";
import { formatMeasurement, type ComponentRow } from "./componentRows";
import { Mono } from "./controls";
import type { SelectMode } from "../partInspectorStore";

const ROW_HEIGHT = 46;
/** Below this many parts the DOM cost is trivial, so skip windowing. */
const VIRTUAL_THRESHOLD = 80;
const OVERSCAN = 6;

/** Fixed-height row windowing, so a multi-thousand-part assembly stays smooth. */
function useRowWindow(total: number, enabled: boolean) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: total });

  useEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) {
      setRange({ start: 0, end: total });
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const first = Math.floor(el.scrollTop / ROW_HEIGHT);
      const visible = Math.ceil(el.clientHeight / ROW_HEIGHT);
      setRange({
        start: Math.max(0, first - OVERSCAN),
        end: Math.min(total, first + visible + OVERSCAN),
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [enabled, total]);

  return { scrollRef, range };
}

export function ComponentBrowser({
  rows,
  totalCount,
  types,
  query,
  onQueryChange,
  type,
  onTypeChange,
  selectedId,
  selectedIds,
  onSelect,
  onToggleAll,
  onToggleVisibility,
  onFocus,
  emptyReason,
}: {
  rows: ComponentRow[];
  totalCount: number;
  types: string[];
  query: string;
  onQueryChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  selectedId: string | null;
  selectedIds: string[];
  onSelect: (row: ComponentRow, mode: SelectMode | "range") => void;
  onToggleAll: (on: boolean) => void;
  onToggleVisibility: (row: ComponentRow) => void;
  onFocus: (row: ComponentRow) => void;
  /** Shown when the scanner has no discoverable parts at all. */
  emptyReason: string | null;
}) {
  const virtualize = rows.length > VIRTUAL_THRESHOLD;
  const { scrollRef, range } = useRowWindow(rows.length, virtualize);
  const windowed = useMemo(
    () => (virtualize ? rows.slice(range.start, range.end) : rows),
    [virtualize, rows, range.start, range.end],
  );
  const padTop = virtualize ? range.start * ROW_HEIGHT : 0;
  const padBottom = virtualize ? Math.max(0, (rows.length - range.end) * ROW_HEIGHT) : 0;
  const activeId = selectedId ?? rows[0]?.partId ?? null;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedSet.has(row.partId));
  const someVisibleSelected = rows.some((row) => selectedSet.has(row.partId));

  const caretIdRef = useRef<string | null>(null);
  if (selectedId && caretIdRef.current !== selectedId && selectedIds.length <= 1) {
    caretIdRef.current = selectedId;
  }

  function clickMode(event: MouseEvent): SelectMode | "range" {
    if (event.shiftKey) return "range";
    if (event.metaKey || event.ctrlKey) return "toggle";
    return "replace";
  }

  function focusList() {
    scrollRef.current?.focus({ preventScroll: true });
  }

  function revealRow(partId: string) {
    const node = scrollRef.current?.querySelector(
      `[data-part-id="${CSS.escape(partId)}"]`,
    ) as HTMLElement | null;
    node?.scrollIntoView({ block: "nearest" });
  }

  useEffect(() => {
    if (!selectedId || selectedIds.length > 1) return;
    if (scrollRef.current?.contains(document.activeElement)) return;
    revealRow(selectedId);
  }, [selectedId, selectedIds.length]);

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("thead, input, textarea, select")) return;

    if ((event.key === "a" || event.key === "A") && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onToggleAll(true);
      return;
    }

    const step =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? "home"
            : event.key === "End"
              ? "end"
              : null;
    if (step === null) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    if (rows.length === 0) return;
    const fromId = caretIdRef.current ?? selectedId ?? rows[0].partId;
    const index = Math.max(0, rows.findIndex((row) => row.partId === fromId));
    const nextIndex =
      step === "home" ? 0 : step === "end" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, index + step));
    const next = rows[nextIndex];
    if (!next || (next.partId === fromId && (step === 1 || step === -1))) return;

    caretIdRef.current = next.partId;
    onSelect(next, event.shiftKey ? "range" : "replace");
    revealRow(next.partId);
  }

  function toggleRow(row: ComponentRow, event: { preventDefault(): void; stopPropagation(): void }) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(row, "toggle");
    caretIdRef.current = row.partId;
    focusList();
  }

  return (
    <div className="sw-browser">
      <div className="sw-browser-bar">
        <label className="sw-search">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="Search name, CAD node, type, or sensor"
            aria-label="Search components"
            autoComplete="off"
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
        {types.length > 1 ? (
          <div className="settings-select-wrap is-compact sw-type-filter">
            <select
              value={type}
              aria-label="Filter by component type"
              onChange={(e) => onTypeChange(e.target.value)}
            >
              <option value="all">All types</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden />
          </div>
        ) : null}
        <span className="sw-browser-count" aria-live="polite">
          {selectedIds.length > 0
            ? `${selectedIds.length} selected`
            : rows.length === totalCount
              ? `${totalCount} ${totalCount === 1 ? "part" : "parts"}`
              : `${rows.length} of ${totalCount}`}
        </span>
      </div>

      {emptyReason ? (
        <p className="sw-empty">{emptyReason}</p>
      ) : rows.length === 0 ? (
        <p className="sw-empty">
          No component matches “{query.trim()}”
          {type === "all" ? "" : ` in ${type}`}.
        </p>
      ) : (
        <div
          className="sw-table-scroll"
          ref={scrollRef}
          tabIndex={0}
          aria-label="Scanner components"
          onKeyDown={onListKeyDown}
        >
          <table className="sw-table">
            <caption className="sw-visually-hidden">
              Shift+Arrow extends the selection one row at a time. Checkboxes add or remove a part.
              Command or Control+A selects every visible row.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sw-col-check">
                  <input
                    type="checkbox"
                    className="sw-check"
                    checked={allVisibleSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    aria-label={allVisibleSelected ? "Deselect visible parts" : "Select visible parts"}
                    onChange={(event) => onToggleAll(event.currentTarget.checked)}
                  />
                </th>
                <th scope="col">Component</th>
                <th scope="col">Type</th>
                <th scope="col">Sensor</th>
                <th scope="col">State</th>
                <th scope="col" className="sw-col-center">
                  Shown
                </th>
                <th scope="col" className="sw-col-center">
                  <span className="sw-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {padTop > 0 ? (
                <tr aria-hidden className="sw-spacer" style={{ height: padTop }} />
              ) : null}
              {windowed.map((row) => {
                const Icon = iconForType(row.type);
                const selected = selectedSet.has(row.partId);
                const active = row.partId === activeId;
                return (
                  <tr
                    key={row.partId}
                    id={`sw-row-${row.partId}`}
                    data-part-id={row.partId}
                    role="row"
                    aria-selected={selected}
                    className={`sw-row${selected ? " is-selected" : ""}${
                      active ? " is-caret" : ""
                    }${row.hidden ? " is-hidden-part" : ""}${row.sensorStale ? " is-warning" : ""}${
                      row.sensorDisconnected ? " is-disconnected" : ""
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest(".sw-icon-btn, .sw-col-check")) return;
                      caretIdRef.current = row.partId;
                      onSelect(row, clickMode(event));
                      focusList();
                    }}
                  >
                    <td
                      className="sw-col-check"
                      onPointerDown={(event) => {
                        toggleRow(row, event);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="sw-check"
                        checked={selected}
                        tabIndex={-1}
                        readOnly
                        aria-label={`Select ${row.displayName}`}
                      />
                    </td>
                    <td>
                      <span className="sw-row-select">
                        <span
                          className="sw-row-chip"
                          style={
                            { "--part-color": row.colorHex ?? "transparent" } as CSSProperties
                          }
                          aria-hidden
                        >
                          <Icon size={14} strokeWidth={1.7} />
                        </span>
                        <span className="sw-row-names">
                          <span className="sw-row-name">{row.displayName}</span>
                          <span className="sw-row-node">
                            {row.materialLabel ? `${row.materialLabel} · ` : ""}
                            {row.cadName}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="sw-cell-muted">{row.type}</td>
                    <td>
                      {row.sensorId ? (
                        <Mono title={row.sensorId}>{row.sensorId}</Mono>
                      ) : (
                        <span className="sw-cell-empty" aria-label="No sensor assigned">
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      {row.reading ? (
                        <span className="sw-cell-telemetry">
                          <Mono>{formatMeasurement(row.reading)}</Mono>
                          <span className="sw-cell-quantity">{row.reading.quantity}</span>
                        </span>
                      ) : row.sensorStale ? (
                        <span className="sw-cell-warning">No recent sample</span>
                      ) : row.inSimulation ? (
                        <span className="sw-cell-muted">In simulation</span>
                      ) : (
                        <span className="sw-cell-empty">—</span>
                      )}
                    </td>
                    <td className="sw-col-center">
                      <button
                        type="button"
                        className="sw-icon-btn"
                        tabIndex={-1}
                        aria-label={`${row.hidden ? "Show" : "Hide"} ${row.displayName} in the viewport`}
                        aria-pressed={!row.hidden}
                        title={row.hidden ? "Show in viewport" : "Hide in viewport"}
                        onClick={() => onToggleVisibility(row)}
                      >
                        {row.hidden ? (
                          <EyeOff size={15} strokeWidth={1.7} aria-hidden />
                        ) : (
                          <Eye size={15} strokeWidth={1.7} aria-hidden />
                        )}
                      </button>
                    </td>
                    <td className="sw-col-center">
                      <button
                        type="button"
                        className="sw-icon-btn"
                        tabIndex={-1}
                        aria-label={`Frame ${row.displayName} in the viewport`}
                        title="Frame in viewport (closes settings)"
                        onClick={() => onFocus(row)}
                      >
                        <Crosshair size={15} strokeWidth={1.7} aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {padBottom > 0 ? (
                <tr aria-hidden className="sw-spacer" style={{ height: padBottom }} />
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
