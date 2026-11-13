import { describe, expect, it } from 'vitest';
import { PIECES } from '../simulation/network/pieces';
import { buildLaneGraph, portPose } from '../simulation/network/buildLaneGraph';
import { rightOf, rotate } from '../simulation/network/geometry';
import type { SceneDefinition } from '../simulation/network/scene';
import { BOARD_TILES } from '../simulation/network/scene';
import { PRESETS } from './presets';
import { sceneryFor } from './scenery';

/** The board area each road piece covers, in tiles: [minX, minZ, maxX, maxZ]. */
function roadAreas(scene: SceneDefinition) {
  return scene.pieces.map((p) => {
    const { min, max } = PIECES[p.piece].footprint;
    const [a, b] = [rotate(min, p.rotation), rotate(max, p.rotation)];
    return [p.at[0] + Math.min(a[0], b[0]), p.at[1] + Math.min(a[1], b[1]), p.at[0] + Math.max(a[0], b[0]), p.at[1] + Math.max(a[1], b[1])];
  });
}

describe('scenery around the roads', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('puts trees, bushes and rocks on %s, never on or touching a road', (_, scene) => {
    const scenery = sceneryFor(scene);
    expect(scenery.length).toBeGreaterThan(20);
    expect(new Set(scenery.map((s) => s.kind))).toEqual(new Set(['tree', 'bush', 'rock', 'grass', 'flower']));
    for (const item of scenery) {
      for (const [x0, z0, x1, z1] of roadAreas(scene)) {
        const inside = item.at[0] > x0 - item.radius && item.at[0] < x1 + item.radius && item.at[1] > z0 - item.radius && item.at[1] < z1 + item.radius;
        expect(inside, `${item.model} at ${item.at} is on a road`).toBe(false);
      }
    }
  });

  it('keeps everything on the board, clear of its rounded corners', () => {
    for (const scene of PRESETS) {
      for (const { at, radius } of sceneryFor(scene)) {
        expect(at[0] - radius).toBeGreaterThan(0);
        expect(at[1] - radius).toBeGreaterThan(0);
        expect(at[0] + radius).toBeLessThan(BOARD_TILES);
        expect(at[1] + radius).toBeLessThan(BOARD_TILES);
        const corner = [at[0] < 1 || at[0] > BOARD_TILES - 1, at[1] < 1 || at[1] > BOARD_TILES - 1];
        expect(corner[0] && corner[1], `${at} is in a corner`).toBe(false);
      }
    }
  });

  it('is the same every time for the same scene, and an edit only changes the tiles it touches and their neighbours', () => {
    const scene = PRESETS[0];
    expect(sceneryFor(scene)).toEqual(sceneryFor(structuredClone(scene)));
    const edited: SceneDefinition = { ...scene, pieces: [...scene.pieces, { piece: 'straight', at: [2.5, 2.5], rotation: 0 }] };
    const near = (s: { at: [number, number] }) => Math.abs(Math.floor(s.at[0]) - 2) <= 1 && Math.abs(Math.floor(s.at[1]) - 2) <= 1;
    expect(sceneryFor(edited).filter((s) => !near(s))).toEqual(sceneryFor(scene).filter((s) => !near(s)));
    expect(sceneryFor(edited).some((s) => Math.floor(s.at[0]) === 2 && Math.floor(s.at[1]) === 2)).toBe(false);
  });

  it.each(PRESETS.map((p) => [p.name, p] as const))('leaves room on %s for the signs and the open-road markers beside the roads', (_, scene) => {
    const graph = buildLaneGraph(scene.pieces);
    // Where the map stands a sign (beside an approach) and the "+" marker past an open road end, in tiles.
    const signs = scene.controls.map((c) => {
      const { centre, facing } = portPose(scene.pieces[c.piece], c.port);
      const right = rightOf([-facing[0], -facing[1]]);
      return [centre[0] + right[0] * 0.55, centre[2] + right[1] * 0.55];
    });
    const markers = graph.openEnds.map((e) => [e.at[0] + e.facing[0] * 0.35, e.at[1] + e.facing[1] * 0.35]);
    for (const item of sceneryFor(scene)) {
      for (const [x, z] of [...signs, ...markers]) {
        expect(Math.hypot(item.at[0] - x, item.at[1] - z), `${item.model} at ${item.at} crowds (${x}, ${z})`).toBeGreaterThan(item.radius + 0.2);
      }
    }
  });
});
