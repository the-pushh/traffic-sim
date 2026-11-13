type Point = readonly [number, number, number];

/** At a sharp corner the ribbon's edge is pushed out at most this much (a mitre limit), times half the width. */
const MITRE_LIMIT = 1.5;

/**
 * A flat ribbon along a route, lying on the road (not turned to face the camera, as thick
 * lines are): two vertices per point, each half the width either side of the route across its
 * direction of travel, at the point's own height, so it climbs ramps with the road. Corners are
 * mitred so the band keeps its width. Returns positions and triangle indices for a mesh.
 */
export function routeRibbon(route: readonly Point[], width: number): { positions: Float32Array; indices: number[] } {
  const points = route.filter((p, i) => i === 0 || Math.hypot(p[0] - route[i - 1][0], p[2] - route[i - 1][2]) > 1e-6);
  const half = width / 2;
  const positions = new Float32Array(points.length * 2 * 3);
  /** The unit left-hand normal (on the ground) of the segment from a to b. */
  const left = (a: Point, b: Point): [number, number] => {
    const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
    const length = Math.hypot(dx, dz) || 1;
    return [dz / length, -dx / length];
  };
  points.forEach((p, i) => {
    const before = i > 0 ? left(points[i - 1], p) : null;
    const after = i < points.length - 1 ? left(p, points[i + 1]) : null;
    let [nx, nz] = before && after ? [before[0] + after[0], before[1] + after[1]] : (before ?? after ?? [0, 0]);
    const length = Math.hypot(nx, nz) || 1;
    [nx, nz] = [nx / length, nz / length];
    // Mitre: push the edge out so the band's width holds through the turn.
    const reference = before ?? after ?? [nx, nz];
    const scale = Math.min(MITRE_LIMIT, 1 / Math.max(1e-6, nx * reference[0] + nz * reference[1]));
    const [ox, oz] = [nx * half * scale, nz * half * scale];
    positions.set([p[0] + ox, p[1], p[2] + oz, p[0] - ox, p[1], p[2] - oz], i * 6);
  });
  const indices: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b, c, d] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
    indices.push(a, b, c, b, d, c);
  }
  return { positions, indices };
}
