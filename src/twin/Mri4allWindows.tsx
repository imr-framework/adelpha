import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeftRight,
  Ban,
  Binoculars,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Play,
  Power,
  RefreshCw,
  SatelliteDish,
  Save,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  clearLog,
  cloneStudyScan,
  controlOneService,
  fetchAbout,
  fetchConfig,
  fetchCurrentExam,
  fetchDisk,
  fetchLog,
  fetchServices,
  fetchStudies,
  fetchStudyPreview,
  formatDevicePingStatus,
  pingDevice,
  resetDevice,
  saveConfig,
  sendDicoms,
  studyExportUrl,
  testDevice,
  type DicomTarget,
  type MriConfig,
  type ServiceStatus,
  type StudyExam,
  type StudyPreview,
} from "./mri/api";
import { getScannerProfile, useScannerModel } from "./scannerModel";
import { Overlay } from "./ImagingOverlay";
import { downloadTextFile } from "./headMotionLog";
import { ADELPHA_VERSION } from "./adelphaVersion";
import { ScientificPlot } from "./ScientificPlot";

export type ViewerTarget = {
  label: string;
  folder: string;
  filePath: string;
  resultType: string;
  resultName?: string;
  patientName: string;
  mrn: string;
  protocolName: string;
  scanNumber: number;
};

export function viewerSeriesLabel(target: Pick<ViewerTarget, "resultName" | "resultType">): string {
  const name = (target.resultName || "").trim();
  const key = name.toLowerCase();
  if (!name || key === "reconstruction" || key === "image") {
    return target.resultType === "plot" ? "Plot" : "Magnitude";
  }
  if (key === "k-space" || key === "k space" || key === "kspace") return "k-Space";
  if (key === "phase") return "Phase";
  return name;
}

const GENERAL_SETTINGS: { key: keyof MriConfig; label: string }[] = [
  { key: "scanner_ip", label: "Scanner IP (Red Pitaya)" },
  { key: "debug_mode", label: "Debug Mode" },
  { key: "hardware_simulation", label: "Hardware Simulation" },
];

function M4Close({ onClose, icon }: { onClose: () => void; icon?: boolean }) {
  return (
    <div className="m4-footer">
      <button type="button" className="m4-btn m4-btn-accent" onClick={onClose}>
        {icon ? <Check size={14} strokeWidth={2.25} /> : null} Close
      </button>
    </div>
  );
}

function Mark({
  state,
  ok,
  bad,
  idle,
}: {
  state: "ok" | "bad" | "idle";
  ok: string;
  bad: string;
  idle: string;
}) {
  const Icon = state === "ok" ? CircleCheck : state === "bad" ? CircleX : CircleHelp;
  return (
    <span className={`m4-mark is-${state}`}>
      <Icon size={14} strokeWidth={2.25} /> {state === "ok" ? ok : state === "bad" ? bad : idle}
    </span>
  );
}

type WindowRange = { min: number; max: number };

function emptyPreview(error: string): StudyPreview {
  return {
    kind: "empty",
    slices: 0,
    index: 0,
    vmin: 0,
    vmax: 0,
    data_min: 0,
    data_max: 0,
    rows: 0,
    cols: 0,
    pixels: "",
    histogram: [],
    image: "",
    stack: [],
    series: null,
    error,
  };
}

function decodeF32leBase64(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

function formatLutTick(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 100) return String(Math.round(value));
  if (abs >= 10) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function lutTicks(min: number, max: number): number[] {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return [min];
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-6; value += step) ticks.push(value);
  return ticks.length ? ticks : [min, max];
}

function valueToYPct(value: number, dataMin: number, dataMax: number): number {
  const range = dataMax - dataMin;
  if (!(range > 0)) return 50;
  return ((dataMax - value) / range) * 100;
}

function yToValue(clientY: number, rect: DOMRect, dataMin: number, dataMax: number): number {
  const t = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1)));
  return dataMax - t * (dataMax - dataMin);
}

function histogramOutline(bins: number[], histMax: number): string {
  const n = bins.length;
  const max = Math.max(1, histMax);
  const pts: string[] = ["0,100"];
  for (let i = 0; i < n; i++) {
    const x = (bins[i] / max) * 100;
    const y = 100 - ((i + 0.5) / n) * 100;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  pts.push("0,0");
  return pts.join(" ");
}

function DicomSliceCanvas({
  pixels,
  rows,
  cols,
  winMin,
  winMax,
}: {
  pixels: Float32Array;
  rows: number;
  cols: number;
  winMin: number;
  winMax: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let source = sourceRef.current;
    if (!source) {
      source = document.createElement("canvas");
      sourceRef.current = source;
    }
    source.width = cols;
    source.height = rows;
    const sctx = source.getContext("2d");
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!sctx || !wrap || !canvas) return;
    const image = sctx.createImageData(cols, rows);
    const data = image.data;
    const range = winMax - winMin || 1;
    for (let i = 0; i < pixels.length; i++) {
      let gray = ((pixels[i] - winMin) / range) * 255;
      if (gray < 0) gray = 0;
      else if (gray > 255) gray = 255;
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = gray;
      data[o + 3] = 255;
    }
    sctx.putImageData(image, 0, 0);

    const paint = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(rect.width));
      const ch = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#090a0d";
      ctx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / cols, ch / rows);
      const dw = cols * scale;
      const dh = rows * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [pixels, rows, cols, winMin, winMax]);

  return (
    <div className="m4-view-image m4-view-dicom" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function DicomWindowLut({
  histogram,
  dataMin,
  dataMax,
  winMin,
  winMax,
  onChange,
  onReset,
}: {
  histogram: number[];
  dataMin: number;
  dataMax: number;
  winMin: number;
  winMax: number;
  onChange: (next: WindowRange) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "min" | "max" | "level";
    startValue: number;
    startMin: number;
    startMax: number;
  } | null>(null);
  const winRef = useRef({ min: winMin, max: winMax, dataMin, dataMax });
  winRef.current = { min: winMin, max: winMax, dataMin, dataMax };
  const histMax = Math.max(1, ...histogram);
  const range = dataMax - dataMin;
  const topPct = valueToYPct(winMax, dataMin, dataMax);
  const heightPct = range > 0 ? ((winMax - winMin) / range) * 100 : 0;
  const ticks = lutTicks(dataMin, dataMax);

  const applyPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      const drag = dragRef.current;
      if (!track || !drag) return;
      const { min, max, dataMin: lo, dataMax: hi } = winRef.current;
      const rect = track.getBoundingClientRect();
      const value = yToValue(clientY, rect, lo, hi);
      const minSpan = Math.max((hi - lo) * 0.002, 1e-6);
      if (drag.mode === "max") {
        onChange({ min, max: Math.max(min + minSpan, Math.min(hi, value)) });
        return;
      }
      if (drag.mode === "min") {
        onChange({ min: Math.min(max - minSpan, Math.max(lo, value)), max });
        return;
      }
      const width = drag.startMax - drag.startMin;
      if (width >= hi - lo) {
        onChange({ min: lo, max: hi });
        return;
      }
      let nextMin = drag.startMin + (value - drag.startValue);
      nextMin = Math.min(Math.max(nextMin, lo), hi - width);
      onChange({ min: nextMin, max: nextMin + width });
    },
    [onChange],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      applyPointer(event.clientY);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyPointer]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const yMax = (topPct / 100) * rect.height;
    const yMin = ((topPct + heightPct) / 100) * rect.height;
    const handlePx = 10;
    let mode: "min" | "max" | "level";
    if (Math.abs(y - yMax) <= handlePx) mode = "max";
    else if (Math.abs(y - yMin) <= handlePx) mode = "min";
    else if (y > yMax && y < yMin) mode = "level";
    else mode = y < yMax ? "max" : "min";
    dragRef.current = {
      mode,
      startValue: yToValue(event.clientY, rect, dataMin, dataMax),
      startMin: winMin,
      startMax: winMax,
    };
    applyPointer(event.clientY);
  };

  const minPct = topPct + heightPct;
  const outline = histogramOutline(histogram, histMax);

  return (
    <div
      className="m4-hist"
      role="group"
      aria-label="Image window and level"
      title="Drag handles to window. Drag the shaded region to level. Double-click to reset."
    >
      <div className="m4-hist-scale" aria-hidden>
        {ticks.map((tick, i) => (
          <span key={`${tick}-${i}`} style={{ top: `${valueToYPct(tick, dataMin, dataMax)}%` }}>
            {formatLutTick(tick)}
          </span>
        ))}
      </div>
      <div className="m4-hist-main">
        <div
          className="m4-hist-plot"
          ref={trackRef}
          onPointerDown={onPointerDown}
          onDoubleClick={onReset}
        >
          <svg className="m4-hist-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polygon className="m4-hist-fill" points={outline} />
            <rect
              className="m4-hist-window"
              x="0"
              y={topPct}
              width="100"
              height={Math.max(heightPct, 0)}
            />
          </svg>
          <div
            className="m4-hist-handle is-max"
            style={{ top: `${topPct}%` }}
            role="slider"
            aria-label="Window maximum"
            aria-valuemin={dataMin}
            aria-valuemax={dataMax}
            aria-valuenow={winMax}
          />
          <div
            className="m4-hist-handle is-min"
            style={{ top: `${minPct}%` }}
            role="slider"
            aria-label="Window minimum"
            aria-valuemin={dataMin}
            aria-valuemax={dataMax}
            aria-valuenow={winMin}
          />
        </div>
        <div className="m4-hist-lut" aria-hidden />
        <svg className="m4-hist-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <line x1="52" y1={topPct} x2="80" y2="0" />
          <line x1="52" y1={minPct} x2="80" y2="100" />
          <line x1="80" y1="0" x2="100" y2="0" />
          <line x1="80" y1="100" x2="100" y2="100" />
        </svg>
      </div>
    </div>
  );
}

function DicomSliceScrubber({
  index,
  count,
  onChange,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  const countRef = useRef(count);
  const onChangeRef = useRef(onChange);
  indexRef.current = index;
  countRef.current = count;
  onChangeRef.current = onChange;

  const indexFromX = useCallback((clientX: number) => {
    const track = trackRef.current;
    const n = countRef.current;
    if (!track || n <= 1) return 0;
    const rect = track.getBoundingClientRect();
    const t = (clientX - rect.left) / Math.max(rect.width, 1);
    return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      onChangeRef.current(indexFromX(event.clientX));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [indexFromX]);

  const pct = count > 1 ? (index / (count - 1)) * 100 : 0;
  return (
    <div
      className={`m4-slice${dragging ? " is-dragging" : ""}`}
      ref={trackRef}
      role="slider"
      aria-label="Slice"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={index}
      aria-valuetext={`Slice ${index + 1} of ${count}`}
      tabIndex={0}
      title="Drag or scroll to change slice"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragRef.current = true;
        setDragging(true);
        onChange(indexFromX(event.clientX));
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onChange(Math.min(count - 1, index + 1));
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(Math.max(0, index - 1));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(count - 1);
        }
      }}
    >
      <div className="m4-slice-rail" />
      <div className="m4-slice-thumb" style={{ left: `${pct}%` }} />
      <span className="m4-slice-label">
        {index + 1} / {count}
      </span>
    </div>
  );
}

function mosaicGrid(count: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

export function ResultStage({
  target,
  fullYTicks = false,
  mosaic = false,
  onMosaicable,
  onLeaveMosaic,
}: {
  target: ViewerTarget | null;
  fullYTicks?: boolean;
  mosaic?: boolean;
  onMosaicable?: (ok: boolean) => void;
  onLeaveMosaic?: () => void;
}) {
  const [slice, setSlice] = useState(0);
  const [preview, setPreview] = useState<StudyPreview | null>(null);
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(false);
  const [win, setWin] = useState<WindowRange | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<StudyPreview | null>(null);
  const sliceRef = useRef(0);
  previewRef.current = preview;
  sliceRef.current = slice;
  const plotAxes = preview?.series?.axes;
  const isDicom = (target?.resultType || preview?.kind || "").toLowerCase() === "dicom";
  const hasDicomPixels = Boolean(isDicom && preview?.pixels && preview.rows && preview.cols);
  const needsSizedPng = Boolean(
    (preview?.kind === "plot" && preview.image && !plotAxes?.length) ||
      (isDicom && preview && !preview.pixels),
  );
  const pixels = useMemo(() => {
    if (!preview?.pixels || !preview.rows || !preview.cols) return null;
    try {
      const decoded = decodeF32leBase64(preview.pixels);
      if (decoded.length < preview.rows * preview.cols) return null;
      return decoded;
    } catch {
      return null;
    }
  }, [preview?.pixels, preview?.rows, preview?.cols]);
  const stackTiles = useMemo(() => {
    const stack = preview?.stack;
    if (!stack?.length) return [];
    const tiles: { index: number; rows: number; cols: number; pixels: Float32Array }[] = [];
    for (const item of stack) {
      try {
        const decoded = decodeF32leBase64(item.pixels);
        if (decoded.length < item.rows * item.cols) continue;
        tiles.push({ index: item.index, rows: item.rows, cols: item.cols, pixels: decoded });
      } catch {
        continue;
      }
    }
    return tiles;
  }, [preview?.stack]);
  const showMosaic = Boolean(mosaic && isDicom && stackTiles.length > 1);
  const mosaicShape = mosaicGrid(stackTiles.length);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setPlotSize((prev) => (Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4 ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (event: WheelEvent) => {
      const n = previewRef.current?.kind === "dicom" ? previewRef.current.slices : 0;
      if (n <= 1) return;
      event.preventDefault();
      event.stopPropagation();
      let step = 0;
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        step = Math.sign(event.deltaY);
        acc = 0;
      } else {
        acc += event.deltaY;
        if (Math.abs(acc) >= 48) {
          step = Math.sign(acc);
          acc = 0;
        }
      }
      if (!step) return;
      const next = Math.min(n - 1, Math.max(0, sliceRef.current + step));
      if (next !== sliceRef.current) setSlice(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    setSlice(0);
    setWin(null);
  }, [target?.folder, target?.filePath]);
  useEffect(() => {
    if (!target || !target.folder || !target.filePath) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const folder = target.folder;
    const filePath = target.filePath;
    const resultType = target.resultType;
    if (needsSizedPng && (plotSize.w < 80 || plotSize.h < 80)) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    const delay = needsSizedPng ? 120 : 0;
    const timer = window.setTimeout(() => {
      setLoading(
        mosaic
          ? !((previewRef.current?.stack?.length ?? 0) > 1)
          : !previewRef.current?.series && !previewRef.current?.image && !previewRef.current?.pixels,
      );
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      void fetchStudyPreview(
        folder,
        filePath,
        resultType,
        slice,
        needsSizedPng ? { width: plotSize.w, height: plotSize.h, scale } : undefined,
        mosaic,
      )
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
          if (next.kind !== "dicom") return;
          const lo = next.data_min ?? next.vmin;
          const hi = next.data_max ?? next.vmax;
          setWin((prev) => {
            if (!prev) return { min: next.vmin, max: next.vmax };
            const minSpan = Math.max((hi - lo) * 0.002, 1e-6);
            const min = Math.min(Math.max(prev.min, lo), hi);
            const max = Math.min(Math.max(prev.max, lo), hi);
            if (max - min < minSpan) return { min: next.vmin, max: next.vmax };
            return { min, max };
          });
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(emptyPreview(e instanceof Error ? e.message : "Preview failed"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    target?.folder,
    target?.filePath,
    target?.resultType,
    mosaic,
    mosaic ? -1 : slice,
    needsSizedPng,
    needsSizedPng && plotSize.w,
    needsSizedPng && plotSize.h,
  ]);
  useEffect(() => {
    onMosaicable?.(isDicom && (preview?.slices ?? 0) > 1);
  }, [isDicom, preview?.slices, onMosaicable]);
  const showStudyMeta = Boolean(target) && preview?.kind !== "plot" && !plotAxes?.length;
  const dataMin = preview?.data_min ?? preview?.vmin ?? 0;
  const dataMax = preview?.data_max ?? preview?.vmax ?? 1;
  const winMin = win?.min ?? preview?.vmin ?? dataMin;
  const winMax = win?.max ?? preview?.vmax ?? dataMax;
  const mosaicPending = mosaic && isDicom && (preview?.slices ?? 0) > 1 && !showMosaic && loading;
  const stageClass = [
    "m4-view-stage",
    target ? "is-loaded" : "is-empty",
    loading || mosaicPending ? "is-loading" : "",
    preview?.error ? "is-error" : "",
    preview?.kind === "plot" ? "is-plot" : "",
    preview?.kind === "dicom" && (pixels || showMosaic) ? "is-dicom" : "",
    showMosaic ? "is-mosaic" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={stageClass}>
      {showStudyMeta && target ? (
        <div className="m4-view-meta">
          <span className="m4-view-meta-who">{target.patientName.replace(/,\s*$/, "").trim() || "Patient"}</span>
          <span className="m4-view-meta-series">{viewerSeriesLabel(target).toUpperCase()}</span>
        </div>
      ) : null}
      <div className="m4-view-canvas">
        <div className="m4-view-plot" ref={plotRef}>
          {plotAxes?.length ? (
            <ScientificPlot axes={plotAxes} fullY={fullYTicks} />
          ) : showMosaic ? (
            <div
              className="m4-mosaic"
              style={{
                gridTemplateColumns: `repeat(${mosaicShape.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mosaicShape.rows}, minmax(0, 1fr))`,
              }}
            >
              {stackTiles.map((tile) => (
                <button
                  key={tile.index}
                  type="button"
                  className={`m4-mosaic-cell${tile.index === slice ? " is-active" : ""}`}
                  aria-pressed={tile.index === slice}
                  aria-label={`Slice ${tile.index + 1}`}
                  onClick={() => setSlice(tile.index)}
                  onDoubleClick={() => {
                    setSlice(tile.index);
                    onLeaveMosaic?.();
                  }}
                >
                  <DicomSliceCanvas
                    pixels={tile.pixels}
                    rows={tile.rows}
                    cols={tile.cols}
                    winMin={winMin}
                    winMax={winMax}
                  />
                  <span className="m4-mosaic-idx">{tile.index + 1}</span>
                </button>
              ))}
            </div>
          ) : pixels && preview?.rows && preview.cols ? (
            <DicomSliceCanvas
              pixels={pixels}
              rows={preview.rows}
              cols={preview.cols}
              winMin={winMin}
              winMax={winMax}
            />
          ) : preview?.image ? (
            <img className="m4-view-image" src={preview.image} alt="" />
          ) : (
            <div className="m4-view-empty" />
          )}
          {preview?.kind === "dicom" && preview.slices > 1 && !showMosaic ? (
            <DicomSliceScrubber
              index={Math.min(slice, preview.slices - 1)}
              count={preview.slices}
              onChange={setSlice}
            />
          ) : null}
        </div>
        {(pixels || showMosaic) && preview?.kind === "dicom" && preview.histogram.length ? (
          <DicomWindowLut
            histogram={preview.histogram}
            dataMin={dataMin}
            dataMax={dataMax}
            winMin={winMin}
            winMax={winMax}
            onChange={setWin}
            onReset={() => setWin({ min: preview.vmin, max: preview.vmax })}
          />
        ) : null}
        {(loading || mosaicPending) && !plotAxes?.length && !preview?.image && !hasDicomPixels ? (
          <p className="m4-view-status">Loading</p>
        ) : mosaicPending ? (
          <p className="m4-view-status">Loading slices</p>
        ) : null}
        {!target ? <p className="m4-view-status">No result selected</p> : null}
        {preview?.error ? <p className="m4-view-placeholder">{preview.error}</p> : null}
      </div>
    </div>
  );
}

export function FlexDialog({ onClose, target }: { onClose: () => void; target: ViewerTarget | null }) {
  const [maximized, setMaximized] = useState(false);
  const [mosaic, setMosaic] = useState(false);
  const [canMosaic, setCanMosaic] = useState(false);
  useEffect(() => {
    setMosaic(false);
  }, [target?.folder, target?.filePath, target?.resultType]);
  useEffect(() => {
    if (!canMosaic) setMosaic(false);
  }, [canMosaic]);
  return (
    <Overlay
      title="Flex Viewer"
      onClose={onClose}
      variant="m4"
      size={maximized ? "flex-max" : "flex"}
      wide
      dismissOnBackdrop={false}
      footer={
        <div className="m4-footer m4-footer-end">
          <button
            type="button"
            className={`m4-btn m4-btn-flat${mosaic ? " is-on" : ""}`}
            disabled={!canMosaic}
            title={canMosaic ? "Show every slice in a grid" : "Mosaic needs more than one slice"}
            onClick={() => setMosaic((v) => !v)}
          >
            {mosaic ? <Square size={14} /> : <LayoutGrid size={14} />} {mosaic ? "Slice" : "Mosaic"}
          </button>
          <button type="button" className="m4-btn m4-btn-flat" onClick={() => setMaximized((v) => !v)}>
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {maximized ? "Restore" : "Maximize"}
          </button>
          <button type="button" className="m4-btn m4-btn-accent" onClick={onClose}>
            <Check size={14} strokeWidth={2.25} /> Close
          </button>
        </div>
      }
    >
      <ResultStage
        target={target}
        mosaic={mosaic}
        onMosaicable={setCanMosaic}
        onLeaveMosaic={() => setMosaic(false)}
      />
    </Overlay>
  );
}

export function LogDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState<"api" | "acq" | "recon" | "ui">("api");
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const load = useCallback((n: typeof name) => {
    void fetchLog(n)
      .then((r) => setLines(r.lines.filter((line) => line.trim().length > 0)))
      .catch((e) => setLines([e instanceof Error ? e.message : "Unable to load log"]));
  }, []);
  useEffect(() => {
    load(name);
    const t = window.setInterval(() => load(name), 2000);
    return () => window.clearInterval(t);
  }, [name, load]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  const rows = lines.map(parseLogLine);
  const empty = rows.length === 0;
  const label = LOG_TAB_LABELS[name];

  const exportTxt = () => {
    if (empty) return;
    downloadTextFile(`${logExportFilename(label)}.txt`, `${lines.join("\n")}\n`, "text/plain");
  };
  const exportCsv = () => {
    if (empty) return;
    downloadTextFile(`${logExportFilename(label)}.csv`, `\uFEFF${rowsToCsv(rows)}`, "text/csv;charset=utf-8");
  };
  const clearHistory = async () => {
    if (empty || busy) return;
    if (!window.confirm(`Clear ${label} log history? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await clearLog(name);
      setLines([]);
    } catch (err) {
      setLines([err instanceof Error ? err.message : "Unable to clear log"]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay title="Log Viewer" onClose={onClose} variant="m4" size="log" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} />}>
      <div className="m4-log-toolbar">
        <select value={name} onChange={(e) => setName(e.target.value as typeof name)}>
          <option value="api">Console</option>
          <option value="acq">Acquisition</option>
          <option value="recon">Reconstruction</option>
          <option value="ui">UI</option>
        </select>
        <button type="button" className="m4-icon-btn" title="Refresh" onClick={() => load(name)}>
          <RefreshCw size={14} />
        </button>
        <div className="m4-log-toolbar-actions">
          <button type="button" className="m4-btn" title="Export as text" disabled={empty} onClick={exportTxt}>
            <Download size={14} strokeWidth={1.8} aria-hidden />
            TXT
          </button>
          <button type="button" className="m4-btn" title="Export as CSV" disabled={empty} onClick={exportCsv}>
            <Download size={14} strokeWidth={1.8} aria-hidden />
            CSV
          </button>
          <button type="button" className="m4-btn" title="Clear log history" disabled={empty || busy} onClick={() => void clearHistory()}>
            <Trash2 size={14} strokeWidth={1.8} aria-hidden />
            {busy ? "Clearing…" : "Clear"}
          </button>
        </div>
      </div>
      <div
        className="m4-log-table-wrap"
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {empty ? (
          <p className="m4-log-empty">No entries in this log yet.</p>
        ) : (
          <table className="m4-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Level</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.time}-${i}`} className={row.tone ? `is-${row.tone}` : undefined}>
                  <td className="m4-log-time">{row.time}</td>
                  <td className="m4-log-source">{row.source}</td>
                  <td>
                    <span className={`m4-log-level${row.tone ? ` is-${row.tone}` : ""}`}>{row.level}</span>
                  </td>
                  <td className="m4-log-message">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Overlay>
  );
}

const LOG_TAB_LABELS = {
  api: "Console",
  acq: "Acquisition",
  recon: "Reconstruction",
  ui: "UI",
} as const;

const SOURCE_LABELS: Record<string, string> = {
  api: "Console",
  unknown: "Console",
  "mri4all-api": "Console",
  "mri4all-api.pipeline": "Console",
  acq: "Acquisition",
  recon: "Reconstruction",
  ui: "UI",
};

const LEVEL_LABELS: Record<string, string> = {
  INF: "INFO",
  WRN: "WARN",
  ERR: "ERROR",
  DBG: "DEBUG",
  CTL: "CRITICAL",
  NOT: "NOTE",
};

function parseLogLine(line: string): { time: string; source: string; level: string; message: string; tone?: string } {
  const parts = line.split(" | ");
  if (parts.length >= 5) {
    const [rawTime, rawSource, rawLevel, , ...rest] = parts;
    const levelKey = rawLevel.trim();
    const tone = levelKey === "ERR" || levelKey === "CTL" ? "err" : levelKey === "WRN" ? "wrn" : levelKey === "DBG" ? "dbg" : undefined;
    return {
      time: formatLogTime(rawTime),
      source: SOURCE_LABELS[rawSource.trim()] ?? rawSource.trim(),
      level: LEVEL_LABELS[levelKey] ?? levelKey,
      message: rest.join(" | ").trim() || "—",
      tone,
    };
  }
  const tone = line.includes("| ERR |") ? "err" : line.includes("| WRN |") ? "wrn" : line.includes("| DBG |") ? "dbg" : undefined;
  return { time: "", source: "", level: "", message: line, tone };
}

function formatLogTime(value: string): string {
  const normalized = value.replace(",", ".").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?/);
  if (!match) return normalized.slice(0, 23);
  const ms = (match[3] || "000").padEnd(3, "0").slice(0, 3);
  return `${match[1]}  ${match[2]}.${ms}`;
}

function logExportFilename(label: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `adelpha-${label.toLowerCase()}-log-${stamp}`;
}

function rowsToCsv(rows: ReturnType<typeof parseLogLine>[]): string {
  const header = ["Time", "Source", "Level", "Message"];
  const body = rows.map((row) => [row.time, row.source, row.level, row.message].map(csvCell).join(","));
  return `${[header.join(","), ...body].join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function ConfigDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"general" | "dicom" | "maintenance">("general");
  const [cfg, setCfg] = useState<MriConfig | null>(null);
  const [error, setError] = useState("");
  const [openTarget, setOpenTarget] = useState(0);
  useEffect(() => {
    void fetchConfig()
      .then((c) => setCfg({ ...c, dicom_targets: c.dicom_targets ?? [] }))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  const save = () => {
    if (!cfg) return;
    void saveConfig(cfg)
      .then(() => onClose())
      .catch((e) => setError(e instanceof Error ? e.message : "Save failed"));
  };
  const updateTarget = (i: number, patch: Partial<DicomTarget>) => {
    if (!cfg) return;
    const dicom_targets = cfg.dicom_targets.slice();
    dicom_targets[i] = { ...dicom_targets[i], ...patch };
    setCfg({ ...cfg, dicom_targets });
  };
  return (
    <Overlay
      title="Configuration"
      onClose={onClose}
      variant="m4"
      size="config"
      wide
      dismissOnBackdrop={false}
      footer={
        <div className="m4-footer">
          <button type="button" className="m4-btn m4-btn-accent" onClick={save} disabled={!cfg}>
            <Check size={14} /> Save
          </button>
          <button type="button" className="m4-btn" onClick={onClose}>
            <X size={14} /> Cancel
          </button>
        </div>
      }
    >
      <div className="m4-tabs">
        <button type="button" className={tab === "general" ? "is-active" : undefined} onClick={() => setTab("general")}>
          General
        </button>
        <button type="button" className={tab === "dicom" ? "is-active" : undefined} onClick={() => setTab("dicom")}>
          DICOM Export
        </button>
        <button type="button" className={tab === "maintenance" ? "is-active" : undefined} onClick={() => setTab("maintenance")}>
          Maintenance
        </button>
      </div>
      {error ? <p className="ic-register-error">{error}</p> : null}
      {!cfg ? (
        <p className="m4-muted">Loading…</p>
      ) : tab === "general" ? (
        <>
          <table className="m4-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {GENERAL_SETTINGS.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    {row.key === "scanner_ip" ? (
                      <input value={String(cfg[row.key] ?? "")} onChange={(e) => setCfg({ ...cfg, scanner_ip: e.target.value })} />
                    ) : (
                      <select
                        value={String(cfg[row.key] ?? "False")}
                        onChange={(e) => setCfg({ ...cfg, [row.key]: e.target.value } as MriConfig)}
                      >
                        <option value="False">False</option>
                        <option value="True">True</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m4-muted">
            Set Hardware Simulation to False to use a connected Red Pitaya. Ping checks MaRCoS on
            port 11111. After changing the IP, restart the Python runtime before running sequences.
          </p>
        </>
      ) : tab === "dicom" ? (
        <div className="m4-dicom">
          <h3>DICOM Targets</h3>
          {cfg.dicom_targets.map((t, i) => (
            <div key={i} className={`m4-tree${openTarget === i ? " is-open" : ""}`}>
              <button type="button" className="m4-tree-head" onClick={() => setOpenTarget(i)}>
                {t.name || "Untitled"}
              </button>
              {openTarget === i ? (
                <div className="m4-tree-body">
                  <label>
                    name
                    <input value={t.name} onChange={(e) => updateTarget(i, { name: e.target.value })} />
                  </label>
                  <label>
                    ip
                    <input value={t.ip} onChange={(e) => updateTarget(i, { ip: e.target.value })} />
                  </label>
                  <label>
                    port
                    <input type="number" value={t.port} onChange={(e) => updateTarget(i, { port: Number(e.target.value) })} />
                  </label>
                  <label>
                    aet_target
                    <input value={t.aet_target} onChange={(e) => updateTarget(i, { aet_target: e.target.value })} />
                  </label>
                  <label>
                    aet_source
                    <input value={t.aet_source ?? ""} onChange={(e) => updateTarget(i, { aet_source: e.target.value })} />
                  </label>
                </div>
              ) : null}
            </div>
          ))}
          <div className="m4-inline">
            <button
              type="button"
              className="m4-btn"
              onClick={() =>
                setCfg({
                  ...cfg,
                  dicom_targets: [...cfg.dicom_targets, { name: "New Target", ip: "", port: 11112, aet_target: "", aet_source: "mri4all" }],
                })
              }
            >
              Add
            </button>
            <button
              type="button"
              className="m4-btn"
              onClick={() => setCfg({ ...cfg, dicom_targets: cfg.dicom_targets.filter((_, j) => j !== openTarget) })}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <p className="m4-muted">No maintenance actions on this workstation.</p>
      )}
    </Overlay>
  );
}

export function StatusDialog({ onClose }: { onClose: () => void }) {
  const [modelId] = useScannerModel();
  const profile = getScannerProfile(modelId);
  const [about, setAbout] = useState<{ model: string; serial: string }>({
    model: profile.displayName,
    serial: profile.serial,
  });
  const [svc, setSvc] = useState<ServiceStatus | null>(null);
  const [ping, setPing] = useState<"idle" | "ok" | "bad">("idle");
  const [pingDetail, setPingDetail] = useState("");
  const [test, setTest] = useState<"idle" | "ok" | "bad">("idle");
  const [reset, setReset] = useState("");
  const [disk, setDisk] = useState<{ percent: number; freeGb: number } | null>(null);
  const refresh = () => {
    void fetchServices().then(setSvc).catch(() => setSvc({ acq: null, recon: null, mode: "unavailable" }));
    void fetchDisk()
      .then((d) => setDisk({ percent: d.percent, freeGb: Math.round(d.free / 1024 / 1024 / 1024) }))
      .catch(() => setDisk(null));
  };
  const runPing = () => {
    setPing("idle");
    setPingDetail("Checking MaRCoS…");
    void pingDevice()
      .then((p) => {
        setPing((p.reachable ?? p.ok) ? "ok" : "bad");
        setPingDetail(formatDevicePingStatus(p));
      })
      .catch((e) => {
        setPing("bad");
        setPingDetail(e instanceof Error ? e.message : "Ping failed");
      });
  };
  useEffect(() => {
    setAbout({ model: profile.displayName, serial: profile.serial });
    if (profile.family !== "mri4all") return;
    void fetchAbout()
      .then((a) => {
        setAbout({
          model: profile.displayName,
          serial: a.system.serial_number || profile.serial,
        });
      })
      .catch(() => {
        setAbout({ model: profile.displayName, serial: profile.serial });
      });
  }, [profile]);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 500);
    runPing();
    return () => window.clearInterval(t);
  }, []);
  const acqOn = Boolean(svc?.acq);
  const reconOn = Boolean(svc?.recon);
  return (
    <Overlay title="System Status" onClose={onClose} variant="m4" size="status" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} />}>
      <div className="m4-status-hero">
        <div className="m4-status-copy">
          <p className="m4-gold">
            <strong>{about.model}</strong>
          </p>
          <p>Serial Number {about.serial}</p>
          <p>Software Version {ADELPHA_VERSION}</p>
        </div>
        <img className="m4-scanner" src={profile.preview} alt={profile.alt} />
      </div>
      <div className="m4-divider" />
      <div className="m4-status-rows">
        <div className="m4-status-row">
          <span>{svc?.mode === "adelpha" ? "Acquisition pipeline" : "Acquisition Service"}</span>
          <Mark state={svc?.acq == null ? "idle" : acqOn ? "ok" : "bad"} ok="Running" bad="Not running" idle="Unknown" />
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => void controlOneService("acq", acqOn ? "stop" : "start").then(setSvc)}>
              {acqOn ? <Square size={14} /> : <Play size={14} />} {acqOn ? "Stop" : "Start"}
            </button>
            <button type="button" className="m4-btn" onClick={() => void controlOneService("acq", "kill").then(setSvc)}>
              <Ban size={14} /> Kill
            </button>
          </div>
        </div>
        <div className="m4-status-row">
          <span>{svc?.mode === "adelpha" ? "Reconstruction pipeline" : "Reconstruction Service"}</span>
          <Mark state={svc?.recon == null ? "idle" : reconOn ? "ok" : "bad"} ok="Running" bad="Not running" idle="Unknown" />
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => void controlOneService("recon", reconOn ? "stop" : "start").then(setSvc)}>
              {reconOn ? <Square size={14} /> : <Play size={14} />} {reconOn ? "Stop" : "Start"}
            </button>
            <button type="button" className="m4-btn" onClick={() => void controlOneService("recon", "kill").then(setSvc)}>
              <Ban size={14} /> Kill
            </button>
          </div>
        </div>
        <div className="m4-status-row">
          <span>Scanner Hardware</span>
          <div>
            <Mark state={ping} ok="Responding" bad="Not responding" idle="Checking" />
            {pingDetail ? <p className="m4-muted">{pingDetail}</p> : null}
          </div>
          <button type="button" className="m4-btn m4-btn-wide" onClick={runPing}>
            <SatelliteDish size={14} /> Ping
          </button>
        </div>
        <div className="m4-status-row">
          <span>Device Test</span>
          <Mark state={test} ok="Success" bad="Failure" idle="Not tested" />
          <button type="button" className="m4-btn m4-btn-wide" onClick={() => void testDevice().then((r) => setTest(r.ok ? "ok" : "bad"))}>
            <ArrowLeftRight size={14} /> Test
          </button>
        </div>
        <div className="m4-status-row">
          <span>Device Reset</span>
          <span className="m4-muted">{reset}</span>
          <button type="button" className="m4-btn m4-btn-wide" onClick={() => void resetDevice().then((r) => setReset(r.ok ? "Reset requested" : "Reset failed"))}>
            <Power size={14} /> Reset
          </button>
        </div>
        <div className="m4-status-row">
          <span>Disk Space</span>
          <div className="m4-disk">
            <progress max={100} value={disk?.percent ?? 0} />
            <em>{disk ? `${disk.freeGb} GB available` : "—"}</em>
          </div>
        </div>
        {svc?.mode === "adelpha" ? (
          <p className="m4-muted">
            Acquisition and reconstruction run inside Adelpha. Start/Stop pauses those workers.
            {svc.last_error ? ` Last error: ${svc.last_error}` : ""}
          </p>
        ) : null}
      </div>
    </Overlay>
  );
}

function pickScanIndex(exam: StudyExam | null): number {
  if (!exam?.scans.length) return 0;
  for (let i = exam.scans.length - 1; i >= 0; i--) {
    if (exam.scans[i].results?.length) return i;
  }
  return 0;
}

export function StudyDialog({
  onClose,
  onLoad,
}: {
  onClose: () => void;
  onLoad?: (target: ViewerTarget, slot: 1 | 2 | 3 | "flex") => void;
}) {
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<StudyExam | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  const [resultIdx, setResultIdx] = useState(0);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [examActive, setExamActive] = useState(false);
  const [targets, setTargets] = useState<DicomTarget[]>([]);
  const [targetName, setTargetName] = useState("Default");
  const [viewMenu, setViewMenu] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  useEffect(() => {
    void fetchStudies()
      .then((list) => {
        setExams(list);
        const first = list[0] ?? null;
        setSelected(first);
        const idx = pickScanIndex(first);
        setScanIdx(idx);
        setResultIdx(0);
        setChecked(Array.from({ length: first?.scans.length ?? 0 }, () => false));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
    void fetchCurrentExam().then((e) => setExamActive(Boolean(e))).catch(() => setExamActive(false));
    void fetchConfig()
      .then((c) => {
        setTargets(c.dicom_targets ?? []);
        if (c.dicom_targets?.[0]?.name) setTargetName(c.dicom_targets[0].name);
      })
      .catch(() => undefined);
  }, []);
  const scan = selected?.scans[scanIdx] ?? null;
  const result = scan?.results[resultIdx];
  const selectExam = (exam: StudyExam) => {
    setSelected(exam);
    const idx = pickScanIndex(exam);
    setScanIdx(idx);
    setResultIdx(0);
    setChecked(Array.from({ length: exam.scans.length }, () => false));
  };
  const loadViewer = (slot: 1 | 2 | 3 | "flex") => {
    if (!scan) return;
    const task = scan.task as { patient?: { mrn?: string } } | undefined;
    onLoad?.(
      {
        label: `${scan.scan_number}:  ${scan.protocol_name}`,
        folder: scan.path,
        filePath: result?.file_path ?? "",
        resultType: result?.type ?? "dicom",
        resultName: result?.name,
        patientName: selected?.patientName ?? "",
        mrn: selected?.mrn || task?.patient?.mrn || selected?.acc.toLowerCase() || "",
        protocolName: scan.protocol_name,
        scanNumber: scan.scan_number,
      },
      slot,
    );
    setViewMenu(false);
  };
  return (
    <Overlay title="Study Viewer" onClose={onClose} variant="m4" size="study" wide dismissOnBackdrop={false} footer={<M4Close onClose={onClose} icon />}>
      {error ? <p className="ic-register-error">{error}</p> : null}
      {notice ? <p className="m4-notice">{notice}</p> : null}
      {!exams.length && !error ? <p className="m4-muted">No completed exams in the archive yet.</p> : null}
      <div className="m4-study">
        <aside className="m4-study-left">
          <h3>EXAMS</h3>
          <table className="m4-table m4-exam-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Date / Time</th>
                <th>ACC</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id} className={selected?.id === e.id ? "is-selected" : undefined} onClick={() => selectExam(e)}>
                  <td>{e.patientName}</td>
                  <td>{e.examTime}</td>
                  <td>{e.acc.toUpperCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>SCANS</h3>
          <ul className="m4-scan-list">
            {selected?.scans.map((s, i) => (
              <li key={s.id} className={scanIdx === i ? "is-selected" : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[i])}
                    onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <button type="button" onClick={() => { setScanIdx(i); setResultIdx(0); }}>
                    {s.scan_number}:  {s.protocol_name}
                    {s.failed ? "  [failed]" : ""}
                  </button>
                </label>
              </li>
            ))}
          </ul>
          <div className="m4-inline">
            <button type="button" className="m4-btn" onClick={() => setChecked(checked.map(() => true))}>
              Select All
            </button>
            <button type="button" className="m4-btn" onClick={() => setChecked(checked.map(() => false))}>
              Select None
            </button>
          </div>
          <h3>DICOM TRANSFER</h3>
          <div className="m4-inline m4-transfer">
            <span>Target:</span>
            <select value={targetName} onChange={(e) => setTargetName(e.target.value)}>
              {(targets.length ? targets : [{ name: "Default", ip: "", port: 0, aet_target: "" }]).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="m4-btn"
              onClick={() => {
                const folders = selected?.scans.filter((_, i) => checked[i]).map((s) => s.path) ?? [];
                if (!folders.length) {
                  setNotice("Select at least one scan to send.");
                  return;
                }
                void sendDicoms(targetName, folders)
                  .then(() => setNotice("DICOM transfer requested."))
                  .catch((e) => setNotice(e instanceof Error ? e.message : "Transfer failed"));
              }}
            >
              <Send size={14} /> Send
            </button>
          </div>
        </aside>
        <div className="m4-study-right">
          <h3>VIEWING</h3>
          <ResultStage
            target={
              scan
                ? {
                    label: `${scan.scan_number}:  ${scan.protocol_name}`,
                    folder: scan.path,
                    filePath: result?.file_path ?? "",
                    resultType: result?.type ?? "dicom",
                    resultName: result?.name,
                    patientName: selected?.patientName ?? "",
                    mrn: selected?.mrn || selected?.acc.toLowerCase() || "",
                    protocolName: scan.protocol_name,
                    scanNumber: scan.scan_number,
                  }
                : null
            }
          />
          <h3>RESULTS</h3>
          <ul className="m4-result-list">
            {scan?.results.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <button type="button" className={resultIdx === i ? "is-selected" : undefined} onClick={() => setResultIdx(i)}>
                  {r.name}  ({r.type.toUpperCase()})
                </button>
              </li>
            ))}
          </ul>
          <div className="m4-inline m4-study-actions">
            <button
              type="button"
              className="m4-btn"
              disabled={!scan || !result}
              onClick={() => {
                if (!scan || !result) return;
                window.open(studyExportUrl(scan.path, result.file_path), "_blank");
              }}
            >
              <Save size={14} /> Export
            </button>
            <button type="button" className="m4-btn" onClick={() => setDefinition(JSON.stringify(scan?.task ?? scan ?? {}, null, 2))}>
              <Binoculars size={14} /> Definition
            </button>
            <button
              type="button"
              className="m4-btn"
              disabled={!examActive || !scan}
              onClick={() => {
                if (!scan) return;
                void cloneStudyScan(scan.path)
                  .then((entry) => setNotice(`Cloned as ${entry.scan_counter}. ${entry.protocol_name}`))
                  .catch((e) => setNotice(e instanceof Error ? e.message : "Clone failed"));
              }}
            >
              <Copy size={14} /> Clone
            </button>
            <div className="m4-viewin">
              <button type="button" className="m4-btn" disabled={!examActive || !scan} onClick={() => setViewMenu((v) => !v)}>
                <ImageIcon size={14} /> View in
              </button>
              {viewMenu ? (
                <div className="m4-viewin-menu">
                  <button type="button" onClick={() => loadViewer(1)}>
                    Viewer 1
                  </button>
                  <button type="button" onClick={() => loadViewer(2)}>
                    Viewer 2
                  </button>
                  <button type="button" onClick={() => loadViewer(3)}>
                    Viewer 3
                  </button>
                  <button type="button" onClick={() => loadViewer("flex")}>
                    Flex Viewer
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {definition ? (
        <Overlay title="Scan definition" onClose={() => setDefinition(null)} variant="m4" size="log" wide dismissOnBackdrop={false}>
          <pre className="m4-log">{definition}</pre>
        </Overlay>
      ) : null}
    </Overlay>
  );
}
