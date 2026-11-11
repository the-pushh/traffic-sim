/** World units per road tile (City Kit tiles are 1 × 1 in the source models). */
export const TILE_SIZE = 4;
/** The board is this many tiles on each side. */
export const BOARD_TILES = 16;

/**
 * The square board every scene sits on, centred on the origin. Its top face is y = 0.
 * Sized for multi-junction scenes rather than fitted to one scene's roads.
 */
export const groundBoard = {
  /** Side length in world units: 16 × 16 road tiles. */
  size: BOARD_TILES * TILE_SIZE,
  cornerRadius: 4,
  /** Flat slab thickness; the bevel adds `bevel` above and below. */
  thickness: 0.4,
  /** Soft rounding on the top and bottom edges. */
  bevel: 0.2,
} as const;

/** Board tiles (x east, y up, z south; origin at the north-west corner) → world units centred on the board. */
export function boardToWorld([x, y, z]: [number, number, number]): [number, number, number] {
  const half = BOARD_TILES / 2;
  return [(x - half) * TILE_SIZE, y * TILE_SIZE, (z - half) * TILE_SIZE];
}
