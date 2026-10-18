import { Overlay } from "../ImagingOverlay";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  cloneGeometry,
  mri1Geometry,
  parseRingIds,
  type HalbachGeometry,
  type HalbachRingSpec,
  type HalbachSliceSpec,
} from "./mri1Geometry";

function nextRingId(rings: HalbachRingSpec[]) {
  const used = new Set(rings.map((ring) => ring.id));
  let id = 0;
  while (used.has(id)) id += 1;
  return id;
}

export function HalbachGeometryDialog({
  geometry,
  magnetMm,
  brT,
  mur,
  onCancel,
  onApply,
}: {
  geometry: HalbachGeometry;
  magnetMm: number;
  brT: number;
  mur: number;
  onCancel: () => void;
  onApply: (next: { geometry: HalbachGeometry; magnet_mm: number; br_t: number; mur: number }) => void;
}) {
  const [draft, setDraft] = useState(() => cloneGeometry(geometry));
  const [magnet, setMagnet] = useState(magnetMm);
  const [br, setBr] = useState(brT);
  const [mu, setMu] = useState(mur);
  const [error, setError] = useState("");
  const ringIds = useMemo(() => draft.rings.map((ring) => ring.id).join(", "), [draft.rings]);

  function patch(next: Partial<HalbachGeometry>) {
    setDraft((current) => ({ ...current, ...next }));
    setError("");
  }

  function patchRing(index: number, next: Partial<HalbachRingSpec>) {
    setDraft((current) => ({
      ...current,
      rings: current.rings.map((ring, ringIndex) => (ringIndex === index ? { ...ring, ...next } : ring)),
    }));
    setError("");
  }

  function patchSlice(index: number, next: Partial<HalbachSliceSpec>) {
    setDraft((current) => ({
      ...current,
      slices: current.slices.map((slice, sliceIndex) => (sliceIndex === index ? { ...slice, ...next } : slice)),
    }));
    setError("");
  }

  function apply() {
    if (!draft.rings.length || !draft.slices.length) {
      setError("Add at least one ring definition and one slice plate.");
      return;
    }
    const ids = draft.rings.map((ring) => ring.id);
    if (new Set(ids).size !== ids.length) {
      setError("Ring ids must be unique.");
      return;
    }
    if (draft.slices.some((slice) => !slice.rings.length)) {
      setError("Each slice plate needs at least one ring id.");
      return;
    }
    const known = new Set(draft.rings.map((ring) => ring.id));
    const missing = draft.slices.flatMap((slice) => slice.rings).find((id) => !known.has(id));
    if (missing != null) {
      setError(`Slice plates reference unknown ring id ${missing}. Known ids: ${ringIds}.`);
      return;
    }
    onApply({ geometry: cloneGeometry(draft), magnet_mm: magnet, br_t: br, mur: mu });
  }

  return createPortal(
    <Overlay
      title="Halbach geometry"
      wide
      onClose={onCancel}
      footer={
        <div className="ic-register-actions" style={{ marginTop: 0 }}>
          <button type="button" className="settings-btn" onClick={() => { setDraft(mri1Geometry()); setMagnet(12); setBr(1.3); setMu(1); setError(""); }}>
            Load O'Reilly 27 cm
          </button>
          <button type="button" className="settings-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="settings-btn settings-btn-accent" onClick={apply}>
            Apply geometry
          </button>
        </div>
      }
    >
      <p className="ic-register-sub">
        Lengths in millimetres, matching HalbachMRIDesigner JSON. Ring ids on each slice pick from the ring catalog. Mirror copies every non-zero plate to −z.
      </p>
      <div className="ic-register-grid">
        <label>
          Cube size · mm
          <input type="number" min={4} max={40} step={0.5} value={magnet} onChange={(event) => setMagnet(Number(event.target.value))} />
        </label>
        <label>
          Remanence · T
          <input type="number" min={0.4} max={1.6} step={0.05} value={br} onChange={(event) => setBr(Number(event.target.value))} />
        </label>
        <label>
          Relative permeability
          <input type="number" min={1} max={1.2} step={0.01} value={mu} onChange={(event) => setMu(Number(event.target.value))} />
        </label>
        <label className="ws-row" style={{ alignItems: "center", paddingTop: 18 }}>
          <input type="checkbox" checked={draft.mirrorSlices} onChange={(event) => patch({ mirrorSlices: event.target.checked })} />
          Mirror slices about z = 0
        </label>
        <label>
          Stand width · mm
          <input type="number" min={0} max={500} step={1} value={draft.standWidth} onChange={(event) => patch({ standWidth: Number(event.target.value) })} />
        </label>
        <label>
          Stand height · mm
          <input type="number" min={0} max={500} step={1} value={draft.standHeight} onChange={(event) => patch({ standHeight: Number(event.target.value) })} />
        </label>
        <label>
          Connection rods
          <input type="number" min={0} max={24} step={1} value={draft.numConnectionRods} onChange={(event) => patch({ numConnectionRods: Number(event.target.value) })} />
        </label>
        <label>
          Rod radius · mm
          <input type="number" min={40} max={400} step={1} value={draft.connectionRodsArcRadius} onChange={(event) => patch({ connectionRodsArcRadius: Number(event.target.value) })} />
        </label>
        <label>
          Rod diameter · mm
          <input type="number" min={2} max={16} step={0.5} value={draft.connectionRodsDiameter} onChange={(event) => patch({ connectionRodsDiameter: Number(event.target.value) })} />
        </label>
        <label>
          Shim tray height · mm
          <input type="number" min={0} max={40} step={1} value={draft.shimTrayHeight} onChange={(event) => patch({ shimTrayHeight: Number(event.target.value) })} />
        </label>
        <label>
          Shim tray angle · °
          <input type="number" min={5} max={60} step={1} value={draft.shimTrayAngle} onChange={(event) => patch({ shimTrayAngle: Number(event.target.value) })} />
        </label>
        <label>
          Shim tray radius · mm
          <input type="number" min={20} max={400} step={1} value={draft.shimTrayRadius} onChange={(event) => patch({ shimTrayRadius: Number(event.target.value) })} />
        </label>
      </div>

      <h3 className="halbach-geo-heading">Ring catalog</h3>
      <p className="ic-register-sub">Each row is a radius and magnet count. Slices refer to these ids.</p>
      <div className="halbach-geo-scroll">
        <table className="halbach-geo-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Radius mm</th>
              <th>Magnets</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.rings.map((ring, index) => (
              <tr key={`ring-${index}`}>
                <td>
                  <input type="number" aria-label={`Ring ${index} id`} value={ring.id} onChange={(event) => patchRing(index, { id: Number(event.target.value) })} />
                </td>
                <td>
                  <input type="number" aria-label={`Ring ${index} radius`} value={ring.radius} onChange={(event) => patchRing(index, { radius: Number(event.target.value) })} />
                </td>
                <td>
                  <input type="number" aria-label={`Ring ${index} magnets`} value={ring.numMagnets} onChange={(event) => patchRing(index, { numMagnets: Number(event.target.value) })} />
                </td>
                <td>
                  <button type="button" className="settings-btn" onClick={() => patch({ rings: draft.rings.filter((_, ringIndex) => ringIndex !== index) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="settings-btn"
        onClick={() => {
          const last = draft.rings[draft.rings.length - 1];
          patch({
            rings: [
              ...draft.rings,
              {
                id: nextRingId(draft.rings),
                radius: last ? last.radius + 3 : 80,
                numMagnets: last ? last.numMagnets + 1 : 16,
              },
            ],
          });
        }}
      >
        Add ring
      </button>

      <h3 className="halbach-geo-heading">Slice plates</h3>
      <p className="ic-register-sub">12 mm discs. Ring ids are comma-separated. Stand 0 omits the foot on that plate.</p>
      <div className="halbach-geo-scroll">
        <table className="halbach-geo-table">
          <thead>
            <tr>
              <th>z mm</th>
              <th>Inner mm</th>
              <th>Outer mm</th>
              <th>Ring ids</th>
              <th>Stand W</th>
              <th>Stand H</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.slices.map((slice, index) => (
              <tr key={`slice-${index}`}>
                <td>
                  <input type="number" aria-label={`Slice ${index} position`} value={slice.position} onChange={(event) => patchSlice(index, { position: Number(event.target.value) })} />
                </td>
                <td>
                  <input type="number" aria-label={`Slice ${index} inner radius`} value={slice.innerRadius} onChange={(event) => patchSlice(index, { innerRadius: Number(event.target.value) })} />
                </td>
                <td>
                  <input type="number" aria-label={`Slice ${index} outer radius`} value={slice.outerRadius} onChange={(event) => patchSlice(index, { outerRadius: Number(event.target.value) })} />
                </td>
                <td>
                  <input
                    aria-label={`Slice ${index} ring ids`}
                    value={slice.rings.join(", ")}
                    onChange={(event) => patchSlice(index, { rings: parseRingIds(event.target.value) })}
                  />
                </td>
                <td>
                  <input type="number" aria-label={`Slice ${index} stand width`} value={slice.standWidth ?? ""} onChange={(event) => patchSlice(index, { standWidth: Number(event.target.value) })} />
                </td>
                <td>
                  <input type="number" aria-label={`Slice ${index} stand height`} value={slice.standHeight ?? ""} onChange={(event) => patchSlice(index, { standHeight: Number(event.target.value) })} />
                </td>
                <td>
                  <button type="button" className="settings-btn" onClick={() => patch({ slices: draft.slices.filter((_, sliceIndex) => sliceIndex !== index) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="settings-btn"
        onClick={() => {
          const last = draft.slices[draft.slices.length - 1];
          patch({
            slices: [
              ...draft.slices,
              {
                position: last ? last.position + 22 : 0,
                innerRadius: last?.innerRadius ?? 128,
                outerRadius: last?.outerRadius ?? 261,
                rings: last ? [...last.rings] : draft.rings.slice(0, 1).map((ring) => ring.id),
                standWidth: 0,
                standHeight: 0,
              },
            ],
          });
        }}
      >
        Add slice
      </button>
      {error ? (
        <p className="ic-register-error" role="alert">
          {error}
        </p>
      ) : null}
    </Overlay>,
    document.body,
  );
}
