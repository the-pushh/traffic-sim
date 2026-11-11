import type { Lane, Point3 } from './buildLaneGraph';

/** Where a point `distance` tiles along a lane's centreline is, and which way the lane heads there (x, z). */
export function pointAlongLane(lane: Lane, distance: number): { point: Point3; heading: [number, number] } {
  const pts = lane.points;
  let remaining = Math.max(0, distance);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (remaining <= segment || i === pts.length - 1) {
      const t = segment > 0 ? Math.min(1, remaining / segment) : 1;
      const flat = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
        heading: [(b[0] - a[0]) / flat, (b[2] - a[2]) / flat],
      };
    }
    remaining -= segment;
  }
  return { point: pts[0], heading: [1, 0] };
}
