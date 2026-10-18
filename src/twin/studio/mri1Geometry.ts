/** O'Reilly 27 cm bore Halbach geometry from HalbachMRIDesigner/examples/mri1.json. */

export type HalbachRingSpec = {
  id: number;
  radius: number;
  numMagnets: number;
};

export type HalbachSliceSpec = {
  position: number;
  innerRadius: number;
  outerRadius: number;
  rings: number[];
  standWidth?: number;
  standHeight?: number;
};

export type HalbachGeometry = {
  rings: HalbachRingSpec[];
  slices: HalbachSliceSpec[];
  mirrorSlices: boolean;
  standWidth: number;
  standHeight: number;
  numConnectionRods: number;
  connectionRodsArcRadius: number;
  connectionRodsDiameter: number;
  shimTrayHeight: number;
  shimTrayAngle: number;
  shimTrayRadius: number;
};

const MRI1_RADII = [148, 151, 154, 156, 159, 162, 165, 168, 171, 174, 177, 180, 183, 186, 189, 192, 195, 198, 201, 204, 207, 210, 213, 216, 219, 221];

const MRI1_SLICES: Array<[number, number[], number, number]> = [
  [220, [0, 7], 240, 280],
  [198, [0, 7], 0, 0],
  [176, [1, 8], 0, 0],
  [154, [12, 19], 0, 0],
  [132, [9, 16], 0, 0],
  [110, [18, 25], 0, 0],
  [88, [13, 20], 0, 0],
  [66, [13, 20], 0, 0],
  [44, [16, 23], 0, 0],
  [22, [16, 23], 0, 0],
  [0, [17, 25], 240, 280],
];

export const MRI1_MAGNET = { magnet_mm: 12, br_t: 1.3, mur: 1 };

export function mri1Geometry(): HalbachGeometry {
  const rings: HalbachRingSpec[] = MRI1_RADII.map((radius, id) => ({
    id,
    radius,
    numMagnets: 50 + id,
  }));
  return {
    rings,
    slices: MRI1_SLICES.map(([position, ringIds, standWidth, standHeight]) => ({
      position,
      innerRadius: 128,
      outerRadius: 261,
      rings: ringIds,
      standWidth,
      standHeight,
    })),
    mirrorSlices: true,
    standWidth: 240,
    standHeight: 280,
    numConnectionRods: 12,
    connectionRodsArcRadius: 246,
    connectionRodsDiameter: 5,
    shimTrayHeight: 14,
    shimTrayAngle: 25,
    shimTrayRadius: 25,
  };
}

export function cloneGeometry(geometry: HalbachGeometry): HalbachGeometry {
  return {
    ...geometry,
    rings: geometry.rings.map((ring) => ({ ...ring })),
    slices: geometry.slices.map((slice) => ({ ...slice, rings: [...slice.rings] })),
  };
}

export function uniformGeometry(input: {
  inner_radius_mm: number;
  magnets: number;
  rings: number;
  ring_sep_mm: number;
  outer_ring: boolean;
  outer_offset_mm: number;
  outer_extra: number;
  magnet_mm: number;
}): HalbachGeometry {
  const catalog: HalbachRingSpec[] = [{ id: 0, radius: input.inner_radius_mm, numMagnets: input.magnets }];
  const ringIds = [0];
  if (input.outer_ring) {
    catalog.push({
      id: 1,
      radius: input.inner_radius_mm + input.outer_offset_mm,
      numMagnets: input.magnets + input.outer_extra,
    });
    ringIds.push(1);
  }
  const length = input.rings <= 1 ? 0 : (input.rings - 1) * input.ring_sep_mm;
  const positions = input.rings <= 1 ? [0] : Array.from({ length: input.rings }, (_, index) => -length / 2 + index * input.ring_sep_mm);
  const maxRadius = Math.max(...catalog.map((ring) => ring.radius));
  const innerRadius = Math.max(20, input.inner_radius_mm - input.magnet_mm);
  const outerRadius = maxRadius + input.magnet_mm + 18;
  return {
    rings: catalog,
    slices: positions.map((position) => ({
      position: Math.round(position * 10) / 10,
      innerRadius,
      outerRadius,
      rings: [...ringIds],
      standWidth: 0,
      standHeight: 0,
    })),
    mirrorSlices: false,
    standWidth: 0,
    standHeight: 0,
    numConnectionRods: 0,
    connectionRodsArcRadius: Math.max(40, outerRadius - 15),
    connectionRodsDiameter: 5,
    shimTrayHeight: 14,
    shimTrayAngle: 25,
    shimTrayRadius: Math.max(20, outerRadius - 10),
  };
}

export function parseRingIds(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id));
}
