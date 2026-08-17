import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { type HeadMotionSample } from "./headMotionLog";
import { useHeadMotionStore } from "./headMotionStore";

export type HeadPose = {
  yaw: number;
  pitch: number;
  roll: number;
};

/** Full pose frame for charts + retrospective motion logs. */
export type HeadPoseFrame = {
  pose: HeadPose;
  /** Absolute MediaPipe facial transform, column-major 4×4. */
  matrix: number[];
  /** Relative rotation vs reference, row-major 3×3 (null until Set reference). */
  R_rel: number[] | null;
  t_rel: number[] | null;
  t_wall_ms: number;
  t_rel_ms: number | null;
  sample: HeadMotionSample;
};

type Connection = { start: number; end: number };

export type FaceMaskStyle = "mesh" | "contours" | "points" | "glow" | "neon" | "silhouette";

const MASK_STYLES: { id: FaceMaskStyle; label: string }[] = [
  { id: "silhouette", label: "Silhouette" },
  { id: "mesh", label: "Mesh" },
  { id: "contours", label: "Contours" },
  { id: "points", label: "Points" },
  { id: "glow", label: "Glow" },
  { id: "neon", label: "Neon" },
];

const MASK_STYLE_KEY = "twin_face_mask_style";
const BG_MODE_KEY = "twin_camera_bg_mode";

export type CameraBgMode = "scene" | "black";

const BG_MODES: { id: CameraBgMode; label: string }[] = [
  { id: "scene", label: "Full scene" },
  { id: "black", label: "Black bg" },
];

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SEGMENTER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

const UI_HZ = 12;
const UI_INTERVAL_MS = 1000 / UI_HZ;
const INFER_HZ = 15;
const INFER_INTERVAL_MS = 1000 / INFER_HZ;
const EMA_ALPHA = 0.32;

const ZERO_POSE: HeadPose = { yaw: 0, pitch: 0, roll: 0 };

function readMaskStyle(): FaceMaskStyle {
  try {
    const v = localStorage.getItem(MASK_STYLE_KEY);
    if (MASK_STYLES.some((s) => s.id === v)) return v as FaceMaskStyle;
  } catch {
    /* ignore */
  }
  return "silhouette";
}

function readBgMode(): CameraBgMode {
  try {
    const v = localStorage.getItem(BG_MODE_KEY);
    if (BG_MODES.some((m) => m.id === v)) return v as CameraBgMode;
  } catch {
    /* ignore */
  }
  return "scene";
}

/** Convert MediaPipe facial transform matrix → Euler angles (degrees). */
export function matrixToEulerAngles(matrix: ArrayLike<number>): HeadPose {
  const pitch = Math.atan2(-matrix[9]!, Math.sqrt(matrix[10]! ** 2 + matrix[8]! ** 2));
  const yaw = Math.atan2(matrix[8]!, matrix[10]!);
  const roll = Math.atan2(matrix[1]!, matrix[5]!);
  const rad2deg = 180 / Math.PI;
  // Negate yaw so left/right matches the mirrored selfie preview.
  return {
    pitch: pitch * rad2deg,
    yaw: -yaw * rad2deg,
    roll: roll * rad2deg,
  };
}

function emaPose(prev: HeadPose, next: HeadPose, alpha = EMA_ALPHA): HeadPose {
  return {
    yaw: prev.yaw + alpha * (next.yaw - prev.yaw),
    pitch: prev.pitch + alpha * (next.pitch - prev.pitch),
    roll: prev.roll + alpha * (next.roll - prev.roll),
  };
}

function formatDeg(v: number): string {
  const sign = v > 0.05 ? "+" : v < -0.05 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}°`;
}

/** Map normalized landmark → canvas px under object-fit: cover. */
function landmarkToCanvas(
  lm: NormalizedLandmark,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const cw = canvas.width;
  const ch = canvas.height;
  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let drawW: number;
  let drawH: number;
  let offsetX: number;
  let offsetY: number;
  if (videoAspect > canvasAspect) {
    drawH = ch;
    drawW = ch * videoAspect;
    offsetX = (cw - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = cw;
    drawH = cw / videoAspect;
    offsetX = 0;
    offsetY = (ch - drawH) / 2;
  }

  return {
    x: offsetX + lm.x * drawW,
    y: offsetY + lm.y * drawH,
  };
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: Connection[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  stroke: string,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { start, end } of connections) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    const p = landmarkToCanvas(a, video, canvas);
    const q = landmarkToCanvas(b, video, canvas);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  fill: string,
  radius: number,
  step = 1,
) {
  ctx.fillStyle = fill;
  for (let i = 0; i < landmarks.length; i += step) {
    const lm = landmarks[i];
    if (!lm) continue;
    const p = landmarkToCanvas(lm, video, canvas);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildLoopIndices(connections: Connection[]): number[] {
  if (!connections.length) return [];
  const adj = new Map<number, number[]>();
  for (const { start, end } of connections) {
    if (!adj.has(start)) adj.set(start, []);
    if (!adj.has(end)) adj.set(end, []);
    adj.get(start)!.push(end);
    adj.get(end)!.push(start);
  }
  const first = connections[0]!.start;
  const loop = [first];
  let prev = -1;
  let cur = first;
  for (let i = 0; i < connections.length + 2; i++) {
    const nexts = adj.get(cur) ?? [];
    const next = nexts.find((n) => n !== prev) ?? nexts[0];
    if (next == null || next === first) break;
    loop.push(next);
    prev = cur;
    cur = next;
  }
  return loop;
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  indices: number[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  fill: string,
  stroke: string | null,
  lineWidth: number,
) {
  if (indices.length < 3) return;
  ctx.beginPath();
  indices.forEach((idx, i) => {
    const lm = landmarks[idx];
    if (!lm) return;
    const p = landmarkToCanvas(lm, video, canvas);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

const FEATURE_CONTOURS: { list: () => Connection[]; color: string; width: number }[] = [
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_FACE_OVAL as Connection[],
    color: "rgba(242, 242, 242, 0.9)",
    width: 1.7,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[],
    color: "rgba(255, 120, 140, 0.95)",
    width: 1.4,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[],
    color: "rgba(62, 228, 164, 0.95)",
    width: 1.3,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[],
    color: "rgba(62, 228, 164, 0.95)",
    width: 1.3,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW as Connection[],
    color: "rgba(242, 242, 242, 0.75)",
    width: 1.2,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW as Connection[],
    color: "rgba(242, 242, 242, 0.75)",
    width: 1.2,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS as Connection[],
    color: "rgba(110, 182, 255, 0.95)",
    width: 1.1,
  },
  {
    list: () => FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS as Connection[],
    color: "rgba(110, 182, 255, 0.95)",
    width: 1.1,
  },
];

function drawFeatureContours(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  colorMap?: Record<string, string>,
  widthScale = 1,
) {
  for (const set of FEATURE_CONTOURS) {
    const key = set.color;
    drawConnections(
      ctx,
      landmarks,
      set.list(),
      video,
      canvas,
      colorMap?.[key] ?? set.color,
      set.width * widthScale,
    );
  }
}

/** Draw source into dest with object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  destW: number,
  destH: number,
  sourceW: number,
  sourceH: number,
) {
  const sourceAspect = sourceW / sourceH;
  const destAspect = destW / destH;
  let drawW: number;
  let drawH: number;
  let offsetX: number;
  let offsetY: number;
  if (sourceAspect > destAspect) {
    drawH = destH;
    drawW = destH * sourceAspect;
    offsetX = (destW - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = destW;
    drawH = destW / sourceAspect;
    offsetX = 0;
    offsetY = (destH - drawH) / 2;
  }
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

/**
 * Composite the webcam frame onto a black backdrop using a person confidence mask.
 */
function maskValue01(raw: number, categoryMode: boolean): number {
  if (categoryMode) return raw > 0 ? 1 : 0;
  if (raw > 1) return raw / 255;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/** Selfie frames have the person in the center; invert if the mask says otherwise. */
function shouldInvertPersonMask(
  mask: Float32Array | Uint8Array,
  w: number,
  h: number,
  categoryMode: boolean,
): boolean {
  if (w < 4 || h < 4) return false;
  const at = (x: number, y: number) => maskValue01(mask[y * w + x] ?? 0, categoryMode);
  const center = at(Math.floor(w / 2), Math.floor(h / 2));
  const ix = Math.max(1, Math.floor(w * 0.04));
  const iy = Math.max(1, Math.floor(h * 0.04));
  const edge =
    (at(ix, iy) +
      at(w - 1 - ix, iy) +
      at(ix, h - 1 - iy) +
      at(w - 1 - ix, h - 1 - iy) +
      at(Math.floor(w / 2), iy) +
      at(Math.floor(w / 2), h - 1 - iy)) /
    6;
  return center < edge;
}

function drawPersonOnBlack(
  video: HTMLVideoElement,
  personMask: Float32Array | Uint8Array,
  maskW: number,
  maskH: number,
  categoryMode: boolean,
  invert: boolean,
  work: HTMLCanvasElement,
  alpha: HTMLCanvasElement,
  out: HTMLCanvasElement,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  if (alpha.width !== maskW || alpha.height !== maskH) {
    alpha.width = maskW;
    alpha.height = maskH;
  }
  const actx = alpha.getContext("2d");
  if (!actx) return;
  const maskImage = actx.createImageData(maskW, maskH);
  const md = maskImage.data;
  const n = Math.min(personMask.length, maskW * maskH);
  for (let i = 0; i < n; i++) {
    let person = maskValue01(personMask[i] ?? 0, categoryMode);
    if (invert) person = 1 - person;
    const a = Math.max(0, Math.min(1, (person - 0.12) / 0.45));
    const o = i * 4;
    md[o] = 255;
    md[o + 1] = 255;
    md[o + 2] = 255;
    md[o + 3] = Math.round(a * 255);
  }
  actx.putImageData(maskImage, 0, 0);

  if (work.width !== vw || work.height !== vh) {
    work.width = vw;
    work.height = vh;
  }
  const wctx = work.getContext("2d");
  if (!wctx) return;
  wctx.clearRect(0, 0, vw, vh);
  wctx.globalCompositeOperation = "source-over";
  wctx.drawImage(video, 0, 0, vw, vh);
  wctx.globalCompositeOperation = "destination-in";
  wctx.drawImage(alpha, 0, 0, vw, vh);
  wctx.globalCompositeOperation = "source-over";

  const octx = out.getContext("2d");
  if (!octx) return;
  octx.fillStyle = "#000000";
  octx.fillRect(0, 0, out.width, out.height);
  drawCover(octx, work, out.width, out.height, vw, vh);
}

function drawFaceMask(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  style: FaceMaskStyle,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = window.devicePixelRatio || 1;
  const oval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL as Connection[];
  const tess = FaceLandmarker.FACE_LANDMARKS_TESSELATION as Connection[];

  switch (style) {
    case "mesh":
      drawConnections(ctx, landmarks, tess, video, canvas, "rgba(110, 182, 255, 0.22)", 0.7 * dpr);
      drawFeatureContours(ctx, landmarks, video, canvas, undefined, dpr);
      break;

    case "contours":
      drawFeatureContours(ctx, landmarks, video, canvas, undefined, dpr * 1.15);
      break;

    case "points":
      drawPoints(ctx, landmarks, video, canvas, "rgba(242, 242, 242, 0.35)", 1.1 * dpr, 2);
      drawPoints(ctx, landmarks, video, canvas, "rgba(110, 182, 255, 0.9)", 1.6 * dpr, 8);
      drawFeatureContours(
        ctx,
        landmarks,
        video,
        canvas,
        {
          "rgba(242, 242, 242, 0.9)": "rgba(242, 242, 242, 0.55)",
        },
        dpr * 0.85,
      );
      break;

    case "glow": {
      ctx.save();
      ctx.shadowColor = "rgba(110, 182, 255, 0.85)";
      ctx.shadowBlur = 18 * dpr;
      drawPolygon(
        ctx,
        landmarks,
        buildLoopIndices(oval),
        video,
        canvas,
        "rgba(110, 182, 255, 0.12)",
        "rgba(180, 220, 255, 0.95)",
        2.4 * dpr,
      );
      ctx.restore();
      ctx.save();
      ctx.shadowColor = "rgba(62, 228, 164, 0.7)";
      ctx.shadowBlur = 12 * dpr;
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS as Connection[],
        video,
        canvas,
        "rgba(62, 228, 164, 0.95)",
        1.6 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS as Connection[],
        video,
        canvas,
        "rgba(62, 228, 164, 0.95)",
        1.6 * dpr,
      );
      ctx.restore();
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[],
        video,
        canvas,
        "rgba(255, 150, 170, 0.75)",
        1.3 * dpr,
      );
      break;
    }

    case "neon":
      drawConnections(ctx, landmarks, tess, video, canvas, "rgba(0, 255, 200, 0.12)", 0.6 * dpr);
      drawConnections(ctx, landmarks, oval, video, canvas, "rgba(0, 255, 220, 0.95)", 2 * dpr);
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[],
        video,
        canvas,
        "rgba(255, 40, 180, 0.95)",
        1.8 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[],
        video,
        canvas,
        "rgba(80, 220, 255, 0.95)",
        1.6 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[],
        video,
        canvas,
        "rgba(80, 220, 255, 0.95)",
        1.6 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW as Connection[],
        video,
        canvas,
        "rgba(255, 255, 80, 0.85)",
        1.4 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW as Connection[],
        video,
        canvas,
        "rgba(255, 255, 80, 0.85)",
        1.4 * dpr,
      );
      break;

    case "silhouette":
      drawPolygon(
        ctx,
        landmarks,
        buildLoopIndices(oval),
        video,
        canvas,
        "rgba(0, 0, 0, 0.45)",
        "rgba(242, 242, 242, 0.9)",
        1.8 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[],
        video,
        canvas,
        "rgba(242, 242, 242, 0.7)",
        1.2 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[],
        video,
        canvas,
        "rgba(242, 242, 242, 0.7)",
        1.2 * dpr,
      );
      drawConnections(
        ctx,
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[],
        video,
        canvas,
        "rgba(242, 242, 242, 0.55)",
        1.1 * dpr,
      );
      break;
  }

  drawNoseTracker(ctx, landmarks, video, canvas, dpr);
}

/** MediaPipe face-mesh index for the nose tip. */
const NOSE_TIP = 1;

/** Single high-contrast dot on the nose tip. */
function drawNoseTracker(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  dpr: number,
) {
  const tipLm = landmarks[NOSE_TIP];
  if (!tipLm) return;
  const tip = landmarkToCanvas(tipLm, video, canvas);
  const r = Math.max(5, 6 * dpr);

  ctx.save();
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 56, 56, 0.95)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, 2 * dpr);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.stroke();
  ctx.restore();
}

/** Live webcam feed with MediaPipe Face Landmarker head-pose tracking. */
export function CameraFeed({
  onPoseUpdate,
  onPreviewStreamChange,
  sharePreview = false,
}: {
  onPoseUpdate?: (pose: HeadPose, frame?: HeadPoseFrame) => void;
  /** Canvas-capture stream of the composited stage (matches main view / BG mode). */
  onPreviewStreamChange?: (stream: MediaStream | null) => void;
  /** When false, skip captureStream (dashboard duplicate). */
  sharePreview?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const alphaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastUiAtRef = useRef(0);
  const lastInferAtRef = useRef(0);
  const visionRef = useRef<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null>(null);
  const smoothedRef = useRef<HeadPose>(ZERO_POSE);
  const faceSeenRef = useRef(false);
  const maskStyleRef = useRef<FaceMaskStyle>(readMaskStyle());
  const bgModeRef = useRef<CameraBgMode>(readBgMode() === "black" ? "scene" : readBgMode());
  const maskInvertRef = useRef<boolean | null>(null);
  const lastMatrixRef = useRef<number[] | null>(null);
  const onPoseUpdateRef = useRef(onPoseUpdate);
  const onPreviewStreamChangeRef = useRef(onPreviewStreamChange);
  onPoseUpdateRef.current = onPoseUpdate;
  onPreviewStreamChangeRef.current = onPreviewStreamChange;

  const [logCount, setLogCount] = useState(0);
  const [hasReference, setHasReference] = useState(false);
  const [refAgeMs, setRefAgeMs] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [ready, setReady] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [headPose, setHeadPose] = useState<HeadPose>(ZERO_POSE);
  const [maskStyle, setMaskStyle] = useState<FaceMaskStyle>(() => maskStyleRef.current);
  const [bgMode, setBgMode] = useState<CameraBgMode>(() => bgModeRef.current);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [motionMenuOpen, setMotionMenuOpen] = useState(false);

  function cycleMaskStyle() {
    const idx = MASK_STYLES.findIndex((s) => s.id === maskStyleRef.current);
    const next = MASK_STYLES[(idx + 1) % MASK_STYLES.length]!;
    maskStyleRef.current = next.id;
    setMaskStyle(next.id);
    try {
      localStorage.setItem(MASK_STYLE_KEY, next.id);
    } catch {
      /* ignore */
    }
  }

  function fillPersonBlack() {
    const person = personCanvasRef.current;
    const ctx = person?.getContext("2d");
    if (!ctx || !person) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, person.width, person.height);
  }

  function enableBlackBg() {
    maskInvertRef.current = null;
    bgModeRef.current = "black";
    setBgMode("black");
    fillPersonBlack();
    try {
      localStorage.setItem(BG_MODE_KEY, "black");
    } catch {
      /* ignore */
    }
  }

  function cycleBgMode() {
    const idx = BG_MODES.findIndex((m) => m.id === bgModeRef.current);
    const next = BG_MODES[(idx + 1) % BG_MODES.length]!;
    if (next.id === "black" && !segmenterRef.current) {
      const vision = visionRef.current;
      if (!vision) return;
      setStatus("Loading background remover…");
      void (async () => {
        const opts = {
          runningMode: "VIDEO" as const,
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        };
        try {
          try {
            segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
              ...opts,
              baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL, delegate: "CPU" },
            });
          } catch {
            segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
              ...opts,
              baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL, delegate: "GPU" },
            });
          }
          setSegmenterReady(true);
          setStatus("");
          enableBlackBg();
        } catch {
          setSegmenterReady(false);
          setStatus("Background remover unavailable");
        }
      })();
      return;
    }
    if (next.id === "black") {
      enableBlackBg();
      return;
    }
    bgModeRef.current = next.id;
    setBgMode(next.id);
    try {
      localStorage.setItem(BG_MODE_KEY, next.id);
    } catch {
      /* ignore */
    }
  }

  function setReferencePose() {
    const matrix = lastMatrixRef.current;
    if (!matrix) {
      setStatus("Need a tracked face to set reference");
      return;
    }
    useHeadMotionStore.getState().setReference(matrix);
    setHasReference(true);
    setRefAgeMs(0);
    setStatus("Reference pose set — R_rel logged from now");
  }

  function clearMotionLog() {
    useHeadMotionStore.getState().clearLog();
    setLogCount(0);
    setStatus("Motion log cleared");
  }

  function downloadMotionJson() {
    useHeadMotionStore.getState().downloadJson();
  }

  function downloadMotionCsv() {
    useHeadMotionStore.getState().downloadCsv();
  }

  function shareMotionWithAgent() {
    useHeadMotionStore.getState().requestShareWithAgent();
    setStatus("Shared motion context → Agents tab");
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    workCanvasRef.current = document.createElement("canvas");
    alphaCanvasRef.current = document.createElement("canvas");

    function syncCanvasSize() {
      const stage = personCanvasRef.current?.parentElement;
      const person = personCanvasRef.current;
      const overlay = canvasRef.current;
      if (!stage || !person || !overlay) return;
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (person.width !== w || person.height !== h) {
        person.width = w;
        person.height = h;
      }
      if (overlay.width !== w || overlay.height !== h) {
        overlay.width = w;
        overlay.height = h;
      }
    }

    async function initialize() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not available in this browser.");
        return;
      }

      try {
        setStatus("Loading vision models…");
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        if (cancelled) return;
        visionRef.current = vision;

        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });
        if (cancelled) return;

        setStatus("Requesting camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: "user",
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        syncCanvasSize();
        setReady(true);
        setStatus("Looking for face…");
        track();
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission denied. Allow access and try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera was found on this device.");
        } else {
          setError(err instanceof Error ? err.message : "Could not start camera tracking.");
        }
      }
    }

    function renderPersonFrame(video: HTMLVideoElement, now: number) {
      const person = personCanvasRef.current;
      const work = workCanvasRef.current;
      const alpha = alphaCanvasRef.current;
      const segmenter = segmenterRef.current;
      if (!person || !work || !alpha) return;

      const useBlackBg = bgModeRef.current === "black" && segmenter;

      if (!useBlackBg) {
        const ctx = person.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, person.width, person.height);
        drawCover(ctx, video, person.width, person.height, video.videoWidth, video.videoHeight);
        return;
      }

      try {
        segmenter.segmentForVideo(video, now, (result) => {
          const confidence = result.confidenceMasks;
          const category = result.categoryMask;
          let maskData: Float32Array | Uint8Array | null = null;
          let maskW = 0;
          let maskH = 0;
          let categoryMode = false;

          const personConf = confidence?.[1] ?? confidence?.[0];
          if (personConf) {
            maskData = personConf.getAsFloat32Array();
            maskW = personConf.width;
            maskH = personConf.height;
          } else if (category) {
            maskData = category.getAsUint8Array();
            maskW = category.width;
            maskH = category.height;
            categoryMode = true;
          }

          if (maskData && maskW && maskH) {
            if (maskInvertRef.current == null) {
              maskInvertRef.current = shouldInvertPersonMask(maskData, maskW, maskH, categoryMode);
            }
            drawPersonOnBlack(
              video,
              maskData,
              maskW,
              maskH,
              categoryMode,
              maskInvertRef.current,
              work,
              alpha,
              person,
            );
          }
        });
      } catch {
        /* keep last composited frame */
      }
    }

    function track() {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      const now = performance.now();
      const shouldInfer = now - lastInferAtRef.current >= INFER_INTERVAL_MS;

      if (
        video &&
        canvas &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        syncCanvasSize();

        try {
          renderPersonFrame(video, now);

          if (shouldInfer && landmarker) {
            lastInferAtRef.current = now;
            const result = landmarker.detectForVideo(video, now);
            const landmarks = result.faceLandmarks?.[0];
            const matrix = result.facialTransformationMatrixes?.[0]?.data;
            const ctx = canvas.getContext("2d");

            if (landmarks && landmarks.length && ctx) {
              drawFaceMask(ctx, landmarks, video, canvas, maskStyleRef.current);
            } else if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            if (matrix && matrix.length >= 16) {
              const matrixCopy = Array.from(matrix);
              lastMatrixRef.current = matrixCopy;
              const raw = matrixToEulerAngles(matrix);
              smoothedRef.current = emaPose(smoothedRef.current, raw);
              faceSeenRef.current = true;

              const wallMs = Date.now();
              const pose = { ...smoothedRef.current };
              const sample = useHeadMotionStore.getState().pushSample({
                matrix: matrixCopy,
                yaw: pose.yaw,
                pitch: pose.pitch,
                roll: pose.roll,
                detected: true,
                wallMs,
              });

              if (now - lastUiAtRef.current >= UI_INTERVAL_MS) {
                lastUiAtRef.current = now;
                setHeadPose(pose);
                setTracking(true);
                setStatus("");
                setLogCount(sample.index + 1);
                setHasReference(sample.R_rel != null);
                setRefAgeMs(sample.t_rel_ms);
                useHeadMotionStore.getState().syncHud({
                  sampleCount: sample.index + 1,
                  hasReference: sample.R_rel != null,
                  refAgeMs: sample.t_rel_ms,
                  latestYaw: pose.yaw,
                  latestPitch: pose.pitch,
                  latestRoll: pose.roll,
                  tracking: true,
                });
                onPoseUpdateRef.current?.(pose, {
                  pose,
                  matrix: matrixCopy,
                  R_rel: sample.R_rel,
                  t_rel: sample.t_rel,
                  t_wall_ms: sample.t_wall_ms,
                  t_rel_ms: sample.t_rel_ms,
                  sample,
                });
              }
            } else if (faceSeenRef.current && now - lastUiAtRef.current >= UI_INTERVAL_MS) {
              lastUiAtRef.current = now;
              setTracking(false);
              useHeadMotionStore.getState().setTracking(false);
              setStatus("No face detected");
            }
          }
        } catch {
          /* skip bad frame */
        }
      }

      animationRef.current = requestAnimationFrame(track);
    }

    void initialize();
    window.addEventListener("resize", syncCanvasSize);
    const stageEl = personCanvasRef.current?.parentElement;
    const ro = stageEl ? new ResizeObserver(syncCanvasSize) : null;
    if (stageEl && ro) ro.observe(stageEl);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", syncCanvasSize);
      ro?.disconnect();
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
      const video = videoRef.current;
      if (video) video.srcObject = null;
      stream?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      segmenterRef.current?.close();
      segmenterRef.current = null;
      onPreviewStreamChangeRef.current?.(null);
      setReady(false);
      setTracking(false);
    };
  }, []);

  // Share a canvas-capture preview stream with the live dashboard (matches composited view).
  useEffect(() => {
    if (!ready || !sharePreview) {
      onPreviewStreamChangeRef.current?.(null);
      return;
    }
    const canvas = personCanvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") {
      onPreviewStreamChangeRef.current?.(null);
      return;
    }
    let preview: MediaStream | null = null;
    try {
      preview = canvas.captureStream(24);
      onPreviewStreamChangeRef.current?.(preview);
    } catch {
      onPreviewStreamChangeRef.current?.(null);
    }
    return () => {
      preview?.getTracks().forEach((t) => t.stop());
      onPreviewStreamChangeRef.current?.(null);
    };
  }, [ready, sharePreview]);

  return (
    <div className="camera-feed" aria-label="Live camera feed with head tracking">
      <div className="camera-feed-stage">
        <video
          ref={videoRef}
          className="camera-feed-video-source"
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={personCanvasRef}
          className="camera-feed-person"
          aria-hidden
          style={{ opacity: ready && !error ? 1 : 0 }}
        />
        <canvas
          ref={canvasRef}
          className="camera-feed-mask"
          aria-hidden
          style={{ opacity: ready && !error ? 1 : 0 }}
        />
      </div>

      {ready && !error ? (
        <div className="camera-head-hud-stack">
          <div className="camera-head-hud" aria-live="polite">
            <div className="camera-head-hud-title">
              Head pose
              <span className={`camera-head-dot${tracking ? " camera-head-dot-on" : ""}`} aria-hidden />
            </div>
            <div className="camera-head-row">
              <span>Yaw</span>
              <strong>{formatDeg(headPose.yaw)}</strong>
            </div>
            <div className="camera-head-row">
              <span>Pitch</span>
              <strong>{formatDeg(headPose.pitch)}</strong>
            </div>
            <div className="camera-head-row">
              <span>Roll</span>
              <strong>{formatDeg(headPose.roll)}</strong>
            </div>
            <div className="camera-head-row">
              <span>Log</span>
              <strong>{logCount}</strong>
            </div>
            <div className="camera-head-row">
              <span>R_rel</span>
              <strong>
                {hasReference
                  ? refAgeMs != null
                    ? `+${(refAgeMs / 1000).toFixed(1)}s`
                    : "on"
                  : "unset"}
              </strong>
            </div>
            <button
              type="button"
              className="camera-mask-btn"
              onClick={cycleBgMode}
              title={
                segmenterReady
                  ? "Toggle full scene vs black background"
                  : "Load background remover, then toggle full scene vs black"
              }
            >
              BG · {BG_MODES.find((m) => m.id === bgMode)?.label ?? bgMode}
            </button>
            <button
              type="button"
              className="camera-mask-btn"
              onClick={cycleMaskStyle}
              title="Cycle face mask style"
            >
              Mask · {MASK_STYLES.find((s) => s.id === maskStyle)?.label ?? maskStyle}
            </button>
            <button
              type="button"
              className={`camera-mask-btn${motionMenuOpen ? " camera-mask-btn-active" : ""}`}
              onClick={() => setMotionMenuOpen((v) => !v)}
              aria-expanded={motionMenuOpen}
              aria-controls="camera-motion-menu"
              title="Motion log commands"
            >
              Motion · {motionMenuOpen ? "Hide" : "Menu"}
            </button>
            {status ? <p className="camera-head-hint">{status}</p> : null}
          </div>

          {motionMenuOpen ? (
            <div
              id="camera-motion-menu"
              className="camera-head-hud camera-head-hud-motion"
              role="dialog"
              aria-label="Motion log"
            >
              <div className="camera-head-hud-title">Motion log</div>
              <div className="camera-head-row">
                <span>Samples</span>
                <strong>{logCount}</strong>
              </div>
              <div className="camera-head-row">
                <span>Reference</span>
                <strong>{hasReference ? "set" : "unset"}</strong>
              </div>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={setReferencePose}
                title="Set current pose as reference (T0) for relative rotation matrices"
                disabled={!tracking}
              >
                Set reference
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={downloadMotionJson}
                title="Download motion log JSON (matrices for retrospective correction)"
                disabled={logCount === 0}
              >
                Download JSON
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={downloadMotionCsv}
                title="Download motion log CSV"
                disabled={logCount === 0}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={shareMotionWithAgent}
                title="Open Agents tab and send a summary of the recent motion log"
                disabled={logCount === 0}
              >
                Share with agent
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={clearMotionLog}
                title="Clear recorded samples (keeps reference)"
                disabled={logCount === 0}
              >
                Clear log
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!ready && !error ? <p className="camera-feed-status">{status || "Starting camera…"}</p> : null}
      {error ? <p className="camera-feed-status camera-feed-error">{error}</p> : null}
    </div>
  );
}
