/** Area on the ground (XZ plane) that scene pieces occupy, in world units. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A square board centred under the footprint, with `margin` beyond its longer side. */
export function squareBoard(footprint: Footprint, margin: number) {
  const width = footprint.maxX - footprint.minX;
  const depth = footprint.maxZ - footprint.minZ;
  return {
    centerX: (footprint.minX + footprint.maxX) / 2,
    centerZ: (footprint.minZ + footprint.maxZ) / 2,
    size: Math.max(width, depth) + 2 * margin,
  };
}
