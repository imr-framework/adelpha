/**
 * Field-visualization layers offered by the 3D Model settings.
 *
 * `binding` records how far each layer actually reaches into the app, so the UI
 * can be honest about what a control does:
 *
 * - `scene`     the twin viewport renders this layer today.
 * - `draft`     stored as a local preference; the scene has no mesh for it yet.
 * - `planned`   listed for structure only and rendered disabled.
 *
 * Adding B₁, SAR, or a gradient field later means changing `binding` here and
 * wiring the scene — the settings page needs no layout change.
 */
export type FieldLayerBinding = "scene" | "draft" | "planned";

export type FieldLayerId = "none" | "temperature" | "b0" | "gradients" | "b1" | "emi" | "sar";

export type FieldLayer = {
  id: FieldLayerId;
  label: string;
  /** Physical quantity, shown in mono next to the label. */
  quantity: string | null;
  binding: FieldLayerBinding;
  description: string;
};

export const FIELD_LAYERS: FieldLayer[] = [
  {
    id: "none",
    label: "None",
    quantity: null,
    binding: "scene",
    description: "Render the assembly without a field overlay.",
  },
  {
    id: "temperature",
    label: "Thermal map",
    quantity: "°C",
    binding: "scene",
    description: "Shades the magnet from the twin magnet-temperature stream. Independent of sensor overlays.",
  },
  {
    id: "b0",
    label: "B₀ field map",
    quantity: "T",
    binding: "draft",
    description: "Static field homogeneity across the bore.",
  },
  {
    id: "gradients",
    label: "Gradient coils",
    quantity: "mT/m",
    binding: "draft",
    description: "Highlights gradient windings and their drive axis.",
  },
  {
    id: "b1",
    label: "B₁ transmit map",
    quantity: "µT",
    binding: "planned",
    description: "Transmit field uniformity from the RF coil.",
  },
  {
    id: "emi",
    label: "EMI hotspots",
    quantity: "V",
    binding: "planned",
    description: "Interference coupling by assembly region.",
  },
  {
    id: "sar",
    label: "SAR",
    quantity: "W/kg",
    binding: "planned",
    description: "Specific absorption rate in the imaging volume.",
  },
];

export function fieldLayer(id: string): FieldLayer {
  return FIELD_LAYERS.find((layer) => layer.id === id) ?? FIELD_LAYERS[0];
}
