type Point = readonly [number, number, number];

/** A chevron's size and how often they repeat along the route, in world units. */
export interface ChevronShape {
  /** Distance between chevron centres along the route. */
  spacing: number;
  /** Tip to arm ends, along the route. */
  length: number;
  /** Arm end to arm end, across the route. */
  width: number;
  /** How thick each arm is, measured along the route. */
  thickness: number;
}

/**
 * A row of flat chevrons along a route, each pointing the way it goes, lying on the road (not
 * turned to face the camera): centres `spacing` apart by distance over the ground, the first half
 * a gap from the start. Each chevron is two thick arms (two quads) on its segment's slope, so the
 * row climbs ramps with the road and turns with the route at corners. Returns positions (six
 * vertices per chevron: tip, outer arm, inner arm, inner tip, inner arm, outer arm) and triangle
 * indices for a mesh.
 */
export function routeChevrons(route: readonly Point[], { spacing, length, width, thickness }: ChevronShape): { positions: Float32Array; indices: number[] } {
  const points = route.filter((p, i) => i === 0 || Math.hypot(p[0] - route[i - 1][0], p[2] - route[i - 1][2]) > 1e-6);
  const segments = points.slice(1).map((b, i) => {
    const a = points[i];
    const ground = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return { a, ground, forward: [(b[0] - a[0]) / ground, (b[2] - a[2]) / ground] as const, slope: (b[1] - a[1]) / ground };
  });
  const total = segments.reduce((sum, s) => sum + s.ground, 0);

  const positions: number[] = [];
  const indices: number[] = [];
  const [half, halfWidth] = [length / 2, width / 2];
  // The chevron's outline in its own frame: [ahead, across].
  const outline: [number, number][] = [
    [half, 0],
    [-half, halfWidth],
    [-half + thickness, halfWidth],
    [half - thickness, 0],
    [-half + thickness, -halfWidth],
    [-half, -halfWidth],
  ];
  let segment = 0;
  let segmentStart = 0;
  for (let at = spacing / 2; at <= total - half + 1e-9; at += spacing) {
    while (segment < segments.length - 1 && at > segmentStart + segments[segment].ground) segmentStart += segments[segment++].ground;
    const { a, forward, slope } = segments[segment];
    const along = at - segmentStart;
    const [fx, fz] = forward;
    const centre = [a[0] + fx * along, a[1] + slope * along, a[2] + fz * along];
    const first = positions.length / 3;
    for (const [ahead, across] of outline) {
      positions.push(centre[0] + fx * ahead + fz * across, centre[1] + slope * ahead, centre[2] + fz * ahead - fx * across);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3, first, first + 3, first + 4, first, first + 4, first + 5);
  }
  return { positions: new Float32Array(positions), indices };
}
