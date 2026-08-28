import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Eye,
  Info,
  MousePointerClick,
  RefreshCw,
  Upload,
  WifiOff,
  X,
} from "lucide-react";

import { ADELPHA_VERSION } from "../adelphaVersion";
import {
  selectHiddenParts,
  usePartInspectorStore,
  type PartBinding,
} from "../partInspectorStore";
import {
  SCANNER_MODELS,
  getScannerProfile,
  useScannerModel,
  type ScannerModelId,
  type ScannerModelProfile,
} from "../scannerModel";
import { refreshSensorsBatch, useTwinStore } from "../telemetryStore";
import { requestPartFocus } from "../viewportFocus";
import type { SettingsLaunch } from "../settingsOpen";
import { ComponentBrowser } from "./ComponentBrowser";
import { ComponentInspector } from "./ComponentInspector";
import {
  componentTypes,
  filterComponentRows,
  formatMeasurement,
  useComponentRows,
  useSensorOptions,
  type ComponentRow,
} from "./componentRows";
import {
  Eyebrow,
  Mono,
  OrbitModeRow,
  RangeInput,
  Segmented,
  Select,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SpecList,
  StatusBadge,
  Switch,
  UseModelColorsRow,
  ViewportBgRow,
} from "./controls";
import { FIELD_LAYERS, type FieldLayerId } from "./fieldLayers";
import { MODEL_TABS, readModelTab, writeModelTab, type ModelTabId } from "./modelTabs";
import type { Draft, PatchDraft } from "./draft";

type PanelProps = {
  draft: Draft;
  patch: PatchDraft;
  launch?: SettingsLaunch | null;
  /** Leaving settings is how a viewport action becomes visible. */
  onClose: () => void;
};

function cadFormat(profile: ScannerModelProfile): string {
  if (!profile.cad) return "No CAD assembly";
  const ext = (profile.cad.url.split("?")[0] ?? "").split(".").pop()?.toUpperCase();
  return ext === "STL" ? "STL mesh" : ext === "GLB" ? "glTF binary (GLB)" : (ext ?? "Unknown");
}

export function ModelSettingsPanel({ draft, patch, launch, onClose }: PanelProps) {
  const [tab, setTab] = useState<ModelTabId>(readModelTab);
  const [scannerId, setScannerId] = useScannerModel();
  const profile = getScannerProfile(scannerId);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    writeModelTab(tab);
  }, [tab]);

  // A "Properties" jump from the viewport context menu lands on Components.
  useEffect(() => {
    if (launch?.focusPartId || launch?.openModelLibrary) setTab("components");
  }, [launch]);

  const meta = MODEL_TABS.find((item) => item.id === tab) ?? MODEL_TABS[0];

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = MODEL_TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % MODEL_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + MODEL_TABS.length) % MODEL_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODEL_TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(MODEL_TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const nav = (
    <div className="sw-tabs" role="tablist" aria-label="3D Model settings" onKeyDown={onTabKeyDown}>
      {MODEL_TABS.map((item, index) => {
        const Icon = item.Icon;
        const active = item.id === tab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`sw-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`sw-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            className={`sw-tab${active ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <Icon size={14} strokeWidth={1.8} aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const wide = tab === "components";

  return (
    <SettingsPage title="3D Model" subtitle={meta.summary} nav={nav} wide={wide} fill={wide}>
      <div
        role="tabpanel"
        id={`sw-panel-${tab}`}
        aria-labelledby={`sw-tab-${tab}`}
        tabIndex={-1}
        className="sw-tabpanel"
      >
        {tab === "general" ? (
          <GeneralTab
            draft={draft}
            patch={patch}
            profile={profile}
            scannerId={scannerId}
            onChoose={(id) => {
              setScannerId(id);
              patch("currentModel", id);
            }}
          />
        ) : tab === "components" ? (
          <ComponentsTab scannerId={scannerId} launch={launch} onClose={onClose} />
        ) : tab === "sensors" ? (
          <SensorsTab
            draft={draft}
            patch={patch}
            scannerId={scannerId}
            onOpenComponents={() => setTab("components")}
          />
        ) : tab === "visualization" ? (
          <VisualizationTab draft={draft} patch={patch} />
        ) : tab === "performance" ? (
          <PerformanceTab draft={draft} patch={patch} />
        ) : (
          <FilesTab
            profile={profile}
            scannerId={scannerId}
            onChoose={(id) => {
              setScannerId(id);
              patch("currentModel", id);
            }}
          />
        )}
      </div>
    </SettingsPage>
  );
}

/* —— General —— */

function GeneralTab({
  draft,
  patch,
  profile,
  scannerId,
  onChoose,
}: {
  draft: Draft;
  patch: PatchDraft;
  profile: ScannerModelProfile;
  scannerId: ScannerModelId;
  onChoose: (id: ScannerModelId) => void;
}) {
  const variants = SCANNER_MODELS.filter((model) => model.family === profile.family);
  const families = useMemo(() => {
    const seen = new Map<string, ScannerModelProfile>();
    for (const model of SCANNER_MODELS) {
      if (!seen.has(model.family)) seen.set(model.family, model);
    }
    return [...seen.values()];
  }, []);

  return (
    <>
      <SettingsSection
        title="Active scanner model"
        description="Applied to the Digital Twin viewport and the Imaging Console."
      >
        <div className="sw-model-layout">
          <figure className="sw-model-preview">
            <img src={profile.preview} alt="" />
            <figcaption>
              <span className="sw-model-preview-name">{profile.displayName}</span>
              <span className="sw-model-preview-meta">
                {profile.type} · {profile.field}
              </span>
            </figcaption>
          </figure>
          <div className="sw-model-copy">
            <SettingsRow title="Model variant" layout="stack">
              <Select
                label="Active scanner model"
                value={scannerId}
                onChange={(value) => onChoose(value as ScannerModelId)}
                options={variants.map((model) => ({ value: model.id, label: model.label }))}
              />
            </SettingsRow>
            <SpecList
              items={[
                { label: "Type", value: profile.type },
                { label: "Field strength", value: profile.field, mono: true },
                { label: "Serial number", value: profile.serial, mono: true },
                { label: "CAD source", value: cadFormat(profile) },
                { label: "Software version", value: ADELPHA_VERSION, mono: true },
              ]}
            />
          </div>
          <div className="sw-model-family">
            <Eyebrow>Families</Eyebrow>
            <div className="sw-family-cards" role="group" aria-label="Scanner families">
              {families.map((family) => {
                const active = family.family === profile.family;
                return (
                  <button
                    key={family.family}
                    type="button"
                    className={`sw-family-card${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      if (!active) onChoose(family.id);
                    }}
                  >
                    <img src={family.preview} alt="" />
                    <span className="sw-family-name">{family.type}</span>
                    <span className="sw-family-field">{family.field}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Viewport" description="How the twin stage renders behind the CAD.">
        <ViewportBgRow />
        <UseModelColorsRow />
      </SettingsSection>

      <SettingsSection title="Camera">
        <OrbitModeRow />
      </SettingsSection>

      <SettingsSection title="Environment">
        <SettingsRow
          title="Lighting environment"
          description="Studio lighting preset used when model colors are off."
          hint="Preference only in this build — the twin stage uses fixed studio lights."
        >
          <Select
            compact
            label="Lighting environment"
            value={draft.environment}
            onChange={(value) => patch("environment", value)}
            options={[
              { value: "dark-studio", label: "Dark studio" },
              { value: "lab", label: "Lab ambient" },
              { value: "neutral", label: "Neutral HDR" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

/* —— Components —— */

function ComponentsTab({
  scannerId,
  launch,
  onClose,
}: {
  scannerId: ScannerModelId;
  launch?: SettingsLaunch | null;
  onClose: () => void;
}) {
  const rows = useComponentRows(scannerId);
  const sensors = useSensorOptions();
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  const selected = usePartInspectorStore((s) => s.selected);
  const selectPart = usePartInspectorStore((s) => s.selectPart);
  const clearSelection = usePartInspectorStore((s) => s.clearSelection);
  const patchBinding = usePartInspectorStore((s) => s.patchBinding);
  const hidePart = usePartInspectorStore((s) => s.hidePart);
  const showPart = usePartInspectorStore((s) => s.showPart);
  const isolatePart = usePartInspectorStore((s) => s.isolatePart);
  const showAllParts = usePartInspectorStore((s) => s.showAllParts);
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const setInspectionMode = usePartInspectorStore((s) => s.setInspectionMode);
  const hiddenCount = usePartInspectorStore((s) => selectHiddenParts(s, scannerId).length);
  const profile = getScannerProfile(scannerId);

  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);

  const types = useMemo(() => componentTypes(rows), [rows]);
  const filtered = useMemo(() => filterComponentRows(rows, query, type), [rows, query, type]);
  const selectedRow =
    selected?.scannerId === scannerId
      ? rows.find((row) => row.partId === selected.partId) ?? null
      : null;

  // Same lazy sensor fetch the old model library performed.
  useEffect(() => {
    if ((sensorsBatch?.measurements.length ?? 0) > 0) {
      setLoadingSensors(false);
      return;
    }
    let cancelled = false;
    setLoadingSensors(true);
    setSensorError(null);
    void refreshSensorsBatch().then((batch) => {
      if (cancelled) return;
      setLoadingSensors(false);
      if (!batch) setSensorError("Could not load sensors from Twin API");
    });
    return () => {
      cancelled = true;
      setLoadingSensors(false);
    };
  }, [sensorsBatch?.measurements.length]);

  useEffect(() => {
    const partId = launch?.focusPartId;
    if (!partId) return;
    const part = rows.find((row) => row.partId === partId);
    if (part) selectPart({ partId, cadName: part.cadName, scannerId });
  }, [launch?.focusPartId, rows, scannerId, selectPart]);

  const emptyReason = !profile.cad
    ? `${profile.displayName} has no CAD assembly to configure.`
    : rows.length === 0
      ? "Open the Digital Twin viewport once to discover parts from this scanner’s CAD."
      : null;

  function onFocus(row: ComponentRow) {
    requestPartFocus({ scannerId, partId: row.partId });
    onClose();
  }

  function onToggleVisibility(row: ComponentRow) {
    if (row.hidden) showPart(scannerId, row.partId);
    else hidePart(scannerId, row.partId);
  }

  return (
    <div className="sw-components">
      <div className="sw-components-toolbar">
        <label className="sw-toggle-pill">
          <MousePointerClick size={14} strokeWidth={1.8} aria-hidden />
          <span>Click parts in the viewport</span>
          <Switch
            label="Viewport inspection mode"
            checked={inspectionMode}
            onChange={setInspectionMode}
          />
        </label>
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="settings-btn"
            onClick={() => showAllParts(scannerId)}
            title="Restore every part culled from the viewport"
          >
            <Eye size={14} strokeWidth={1.8} aria-hidden />
            Show all ({hiddenCount} hidden)
          </button>
        ) : null}
      </div>

      <div className={`sw-components-split${selectedRow ? " has-selection" : ""}`}>
        <ComponentBrowser
          rows={filtered}
          totalCount={rows.length}
          types={types}
          query={query}
          onQueryChange={setQuery}
          type={type}
          onTypeChange={setType}
          selectedId={selectedRow?.partId ?? null}
          onSelect={(row) =>
            selectPart({ partId: row.partId, cadName: row.cadName, scannerId })
          }
          onToggleVisibility={onToggleVisibility}
          onFocus={onFocus}
          emptyReason={emptyReason}
        />
        {selectedRow ? (
          <>
            <button
              type="button"
              className="sw-inspector-backdrop"
              aria-label="Close component properties"
              onClick={clearSelection}
            />
            <ComponentInspector
              row={selectedRow}
              scannerId={scannerId}
              sensors={sensors}
              sensorsLoading={loadingSensors}
              sensorsError={sensorError}
              onPatch={(patch: Partial<PartBinding>) =>
                patchBinding(scannerId, selectedRow.partId, patch)
              }
              onFocus={() => onFocus(selectedRow)}
              onIsolate={() => isolatePart(scannerId, selectedRow.partId)}
              onToggleVisibility={() => onToggleVisibility(selectedRow)}
              onClose={clearSelection}
            />
          </>
        ) : rows.length > 0 ? (
          <aside className="sw-inspector is-empty" aria-label="Component properties">
            <Info size={18} strokeWidth={1.7} aria-hidden />
            <p>Select a component to edit its name, sensor, color, and visibility.</p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/* —— Sensors —— */

function SensorsTab({
  draft,
  patch,
  scannerId,
  onOpenComponents,
}: {
  draft: Draft;
  patch: PatchDraft;
  scannerId: ScannerModelId;
  onOpenComponents: () => void;
}) {
  const rows = useComponentRows(scannerId);
  const sensors = useSensorOptions();
  const connection = useTwinStore((s) => s.connection);
  const health = useTwinStore((s) => s.health);
  const sensorsBatch = useTwinStore((s) => s.sensorsBatch);
  const patchBinding = usePartInspectorStore((s) => s.patchBinding);
  const [refreshing, setRefreshing] = useState(false);

  const assigned = rows.filter((row) => row.sensorId);
  const boundIds = new Set(assigned.map((row) => row.sensorId));
  const unbound = sensors.filter((sensor) => !boundIds.has(sensor.id));
  const connected = connection === "connected" && (health?.connected ?? false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshSensorsBatch();
    setRefreshing(false);
  }

  return (
    <>
      <SettingsSection
        title="Twin connection"
        description="Sensor assignments read from the DTAM Twin API measurement batch."
        actions={
          <button
            type="button"
            className="settings-btn"
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            <RefreshCw size={14} strokeWidth={1.8} aria-hidden />
            {refreshing ? "Refreshing…" : "Refresh sensors"}
          </button>
        }
      >
        <div className="sw-status-grid">
          <div className="sw-status-tile">
            <Eyebrow>Twin API</Eyebrow>
            <span className="sw-status-value">
              {connected ? (
                <>
                  <Activity size={15} strokeWidth={1.9} aria-hidden />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff size={15} strokeWidth={1.9} aria-hidden />
                  {connection === "connecting" ? "Connecting" : "Disconnected"}
                </>
              )}
            </span>
            <span className="sw-status-note">
              {health?.scanner_id ? <Mono>{health.scanner_id}</Mono> : "No scanner reported"}
            </span>
          </div>
          <div className="sw-status-tile">
            <Eyebrow>Sensors in batch</Eyebrow>
            <span className="sw-status-value sw-status-number">{sensors.length}</span>
            <span className="sw-status-note">
              {sensorsBatch?.measurements.length ?? 0} measurements
            </span>
          </div>
          <div className="sw-status-tile">
            <Eyebrow>Assigned</Eyebrow>
            <span className="sw-status-value sw-status-number">{assigned.length}</span>
            <span className="sw-status-note">
              of {rows.length} {rows.length === 1 ? "component" : "components"}
            </span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Live telemetry">
        <SettingsRow
          title="Stream live telemetry"
          description="Data source for component readings and sensor overlays. Field visualization is a separate layer."
          hint="Preference only in this build — the Twin API stream is not gated by this switch."
        >
          <Switch
            label="Stream live telemetry"
            checked={draft.liveTelemetry}
            onChange={(value) => patch("liveTelemetry", value)}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Sensor assignments"
        description="Each component may carry one DTAM sensor. Saved with this scanner."
        actions={
          <button type="button" className="settings-btn" onClick={onOpenComponents}>
            Assign in Components
          </button>
        }
      >
        {assigned.length === 0 ? (
          <p className="sw-empty">
            No component has a DTAM sensor yet. Open the Components tab, pick a part, and choose a
            sensor in its properties.
          </p>
        ) : (
          <ul className="sw-assign-list">
            {assigned.map((row) => (
              <li key={row.partId} className={row.sensorStale ? "is-warning" : undefined}>
                <span className="sw-assign-part">
                  <span className="sw-assign-name">{row.displayName}</span>
                  <span className="sw-assign-node">{row.type}</span>
                </span>
                <Mono>{row.sensorId}</Mono>
                <span className="sw-assign-reading">
                  {row.reading ? (
                    <Mono>{formatMeasurement(row.reading)}</Mono>
                  ) : (
                    <span className="sw-cell-warning">No recent sample</span>
                  )}
                </span>
                <button
                  type="button"
                  className="sw-icon-btn"
                  aria-label={`Clear the sensor assigned to ${row.displayName}`}
                  title="Clear assignment"
                  onClick={() => patchBinding(scannerId, row.partId, { sensorId: null })}
                >
                  <X size={15} strokeWidth={1.8} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title="Unassigned sensors"
        description="Reporting to the twin but not bound to a component."
      >
        {unbound.length === 0 ? (
          <p className="sw-empty">
            {sensors.length === 0
              ? "No sensors in the last Twin batch."
              : "Every reporting sensor is bound to a component."}
          </p>
        ) : (
          <ul className="sw-sensor-chips">
            {unbound.map((sensor) => (
              <li key={sensor.id}>
                <Mono>{sensor.id}</Mono>
                {sensor.quantities ? <span>{sensor.quantities}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}

/* —— Visualization —— */

function VisualizationTab({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  const view = useTwinStore((s) => s.view);
  const setView = useTwinStore((s) => s.setView);

  const renderMode = view.hybrid_render ? "hybrid" : view.wireframe ? "wireframe" : "solid";
  const activeLayer: FieldLayerId = view.show_temperature_map
    ? "temperature"
    : ((draft.fieldViz as FieldLayerId) ?? "none");

  function chooseLayer(id: FieldLayerId) {
    if (id === "temperature") {
      setView({ show_temperature_map: true });
      patch("fieldViz", "none");
      return;
    }
    setView({ show_temperature_map: false });
    patch("fieldViz", id);
  }

  return (
    <>
      <SettingsSection title="Render mode" description="Applies to the twin viewport immediately.">
        <SettingsRow
          title="Assembly rendering"
          description="Solid surfaces, solid plus neon edges, or wireframe only."
        >
          <Segmented
            label="Assembly rendering"
            value={renderMode}
            onChange={(value) =>
              setView({
                wireframe: value === "wireframe",
                hybrid_render: value === "hybrid",
              })
            }
            options={[
              { value: "solid", label: "Solid" },
              { value: "hybrid", label: "Hybrid" },
              { value: "wireframe", label: "Wireframe" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Exploded assembly"
          description="Separate assembly parts to see internal hardware."
          layout="stack"
        >
          <RangeInput
            label="Exploded assembly"
            min={0}
            max={1}
            step={0.01}
            value={view.exploded}
            onChange={(value) => setView({ exploded: value })}
            readout={`${Math.round(view.exploded * 100)}%`}
          />
        </SettingsRow>
        <SettingsRow
          title="Show internal components"
          description="Reveal magnet, gradients, RF coils, and electronics."
          hint="Preference only in this build. Use Exploded assembly or per-part visibility for internals today."
        >
          <Switch
            label="Show internal components"
            checked={draft.showInternal}
            onChange={(value) => patch("showInternal", value)}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Telemetry overlays"
        description="Sensor overlays draw the telemetry stream onto the assembly."
      >
        <SettingsRow
          title="Live telemetry"
          description="Data source for sensor overlays. Field visualization is a separate layer."
          hint="Preference only in this build — the Twin API stream is not gated by this switch."
        >
          <Switch
            label="Live telemetry"
            checked={draft.liveTelemetry}
            onChange={(value) => patch("liveTelemetry", value)}
          />
        </SettingsRow>
        <SettingsRow
          title="Sensor overlays"
          description="Pin sensor values to the components they are bound to."
          disabled={!draft.liveTelemetry}
          hint={
            draft.liveTelemetry
              ? "Preference only in this build — bound values appear in Components and Sensors, not as viewport pins yet."
              : "Turn on Live telemetry first — overlays have no data source without it."
          }
        >
          <Switch
            label="Sensor overlays"
            checked={draft.sensorOverlays && draft.liveTelemetry}
            disabled={!draft.liveTelemetry}
            onChange={(value) => patch("sensorOverlays", value)}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Field visualization"
        description="A separate visualization layer from sensor overlays. One quantity at a time, mapped onto the assembly surface."
      >
        <div className="sw-layers" role="radiogroup" aria-label="Field visualization layer">
          {FIELD_LAYERS.map((layer) => {
            const planned = layer.binding === "planned";
            const active = layer.id === activeLayer;
            return (
              <button
                key={layer.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={planned}
                title={
                  planned
                    ? "Not available yet: the twin scene has no mesh for this quantity."
                    : layer.description
                }
                className={`sw-layer${active ? " is-active" : ""}`}
                onClick={() => chooseLayer(layer.id)}
              >
                <span className="sw-layer-head">
                  <span className="sw-layer-name">{layer.label}</span>
                  {layer.quantity ? <Mono>{layer.quantity}</Mono> : null}
                  {layer.binding === "scene" && layer.id !== "none" ? (
                    <StatusBadge tone="live">Live</StatusBadge>
                  ) : layer.binding === "draft" ? (
                    <StatusBadge tone="sim" title="Stored as a preference; no scene mesh yet">
                      Preview
                    </StatusBadge>
                  ) : planned ? (
                    <StatusBadge tone="idle">Planned</StatusBadge>
                  ) : null}
                </span>
                <span className="sw-layer-desc">{layer.description}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>
    </>
  );
}

/* —— Performance —— */

function PerformanceTab({ draft, patch }: { draft: Draft; patch: PatchDraft }) {
  return (
    <>
      <SettingsSection
        title="Rendering quality"
        description="Trade frame rate against material and geometry fidelity."
      >
        <SettingsRow title="Quality preset">
          <Segmented
            label="Rendering quality preset"
            value={draft.renderQuality}
            onChange={(value) => patch("renderQuality", value)}
            options={[
              { value: "performance", label: "Performance", title: "Lowest GPU cost" },
              { value: "balanced", label: "Balanced", title: "Default" },
              { value: "ultra", label: "Ultra", title: "Highest fidelity" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Physically based materials"
          description="Metalness and roughness response on CAD surfaces."
        >
          <Switch
            label="Physically based materials"
            checked={draft.pbrMaterials}
            onChange={(value) => patch("pbrMaterials", value)}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Live rendering settings">
        <p className="sw-note">
          <Info size={14} strokeWidth={1.8} aria-hidden />
          Quality and material presets are stored as local preferences; the twin viewport renders at
          a fixed quality in this build. Render mode, exploded view, and field layers under
          Visualization apply to the scene immediately.
        </p>
      </SettingsSection>
    </>
  );
}

/* —— Files —— */

function FilesTab({
  profile,
  scannerId,
  onChoose,
}: {
  profile: ScannerModelProfile;
  scannerId: ScannerModelId;
  onChoose: (id: ScannerModelId) => void;
}) {
  const cad = profile.cad;

  return (
    <>
      <SettingsSection
        title="Active model source"
        description={`CAD assembly loaded for ${profile.displayName}.`}
      >
        {cad ? (
          <SpecList
            items={[
              { label: "File", value: cad.url, mono: true },
              { label: "Format", value: cadFormat(profile) },
              { label: "Uniform scale", value: cad.scale.toPrecision(4), mono: true },
              { label: "Rotation (deg)", value: cad.rotationDeg.join(", "), mono: true },
              {
                label: "Exploded view",
                value: cad.explodeParts ? "Per assembly child" : "Whole assembly",
              },
            ]}
          />
        ) : (
          <p className="sw-empty">
            This scanner profile ships without a CAD assembly, so the viewport renders the symbolic
            twin instead.
          </p>
        )}
      </SettingsSection>

      <SettingsSection title="Import">
        <SettingsRow
          title="Import custom model"
          description="GLB, glTF, FBX, OBJ, or STEP"
          disabled
          hint="Not available in this build: Adelpha loads CAD from bundled scanner profiles only."
        >
          <button type="button" className="settings-btn" disabled title="Not available yet">
            <Upload size={14} strokeWidth={1.8} aria-hidden />
            Choose file
          </button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Installed scanner models"
        description="Every profile bundled with this build."
      >
        <ul className="sw-library">
          {SCANNER_MODELS.map((model) => {
            const active = model.id === scannerId;
            return (
              <li key={model.id} className={active ? "is-active" : undefined}>
                <img src={model.preview} alt="" />
                <span className="sw-library-copy">
                  <span className="sw-library-name">{model.displayName}</span>
                  <span className="sw-library-meta">
                    {model.type} · {model.field} · {cadFormat(model)}
                  </span>
                  <Mono>{model.id}</Mono>
                </span>
                {active ? (
                  <StatusBadge tone="live">Active</StatusBadge>
                ) : (
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => onChoose(model.id)}
                  >
                    Set active
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </>
  );
}
