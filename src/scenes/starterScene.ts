import type { Footprint } from './groundBoard';

/**
 * The first starter scene: a short straight road built from supplied road
 * pieces, a parallel road surface using a supplied road texture, and one
 * supplied vehicle. World units are road-tile based: one City Kit Roads tile
 * is scaled to `road.tileSize` units. Y is up; vehicles face +Z.
 *
 * URLs are relative to the app's base path (Vite `public/`).
 */
export const starterScene = {
  road: {
    pieceUrl: 'models/roads/road-straight.glb',
    surfaceTextureUrl: 'textures/roadTexture_01.png',
    /** Size of one road tile in world units (source tile is 1 × 1). */
    tileSize: 4,
    /** Number of road-piece tiles laid end to end along Z. */
    tileCount: 6,
    /** X offset of the textured road surface strip, parallel to the piece road. */
    surfaceOffsetX: 6,
  },
  vehicle: {
    url: 'models/vehicles/sedan.glb',
    /** Uniform scale applied to the source model. */
    scale: 0.55,
    /** Lane centre offset from the road centre line, in world units. */
    laneOffsetX: 0.75,
    positionZ: 0,
  },
  /** Square board the scene sits on; its top face is y = 0. */
  ground: {
    /** Clear space between the outermost road and the board's edge. */
    margin: 4,
    cornerRadius: 3,
    thickness: 1.2,
  },
} as const;

/** Ground area covered by the starter roads (the vehicle sits inside the road). */
export function starterFootprint(): Footprint {
  const { tileSize, tileCount, surfaceOffsetX } = starterScene.road;
  const halfWidth = tileSize / 2;
  const halfLength = (tileSize * tileCount) / 2;
  return {
    minX: Math.min(-halfWidth, surfaceOffsetX - halfWidth),
    maxX: Math.max(halfWidth, surfaceOffsetX + halfWidth),
    minZ: -halfLength,
    maxZ: halfLength,
  };
}
