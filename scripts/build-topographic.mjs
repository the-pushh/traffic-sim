// Builds the page's topographic background from the owner's contour drawing.
//
//   node scripts/build-topographic.mjs
//
// Input:  assets/ui/incoming/Topographic 5.svg (unchanged: one path, 22 closed contours
//         around three hills, 5634 × 5419, stroke #4A3AFF width 10).
// Output: public/images/topographic.svg, a square drawing with the original contours in the
//         middle and extra rings around them, concentric with the cluster and growing rounder
//         outward, far enough that any window shown at `cover` is filled corner to corner.
//         Lines are 1 px at any size (non-scaling strokes); colour comes from CSS (the file is
//         used as a mask), so the stroke colour here doesn't matter.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SOURCE = 'assets/ui/incoming/Topographic 5.svg';
const OUTPUT = 'public/images/topographic.svg';
/** The original cluster's share of the square: about the middle half of the screen. */
const CLUSTER_SHARE = 0.52;
/** Gap between added rings, in the original's units (about its own outer contour spacing). */
const SPACING = 330;
/** Rings continue until every point is this far out (fraction of the side): past the corners of any shown area. */
const REACH = 0.72;
const BINS = 180;
const POINTS_PER_RING = 96;

const svg = readFileSync(SOURCE, 'utf8');
const d = /\sd="([^"]+)"/.exec(svg)[1];

// Sample every contour (absolute M, C and Z only, as the source uses).
const numbers = (s) => s.trim().split(/[\s,]+/).map(Number);
const points = [];
for (const [, cmd, args] of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
  const n = numbers(args);
  if (cmd === 'M') points.push({ x: n[0], y: n[1], start: true });
  if (cmd === 'C') {
    for (let i = 0; i + 5 < n.length; i += 6) {
      const p0 = points[points.length - 1];
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        const u = 1 - t;
        points.push({
          x: u ** 3 * p0.x + 3 * u * u * t * n[i] + 3 * u * t * t * n[i + 2] + t ** 3 * n[i + 4],
          y: u ** 3 * p0.y + 3 * u * u * t * n[i + 1] + 3 * u * t * t * n[i + 3] + t ** 3 * n[i + 5],
        });
      }
    }
  }
}
const centre = points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }), { x: 0, y: 0 });

// The cluster's outline as a radius per angle about its centre.
const envelope = new Array(BINS).fill(0);
for (const p of points) {
  const angle = Math.atan2(p.y - centre.y, p.x - centre.x);
  const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
  envelope[bin] = Math.max(envelope[bin], Math.hypot(p.x - centre.x, p.y - centre.y));
}
const smooth = (values, half) => values.map((_, i) => {
  let sum = 0;
  for (let k = -half; k <= half; k++) sum += values[(i + k + BINS) % BINS];
  return sum / (2 * half + 1);
});
// Fill any empty angles from their neighbours, then take the outline's outer edge a touch smoother.
for (let pass = 0; pass < 3; pass++) envelope.forEach((r, i) => (envelope[i] = r || Math.max(envelope[(i + BINS - 1) % BINS], envelope[(i + 1) % BINS])));
// Each angle takes the furthest the cluster reaches nearby, so a smoothed ring can't cut back inside it.
const dilated = envelope.map((_, i) => Math.max(...Array.from({ length: 13 }, (__, k) => envelope[(i + k - 6 + BINS) % BINS])));
const outline = smooth(dilated, 3);

// The square: the cluster in the middle at CLUSTER_SHARE of the side.
const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
const side = Math.round(width / CLUSTER_SHARE);
const offset = { x: side / 2 - centre.x, y: side / 2 - centre.y };

/** A closed smooth curve through points (Catmull-Rom as cubic Béziers), rounded to whole units. */
function closedCurve(pts) {
  const f = (v) => Math.round(v);
  let path = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => pts[(i + k + pts.length) % pts.length]);
    path += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${path}Z`;
}

// Rings outward: each one a step further out and a little smoother than the last.
const rings = [];
for (let k = 1; ; k++) {
  // Smoother with each step out, but never inside the cluster's own reach.
  const profile = smooth(outline, Math.min(3 + k * 3, 45)).map((r, i) => Math.max(r, dilated[i]));
  const radii = profile.map((r) => r + k * SPACING);
  if (Math.min(...radii) > REACH * side) break;
  const ring = [];
  for (let i = 0; i < POINTS_PER_RING; i++) {
    const angle = -Math.PI + ((i + 0.5) / POINTS_PER_RING) * 2 * Math.PI;
    const r = radii[Math.floor(((i + 0.5) / POINTS_PER_RING) * BINS) % BINS];
    ring.push({ x: side / 2 + Math.cos(angle) * r, y: side / 2 + Math.sin(angle) * r });
  }
  rings.push(closedCurve(ring));
}

const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" fill="none" stroke="#000" stroke-width="1.2" stroke-linejoin="round">
<!-- Generated by scripts/build-topographic.mjs from assets/ui/incoming/Topographic 5.svg (owner-supplied); used as a CSS mask. -->
<path vector-effect="non-scaling-stroke" transform="translate(${Math.round(offset.x)} ${Math.round(offset.y)})" d="${d}"/>
<path vector-effect="non-scaling-stroke" d="${rings.join('')}"/>
</svg>
`;
mkdirSync('public/images', { recursive: true });
writeFileSync(OUTPUT, out);
console.log(`${OUTPUT}: ${side} × ${side}, original + ${rings.length} rings, ${Math.round(out.length / 1024)} KB`);
