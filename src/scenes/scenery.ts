import { portPose } from '../simulation/network/buildLaneGraph';
import { rightOf, rotate } from '../simulation/network/geometry';
import { PIECES } from '../simulation/network/pieces';
import { BOARD_TILES, type SceneDefinition } from '../simulation/network/scene';

export type SceneryKind = 'tree' | 'bush' | 'rock' | 'grass' | 'flower';

/** One piece of scenery: a Nature Kit model standing on the board. */
export interface SceneryItem {
  kind: SceneryKind;
  /** Model file name under models/nature/. */
  model: string;
  /** Where it stands, in board tiles (x east, z south). */
  at: [number, number];
  /** How far it reaches from `at`, in tiles (its footprint, for keeping clear of roads). */
  radius: number;
  /** Turn about the vertical, radians, and size relative to the kit (1 = as drawn). */
  rotation: number;
  scale: number;
}

/** Board tiles per Nature Kit unit: a default tree stands about 0.9 tiles tall. */
export const NATURE_SCALE = 0.55;

/**
 * The Nature Kit models used, by kind. `radius` is how far the widest of them reaches from
 * its centre at any turn (half its footprint's diagonal), in tiles at NATURE_SCALE; see ASSETS.md.
 */
export const SCENERY_MODELS: Record<SceneryKind, { models: string[]; radius: number; weight: number }> = {
  tree: { models: ['tree_default', 'tree_oak', 'tree_fat', 'tree_simple', 'tree_cone', 'tree_pineRoundA'], radius: 0.27, weight: 0.42 },
  bush: { models: ['plant_bush', 'plant_bushLarge'], radius: 0.15, weight: 0.24 },
  grass: { models: ['grass', 'grass_large'], radius: 0.16, weight: 0.16 },
  rock: { models: ['rock_smallA', 'rock_smallB'], radius: 0.14, weight: 0.1 },
  flower: { models: ['flower_redA', 'flower_yellowA'], radius: 0.07, weight: 0.08 },
};

/** Share of free tiles that get something; some get a second, smaller thing. */
const FILL = 0.45;
const SECOND = 0.3;
/** Scenery keeps this far inside its tile beyond its own reach, so it never touches a neighbouring road. */
const EDGE_GAP = 0.03;
/** Where the map may stand things beside a road end, in tiles from the end's centre: a sign either side, a "+" marker beyond. */
const SIGN_OFFSET = 0.55;
const MARKER_OFFSET = 0.35;
/** Scenery keeps this far (beyond its own reach) from those spots, tiles. */
const SPOT_CLEARANCE = 0.25;

/**
 * Trees, bushes, grass, rocks and flowers on the tiles no road covers, clear of the spots
 * beside road ends where signs and open-end markers stand. Each tile's scenery depends only
 * on the scene's id, that tile and the roads next to it, and stays inside the tile, so the
 * same scene always looks the same and an edit only changes the tiles around it.
 */
export function sceneryFor(scene: SceneDefinition): SceneryItem[] {
  const covered = coveredTiles(scene);
  const spots = roadsideSpots(scene);
  const clear = (s: SceneryItem) => spots.every(([x, z]) => Math.hypot(s.at[0] - x, s.at[1] - z) > s.radius + SPOT_CLEARANCE);
  const items: SceneryItem[] = [];
  for (let x = 0; x < BOARD_TILES; x++) {
    for (let z = 0; z < BOARD_TILES; z++) {
      const corner = (x === 0 || x === BOARD_TILES - 1) && (z === 0 || z === BOARD_TILES - 1);
      if (corner || covered.has(`${x},${z}`)) continue;
      const random = tileRandom(scene.id, x, z);
      if (random() >= FILL) continue;
      // Draw both before checking, so a skipped one doesn't shift what the tile gets otherwise.
      const first = item(random, x, z, pickKind(random()));
      const second = random() < SECOND ? item(random, x, z, random() < 0.5 ? 'grass' : 'flower') : null;
      for (const s of [first, second]) if (s && clear(s)) items.push(s);
    }
  }
  return items;
}

function item(random: () => number, x: number, z: number, kind: SceneryKind): SceneryItem {
  const { models, radius: base } = SCENERY_MODELS[kind];
  const scale = 0.85 + random() * 0.3;
  const radius = base * scale;
  const inset = radius + EDGE_GAP;
  return {
    kind,
    model: models[Math.floor(random() * models.length)],
    at: [x + inset + random() * (1 - 2 * inset), z + inset + random() * (1 - 2 * inset)],
    radius,
    rotation: random() * Math.PI * 2,
    scale,
  };
}

function pickKind(r: number): SceneryKind {
  let sum = 0;
  for (const [kind, { weight }] of Object.entries(SCENERY_MODELS) as [SceneryKind, { weight: number }][]) {
    sum += weight;
    if (r < sum) return kind;
  }
  return 'tree';
}

/**
 * Beside every road end: where a sign would stand (either side of the approach) and where an
 * open end's "+" marker goes (just beyond it), whether or not one is there now, so adding a
 * sign never moves a tree.
 */
function roadsideSpots(scene: SceneDefinition): [number, number][] {
  return scene.pieces.flatMap((placement) =>
    PIECES[placement.piece].ports
      .filter((port) => port.profile === 'road')
      .flatMap((port) => {
        const { centre, facing } = portPose(placement, port.id);
        const right = rightOf([-facing[0], -facing[1]]);
        const [x, z] = [centre[0], centre[2]];
        return [
          [x + right[0] * SIGN_OFFSET, z + right[1] * SIGN_OFFSET],
          [x - right[0] * SIGN_OFFSET, z - right[1] * SIGN_OFFSET],
          [x + facing[0] * MARKER_OFFSET, z + facing[1] * MARKER_OFFSET],
        ] as [number, number][];
      }),
  );
}

/** Tiles any road piece covers (its whole footprint, raised pieces included). */
function coveredTiles(scene: SceneDefinition) {
  const covered = new Set<string>();
  for (const p of scene.pieces) {
    const { min, max } = PIECES[p.piece].footprint;
    const [a, b] = [rotate(min, p.rotation), rotate(max, p.rotation)];
    const [x0, z0] = [p.at[0] + Math.min(a[0], b[0]), p.at[1] + Math.min(a[1], b[1])];
    const [x1, z1] = [p.at[0] + Math.max(a[0], b[0]), p.at[1] + Math.max(a[1], b[1])];
    for (let x = Math.floor(x0 + 1e-6); x < x1 - 1e-6; x++) for (let z = Math.floor(z0 + 1e-6); z < z1 - 1e-6; z++) covered.add(`${x},${z}`);
  }
  return covered;
}

/** A small seeded random stream for one tile of one scene (mulberry32 over a string hash). */
function tileRandom(sceneId: string, x: number, z: number) {
  let h = 2166136261;
  for (const c of `${sceneId}:${x}:${z}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
