/** Rings out from the centre, and points round each: enough for a smooth fade and a round rim. */
const RINGS = 8;
const SEGMENTS = 48;

/**
 * A flat disc on the ground (y = 0, centred on the origin) whose opacity fades from `peak` at
 * the centre to nothing at `radius`, easing out so the glow is soft rather than banded. Returns
 * positions, one alpha per vertex (for an RGBA vertex colour) and triangle indices.
 */
export function glowDisc(radius: number, peak: number): { positions: Float32Array; alphas: Float32Array; indices: number[] } {
  const count = 1 + RINGS * SEGMENTS;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  alphas[0] = peak;
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    // Smooth falloff: 1 at the centre, 0 at the rim, with no hard edge either end.
    const fade = (1 - t) * (1 - t) * (1 + 2 * t);
    for (let s = 0; s < SEGMENTS; s++) {
      const i = 1 + (ring - 1) * SEGMENTS + s;
      const angle = (s / SEGMENTS) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius * t;
      positions[i * 3 + 2] = Math.sin(angle) * radius * t;
      alphas[i] = ring === RINGS ? 0 : peak * fade;
    }
  }
  const indices: number[] = [];
  const at = (ring: number, s: number) => 1 + (ring - 1) * SEGMENTS + (s % SEGMENTS);
  for (let s = 0; s < SEGMENTS; s++) indices.push(0, at(1, s + 1), at(1, s));
  for (let ring = 1; ring < RINGS; ring++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const [a, b, c, d] = [at(ring, s), at(ring, s + 1), at(ring + 1, s), at(ring + 1, s + 1)];
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions, alphas, indices };
}
