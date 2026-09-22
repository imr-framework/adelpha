import { describe, expect, it } from "vitest";

import { dftMagnitudeSpectrum, sampleJohnsonNoise } from "./noiseMath";

describe("dftMagnitudeSpectrum", () => {
  it("returns empty for fewer than two samples", () => {
    expect(dftMagnitudeSpectrum([])).toEqual([]);
    expect(dftMagnitudeSpectrum([1])).toEqual([]);
  });

  it("returns n/2 one-sided bins", () => {
    expect(dftMagnitudeSpectrum(new Array(64).fill(0))).toHaveLength(32);
    // Odd lengths floor, matching Math.floor(n / 2).
    expect(dftMagnitudeSpectrum(new Array(65).fill(0))).toHaveLength(32);
  });

  it("puts a pure sine's energy in its own bin", () => {
    const n = 64;
    const k = 8;
    const samples = Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * k * t) / n));
    const spectrum = dftMagnitudeSpectrum(samples);

    const peak = spectrum.indexOf(Math.max(...spectrum));
    expect(peak).toBe(k);
    // A unit sine splits across the ± pair, so the one-sided bin holds ~0.5.
    expect(spectrum[k]).toBeCloseTo(0.5, 6);
    expect(spectrum[k + 1]).toBeCloseTo(0, 6);
  });

  it("maps a DC signal to bin 0 only", () => {
    const spectrum = dftMagnitudeSpectrum(new Array(32).fill(2));
    expect(spectrum[0]).toBeCloseTo(2, 6);
    expect(Math.max(...spectrum.slice(1))).toBeCloseTo(0, 6);
  });
});

describe("sampleJohnsonNoise", () => {
  it("returns exactly n samples", () => {
    expect(sampleJohnsonNoise(25, 240)).toHaveLength(240);
    expect(sampleJohnsonNoise(25, 0)).toHaveLength(0);
  });

  it("scales sigma with the square root of absolute temperature", () => {
    const n = 20000;
    const sigma = (xs: number[]) => Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / xs.length);

    // 300 K reference: sigma is 0.28 by definition.
    expect(sigma(sampleJohnsonNoise(300 - 273.15, n))).toBeCloseTo(0.28, 1);

    // Quadrupling absolute temperature doubles sigma.
    const cold = sigma(sampleJohnsonNoise(300 - 273.15, n));
    const hot = sigma(sampleJohnsonNoise(1200 - 273.15, n));
    expect(hot / cold).toBeCloseTo(2, 0);
  });

  it("clamps absurdly cold input at 1 K rather than producing NaN", () => {
    const samples = sampleJohnsonNoise(-500, 128);
    expect(samples.every((v) => Number.isFinite(v))).toBe(true);
  });
});
