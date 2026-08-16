import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  downloadTextFile,
  HeadMotionRecorder,
  type HeadMotionSample,
} from "./headMotionLog";

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
  { id: "mesh", label: "Mesh" },
  { id: "contours", label: "Contours" },
  { id: "points", label: "Points" },
  { id: "glow", label: "Glow" },
  { id: "neon", label: "Neon" },
  { id: "silhouette", label: "Silhouette" },
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

const UI_HZ = 20;
const UI_INTERVAL_MS = 1000 / UI_HZ;
const EMA_ALPHA = 0.32;

const ZERO_POSE: HeadPose = { yaw: 0, pitch: 0, roll: 0 };

function readMaskStyle(): FaceMaskStyle {
  try {
    const v = localStorage.getItem(MASK_STYLE_KEY);
    if (MASK_STYLES.some((s) => s.id === v)) return v as FaceMaskStyle;
  } catch {
    /* ignore */
  }
  return "mesh";
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
function drawPersonOnBlack(
  video: HTMLVideoElement,
  personMask: Float32Array | Uint8Array,
  maskW: number,
  maskH: number,
  categoryMode: boolean,
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
  for (let i = 0; i < personMask.length; i++) {
    const raw = personMask[i] ?? 0;
    const conf = categoryMode ? (raw > 0 ? 1 : 0) : raw;
    // Soft edge around the person silhouette.
    const a = Math.max(0, Math.min(1, (conf - 0.2) / 0.45));
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

/** MediaPipe face-mesh indices along the nose bridge → tip → alae. */
const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1] as const;
const NOSE_TIP = 1;
const NOSE_ALEA = [98, 327] as const;

/** Highlight nose tip + bridge so motion tracking is visually obvious. */
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

  ctx.save();

  ctx.beginPath();
  let started = false;
  for (const idx of NOSE_BRIDGE) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const p = landmarkToCanvas(lm, video, canvas);
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  if (started) {
    ctx.strokeStyle = "rgba(255, 196, 72, 0.95)";
    ctx.lineWidth = 2.2 * dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255, 180, 40, 0.75)";
    ctx.shadowBlur = 10 * dpr;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  for (const idx of NOSE_ALEA) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const p = landmarkToCanvas(lm, video, canvas);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.strokeStyle = "rgba(255, 196, 72, 0.55)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 220, 120, 0.95)";
    ctx.fill();
  }

  const r = 7 * dpr;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 90, 70, 0.95)";
  ctx.lineWidth = 2 * dpr;
  ctx.shadowColor = "rgba(255, 70, 50, 0.85)";
  ctx.shadowBlur = 12 * dpr;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 240, 230, 0.98)";
  ctx.shadowBlur = 8 * dpr;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 240, 220, 0.9)";
  ctx.lineWidth = 1.2 * dpr;
  ctx.beginPath();
  ctx.moveTo(tip.x - r * 1.6, tip.y);
  ctx.lineTo(tip.x - r * 0.45, tip.y);
  ctx.moveTo(tip.x + r * 0.45, tip.y);
  ctx.lineTo(tip.x + r * 1.6, tip.y);
  ctx.moveTo(tip.x, tip.y - r * 1.6);
  ctx.lineTo(tip.x, tip.y - r * 0.45);
  ctx.moveTo(tip.x, tip.y + r * 0.45);
  ctx.lineTo(tip.x, tip.y + r * 1.6);
  ctx.stroke();

  ctx.restore();
}

/** Live webcam feed with MediaPipe Face Landmarker head-pose tracking. */
export function CameraFeed({
  onPoseUpdate,
  onPreviewStreamChange,
}: {
  onPoseUpdate?: (pose: HeadPose, frame?: HeadPoseFrame) => void;
  /** Canvas-capture stream of the composited stage (matches main view / BG mode). */
  onPreviewStreamChange?: (stream: MediaStream | null) => void;
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
  const smoothedRef = useRef<HeadPose>(ZERO_POSE);
  const faceSeenRef = useRef(false);
  const maskStyleRef = useRef<FaceMaskStyle>(readMaskStyle());
  const bgModeRef = useRef<CameraBgMode>(readBgMode());
  const recorderRef = useRef(new HeadMotionRecorder());
  const lastMatrixRef = useRef<number[] | null>(null);
  const onPoseUpdateRef = useRef(onPoseUpdate);
  const onPreviewStreamChangeRef = useRef(onPreviewStreamChange);
  onPoseUpdateRef.current = onPoseUpdate;
  onPreviewStreamChangeRef.current = onPreviewStreamChange;

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [ready, setReady] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [headPose, setHeadPose] = useState<HeadPose>(ZERO_POSE);
  const [maskStyle, setMaskStyle] = useState<FaceMaskStyle>(() => maskStyleRef.current);
  const [bgMode, setBgMode] = useState<CameraBgMode>(() => bgModeRef.current);
  const [segmenterReady, setSegmenterReady] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [hasReference, setHasReference] = useState(false);
  const [refAgeMs, setRefAgeMs] = useState<number | null>(null);
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

  function cycleBgMode() {
    const idx = BG_MODES.findIndex((m) => m.id === bgModeRef.current);
    const next = BG_MODES[(idx + 1) % BG_MODES.length]!;
    if (next.id === "black" && !segmenterRef.current) {
      bgModeRef.current = "scene";
      setBgMode("scene");
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
    recorderRef.current.setReference(matrix);
    setHasReference(true);
    setRefAgeMs(0);
    setStatus("Reference pose set — R_rel logged from now");
  }

  function clearMotionLog() {
    recorderRef.current.clear();
    setSampleCount(0);
    setStatus("Motion log cleared");
  }

  function downloadMotionJson() {
    const payload = recorderRef.current.toExport();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(
      `adelpha-head-motion-${stamp}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
      "application/json",
    );
  }

  function downloadMotionCsv() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(
      `adelpha-head-motion-${stamp}.csv`,
      `${recorderRef.current.toCsv()}\n`,
      "text/csv",
    );
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
      const w = Math.max(1, Math.round(rect.width * (window.devicePixelRatio || 1)));
      const h = Math.max(1, Math.round(rect.height * (window.devicePixelRatio || 1)));
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

        try {
          setStatus("Loading background remover…");
          segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: SEGMENTER_MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          });
          if (!cancelled) setSegmenterReady(true);
        } catch {
          segmenterRef.current = null;
          if (!cancelled) {
            setSegmenterReady(false);
            if (bgModeRef.current === "black") {
              bgModeRef.current = "scene";
              setBgMode("scene");
            }
          }
        }
        if (cancelled) return;

        setStatus("Requesting camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
          drawPersonOnBlack(video, maskData, maskW, maskH, categoryMode, work, alpha, person);
        } else {
          const ctx = person.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, person.width, person.height);
            drawCover(ctx, video, person.width, person.height, video.videoWidth, video.videoHeight);
          }
        }

        confidence?.forEach((m) => m.close());
        category?.close();
      });
    }

    function track() {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      const now = performance.now();

      if (
        video &&
        canvas &&
        landmarker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        syncCanvasSize();

        try {
          renderPersonFrame(video, now);

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
            const sample = recorderRef.current.push({
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
              setSampleCount(recorderRef.current.sampleCount);
              setHasReference(recorderRef.current.hasReference);
              setRefAgeMs(sample.t_rel_ms);
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
            setStatus("No face detected");
          }
        } catch {
          /* skip bad frame */
        }
      }

      animationRef.current = requestAnimationFrame(track);
    }

    void initialize();
    window.addEventListener("resize", syncCanvasSize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", syncCanvasSize);
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
    if (!ready) {
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
  }, [ready]);

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
              <strong>{sampleCount}</strong>
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
                  : "Background remover unavailable — full scene only"
              }
              disabled={!segmenterReady}
            >
              BG · {BG_MODES.find((m) => m.id === bgMode)?.label ?? bgMode}
              {!segmenterReady ? " (n/a)" : ""}
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
                <strong>{sampleCount}</strong>
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
                disabled={sampleCount === 0}
              >
                Download JSON
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={downloadMotionCsv}
                title="Download motion log CSV"
                disabled={sampleCount === 0}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="camera-mask-btn"
                onClick={clearMotionLog}
                title="Clear recorded samples (keeps reference)"
                disabled={sampleCount === 0}
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
