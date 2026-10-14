/** Box–Muller Gaussian sample (Johnson / thermal noise). */
export function gaussianSample(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Time-domain Johnson–Nyquist thermal noise.
 * Amplitude scales with √T (relative to 300 K).
 */
export function sampleJohnsonNoise(tempC: number, n: number): number[] {
  const tK = Math.max(1, tempC + 273.15);
  const sigma = 0.28 * Math.sqrt(tK / 300);
  return Array.from({ length: n }, () => sigma * gaussianSample());
}

/** One-sided DFT magnitude spectrum of a real-valued time series. */
export function dftMagnitudeSpectrum(samples: number[]): number[] {
  const n = samples.length;
  if (n < 2) return [];
  const bins = Math.floor(n / 2);
  const out = new Array<number>(bins);
  for (let k = 0; k < bins; k++) {
    let re = 0;
    let im = 0;
    const omega = (2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      const a = omega * t;
      re += samples[t]! * Math.cos(a);
      im -= samples[t]! * Math.sin(a);
    }
    out[k] = Math.sqrt(re * re + im * im) / n;
  }
  return out;
}

/** Illustrative EMI magnitude: flat white-noise floor with narrow interference peaks.
 * Arbitrary units, not a measured or calibrated PSD. The strongest spike marks peakBin.
 */
export function sampleEmiSpectrum(bins: number, peakBin: number, rms: number): number[] {
  const amplitude = Math.max(0.15, Math.min(1.5, rms / 0.01));
  return Array.from({ length: bins }, (_, i) => {
    const floor = 0.035 + 0.025 * Math.abs(gaussianSample());
    const peak = i === peakBin ? 0.75 * amplitude : 0;
    const secondary = i === Math.round((bins - 1) * 0.23) || i === Math.round((bins - 1) * 0.61) ? 0.23 * amplitude : 0;
    return floor + peak + secondary;
  });
}
