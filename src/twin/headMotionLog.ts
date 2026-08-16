/** Head-motion log for retrospective correction (camera / MediaPipe demo). */

export type HeadMotionSample = {
  /** Monotonic sample index within this session. */
  index: number;
  /** Wall-clock epoch ms. */
  t_wall_ms: number;
  /** Ms since reference pose was set; null if no reference yet. */
  t_rel_ms: number | null;
  detected: boolean;
  /**
   * Absolute facial transform from MediaPipe (column-major 4×4).
   * Upper-left 3×3 = R, indices 12,13,14 = translation.
   */
  matrix: number[];
  /** Rotation relative to reference, row-major 3×3 (9 floats). */
  R_rel: number[] | null;
  /** Translation relative to reference (3 floats). */
  t_rel: number[] | null;
  /** Display Euler (deg), smoothed — not for correction. */
  yaw: number;
  pitch: number;
  roll: number;
};

export type HeadMotionExport = {
  format: "adelpha-head-motion-v1";
  convention: {
    matrix_layout: "column-major-4x4";
    R_rel_layout: "row-major-3x3";
    t_rel_layout: "xyz";
    units: "MediaPipe facial transform (camera frame); R_rel = R_ref^T · R";
    note: "Demo optical log from laptop webcam. Calibrate to scanner RAS/LPS before using for MRI correction.";
  };
  reference: {
    set_at_wall_ms: number | null;
    matrix: number[] | null;
  };
  sample_count: number;
  samples: HeadMotionSample[];
};

const MAX_SAMPLES = 18_000;

export function extractRotationTranslation(matrix: ArrayLike<number>): {
  R: number[];
  t: number[];
} {
  // Column-major 4×4 → R as row-major 3×3, t as xyz
  const R = [
    matrix[0]!,
    matrix[4]!,
    matrix[8]!,
    matrix[1]!,
    matrix[5]!,
    matrix[9]!,
    matrix[2]!,
    matrix[6]!,
    matrix[10]!,
  ];
  const t = [matrix[12]!, matrix[13]!, matrix[14]!];
  return { R, t };
}

/** Orthonormalize a row-major 3×3 via Gram–Schmidt (stabilize noisy R). */
export function orthonormalizeR(R: number[]): number[] {
  const r00 = R[0]!;
  const r01 = R[1]!;
  const r10 = R[3]!;
  const r11 = R[4]!;
  const r20 = R[6]!;
  const r21 = R[7]!;
  // x column
  let x0 = r00;
  let x1 = r10;
  let x2 = r20;
  let xn = Math.hypot(x0, x1, x2) || 1;
  x0 /= xn;
  x1 /= xn;
  x2 /= xn;
  // y column, reject x
  let y0 = r01;
  let y1 = r11;
  let y2 = r21;
  const xd = x0 * y0 + x1 * y1 + x2 * y2;
  y0 -= xd * x0;
  y1 -= xd * x1;
  y2 -= xd * x2;
  let yn = Math.hypot(y0, y1, y2) || 1;
  y0 /= yn;
  y1 /= yn;
  y2 /= yn;
  // z = x × y
  const z0 = x1 * y2 - x2 * y1;
  const z1 = x2 * y0 - x0 * y2;
  const z2 = x0 * y1 - x1 * y0;
  return [x0, y0, z0, x1, y1, z1, x2, y2, z2];
}

/** R_rel = R_ref^T · R (both row-major 3×3). */
export function relativeRotation(R_ref: number[], R: number[]): number[] {
  const Rt = [
    R_ref[0]!,
    R_ref[3]!,
    R_ref[6]!,
    R_ref[1]!,
    R_ref[4]!,
    R_ref[7]!,
    R_ref[2]!,
    R_ref[5]!,
    R_ref[8]!,
  ];
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] =
        Rt[i * 3]! * R[j]! +
        Rt[i * 3 + 1]! * R[3 + j]! +
        Rt[i * 3 + 2]! * R[6 + j]!;
    }
  }
  return out;
}

export function relativeTranslation(
  R_ref: number[],
  t_ref: number[],
  t: number[],
): number[] {
  // t_rel = R_ref^T · (t - t_ref)
  const dx = t[0]! - t_ref[0]!;
  const dy = t[1]! - t_ref[1]!;
  const dz = t[2]! - t_ref[2]!;
  return [
    R_ref[0]! * dx + R_ref[3]! * dy + R_ref[6]! * dz,
    R_ref[1]! * dx + R_ref[4]! * dy + R_ref[7]! * dz,
    R_ref[2]! * dx + R_ref[5]! * dy + R_ref[8]! * dz,
  ];
}

function copy16(matrix: ArrayLike<number>): number[] {
  const out = new Array<number>(16);
  for (let i = 0; i < 16; i++) out[i] = matrix[i]!;
  return out;
}

export class HeadMotionRecorder {
  private samples: HeadMotionSample[] = [];
  private nextIndex = 0;
  private refMatrix: number[] | null = null;
  private refR: number[] | null = null;
  private refT: number[] | null = null;
  private refWallMs: number | null = null;

  get sampleCount() {
    return this.samples.length;
  }

  get hasReference() {
    return this.refMatrix != null;
  }

  get referenceWallMs() {
    return this.refWallMs;
  }

  setReference(matrix: ArrayLike<number>, wallMs = Date.now()) {
    this.refMatrix = copy16(matrix);
    const { R, t } = extractRotationTranslation(this.refMatrix);
    this.refR = orthonormalizeR(R);
    this.refT = t;
    this.refWallMs = wallMs;
  }

  clearReference() {
    this.refMatrix = null;
    this.refR = null;
    this.refT = null;
    this.refWallMs = null;
  }

  clear() {
    this.samples = [];
    this.nextIndex = 0;
  }

  push(args: {
    matrix: ArrayLike<number>;
    yaw: number;
    pitch: number;
    roll: number;
    detected: boolean;
    wallMs?: number;
  }): HeadMotionSample {
    const t_wall_ms = args.wallMs ?? Date.now();
    const matrix = copy16(args.matrix);
    let R_rel: number[] | null = null;
    let t_rel: number[] | null = null;
    let t_rel_ms: number | null = null;

    if (this.refR && this.refT && this.refWallMs != null) {
      const { R, t } = extractRotationTranslation(matrix);
      const Rn = orthonormalizeR(R);
      R_rel = relativeRotation(this.refR, Rn);
      t_rel = relativeTranslation(this.refR, this.refT, t);
      t_rel_ms = t_wall_ms - this.refWallMs;
    }

    const sample: HeadMotionSample = {
      index: this.nextIndex++,
      t_wall_ms,
      t_rel_ms,
      detected: args.detected,
      matrix,
      R_rel,
      t_rel,
      yaw: args.yaw,
      pitch: args.pitch,
      roll: args.roll,
    };

    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    return sample;
  }

  toExport(): HeadMotionExport {
    return {
      format: "adelpha-head-motion-v1",
      convention: {
        matrix_layout: "column-major-4x4",
        R_rel_layout: "row-major-3x3",
        t_rel_layout: "xyz",
        units:
          "MediaPipe facial transform (camera frame); R_rel = R_ref^T · R",
        note: "Demo optical log from laptop webcam. Calibrate to scanner RAS/LPS before using for MRI correction.",
      },
      reference: {
        set_at_wall_ms: this.refWallMs,
        matrix: this.refMatrix ? [...this.refMatrix] : null,
      },
      sample_count: this.samples.length,
      samples: this.samples.map((s) => ({
        ...s,
        matrix: [...s.matrix],
        R_rel: s.R_rel ? [...s.R_rel] : null,
        t_rel: s.t_rel ? [...s.t_rel] : null,
      })),
    };
  }

  toCsv(): string {
    const header = [
      "index",
      "t_wall_ms",
      "t_rel_ms",
      "detected",
      "yaw_deg",
      "pitch_deg",
      "roll_deg",
      "R00",
      "R01",
      "R02",
      "R10",
      "R11",
      "R12",
      "R20",
      "R21",
      "R22",
      "tx",
      "ty",
      "tz",
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "m9",
      "m10",
      "m11",
      "m12",
      "m13",
      "m14",
      "m15",
    ].join(",");

    const lines = this.samples.map((s) => {
      const { R, t } = extractRotationTranslation(s.matrix);
      const Rr = s.R_rel ?? R;
      const tr = s.t_rel ?? t;
      return [
        s.index,
        s.t_wall_ms,
        s.t_rel_ms ?? "",
        s.detected ? 1 : 0,
        s.yaw.toFixed(4),
        s.pitch.toFixed(4),
        s.roll.toFixed(4),
        ...Rr.map((v) => v.toFixed(8)),
        ...tr.map((v) => v.toFixed(8)),
        ...s.matrix.map((v) => v.toFixed(8)),
      ].join(",");
    });

    return [header, ...lines].join("\n");
  }
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
