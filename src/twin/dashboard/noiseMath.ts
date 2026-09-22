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
