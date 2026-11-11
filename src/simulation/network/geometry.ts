/** A vector or position on the board's ground plane, in tiles: [x east, z south]. */
export type Vec2 = [number, number];

/** Rotate a local (x, z) vector anticlockwise seen from above (same convention as three.js rotation.y). */
export function rotate([x, z]: Vec2, degrees: number): Vec2 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e9) / 1e9;
  const s = Math.round(Math.sin(r) * 1e9) / 1e9;
  return [x * c + z * s, -x * s + z * c];
}

/** The right-hand side of a heading, seen from above with x east and z south. */
export function rightOf([hx, hz]: Vec2): Vec2 {
  return [-hz, hx];
}
