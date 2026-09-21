export function linePath(
  values: number[],
  min: number,
  max: number,
  width: number,
  height: number,
) {
  const den = Math.max(values.length - 1, 1);
  const span = Math.max(max - min, 1e-6);
  const pad = Math.min(6, height * 0.06);
  const usable = Math.max(height - pad * 2, 1);
  return values
    .map((v, i) => {
      const x = (i / den) * width;
      const y = pad + usable - ((v - min) / span) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function linePathOffset(
  values: number[],
  min: number,
  max: number,
  width: number,
  height: number,
  ox: number,
  oy: number,
) {
  const den = Math.max(values.length - 1, 1);
  const span = Math.max(max - min, 1e-6);
  const pad = Math.min(8, height * 0.04);
  const usable = Math.max(height - pad * 2, 1);
  return values
    .map((v, i) => {
      const x = ox + (i / den) * width;
      const y = oy + pad + usable - ((v - min) / span) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
