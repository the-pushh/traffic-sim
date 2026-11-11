/**
 * Connection metadata for City Kit road pieces, measured from the models (see
 * `assets/3d/ASSETS.md`). Local coordinates are in tiles with the model origin at
 * (0, 0); x and z follow the model's axes. A port is an opening on the piece's edge.
 */
import type { PortFlow } from './scene';

/**
 * `road`: a normal two-lane opening. `layby`: a road with an extra lay-by bay lane on
 * one side. `access`: a narrow driveway opening where local trips start and end.
 */
export type PortProfile = 'road' | 'layby' | 'access';

export interface PortDef {
  id: string;
  /** Centre of the opening, local tiles. */
  at: [number, number];
  /** Outward direction, a unit vector along x or z. */
  facing: [number, number];
  /** Road-surface height at the opening, in tiles above the piece base. */
  level: number;
  profile: PortProfile;
  /** Default one-way flow (placements can override it). */
  flow?: PortFlow;
  /** Lay-by ports: whether the bay lane arrives (`in`) or leaves (`out`) through this port. */
  bay?: 'in' | 'out';
}

export interface PieceDef {
  id: string;
  model: string;
  ports: PortDef[];
  /** Port pairs traffic can move between, as [from, to]. */
  movements: [string, string][];
  /**
   * A single-lane ring instead of direct movements: traffic circulates around the
   * piece's origin at `radius` tiles and joins or leaves `spread` degrees either side
   * of each arm.
   */
  ring?: { radius: number; spread: number };
}

const road = (id: string, at: [number, number], facing: [number, number], level = 0, flow?: PortFlow): PortDef => ({
  id,
  at,
  facing,
  level,
  profile: 'road',
  flow,
});
const layby = (id: string, at: [number, number], facing: [number, number], bay: 'in' | 'out'): PortDef => ({
  id,
  at,
  facing,
  level: 0,
  profile: 'layby',
  bay,
});
const access = (id: string, at: [number, number], facing: [number, number]): PortDef => ({ id, at, facing, level: 0, profile: 'access' });
const both = (a: string, b: string): [string, string][] => [
  [a, b],
  [b, a],
];

/** Every ordered pair of distinct ports: all movements except U-turns. */
function allMovements(ids: string[]): [string, string][] {
  return ids.flatMap((from) => ids.filter((to) => to !== from).map((to) => [from, to] as [string, string]));
}

const W = (level = 0) => road('w', [-0.5, 0], [-1, 0], level);
const E = (level = 0) => road('e', [0.5, 0], [1, 0], level);
const N = (level = 0) => road('n', [0, -0.5], [0, -1], level);
const S = (level = 0) => road('s', [0, 0.5], [0, 1], level);

export const PIECES: Record<string, PieceDef> = {
  straight: {
    id: 'straight',
    model: 'road-straight',
    ports: [road('w', [-0.5, 0], [-1, 0]), road('e', [0.5, 0], [1, 0])],
    movements: [
      ['w', 'e'],
      ['e', 'w'],
    ],
  },
  /** 90° bend within one tile: west ↔ south. */
  bend: { id: 'bend', model: 'road-bend', ports: [W(), S()], movements: allMovements(['w', 's']) },
  /** Wider 90° curve on 2 × 2 tiles, origin at the shared corner: west ↔ south. */
  curve: {
    id: 'curve',
    model: 'road-curve',
    ports: [road('w', [-1, -0.5], [-1, 0]), road('s', [0.5, 1], [0, 1])],
    movements: allMovements(['w', 's']),
  },
  crossroad: { id: 'crossroad', model: 'road-crossroad', ports: [N(), E(), S(), W()], movements: allMovements(['n', 'e', 's', 'w']) },
  /** Ramp climbing a quarter tile from west to east (stack two for the bridge deck). */
  ramp: { id: 'ramp', model: 'road-slant', ports: [W(0), E(0.25)], movements: allMovements(['w', 'e']) },
  /** Steep ramp climbing half a tile, straight to bridge height, in one tile. */
  'ramp-steep': { id: 'ramp-steep', model: 'road-slant-high', ports: [W(0), E(0.5)], movements: allMovements(['w', 'e']) },
  /** Bridge deck at half a tile, running north–south in the model. */
  bridge: { id: 'bridge', model: 'road-bridge', ports: [N(0.5), S(0.5)], movements: allMovements(['n', 's']) },
  /**
   * Four-arm single-lane roundabout on 3 × 3 tiles. The circulating carriageway runs
   * from radius 0.45 to 1.15 tiles, so its lane centre is at 0.8.
   */
  roundabout: {
    id: 'roundabout',
    model: 'road-roundabout',
    ports: [road('n', [0, -1.5], [0, -1]), road('e', [1.5, 0], [1, 0]), road('s', [0, 1.5], [0, 1]), road('w', [-1.5, 0], [-1, 0])],
    movements: [],
    ring: { radius: 0.8, spread: 25 },
  },
  /** Pedestrian crossing: a straight road where drivers slow down (traffic calming). */
  crossing: { id: 'crossing', model: 'road-crossing', ports: [W(), E()], movements: both('w', 'e') },
  /**
   * Road split on 1 × 2 tiles, origin on the tile boundary: a divided road on the west
   * (north carriageway westbound, south carriageway eastbound, two lanes each) meets a
   * single two-way road on the east. Eastbound, two lanes merge into one.
   */
  split: {
    id: 'split',
    model: 'road-split',
    ports: [road('wn', [-0.5, -0.5], [-1, 0], 0, 'out'), road('ws', [-0.5, 0.5], [-1, 0], 0, 'in'), road('e', [0.5, 0], [1, 0])],
    movements: [
      ['ws', 'e'],
      ['e', 'wn'],
    ],
  },
  /** Road with a lay-by bay on its north side for westbound traffic. */
  layby: { id: 'layby', model: 'road-side', ports: [layby('w', [-0.5, 0], [-1, 0], 'out'), layby('e', [0.5, 0], [1, 0], 'in')], movements: both('w', 'e') },
  /** Where the bay begins for westbound traffic: normal road east, lay-by road west. */
  'layby-start': { id: 'layby-start', model: 'road-side-entry', ports: [layby('w', [-0.5, 0], [-1, 0], 'out'), E()], movements: both('w', 'e') },
  /** Where the bay ends for westbound traffic: lay-by road east, normal road west. */
  'layby-end': { id: 'layby-end', model: 'road-side-exit', ports: [W(), layby('e', [0.5, 0], [1, 0], 'in')], movements: both('w', 'e') },
  /** Square dead end; drivers turn around. */
  'dead-end': { id: 'dead-end', model: 'road-end', ports: [E()], movements: [['e', 'e']] },
  /** Rounded end for turning around. */
  turnaround: { id: 'turnaround', model: 'road-end-round', ports: [E()], movements: [['e', 'e']] },
  /** Straight road with a driveway on its south side: an access point for local trips. */
  driveway: {
    id: 'driveway',
    model: 'road-driveway-single',
    ports: [W(), E(), access('d', [0, 0.5], [0, 1])],
    movements: allMovements(['w', 'e', 'd']),
  },
  /** 2 × 2 junction: straight west ↔ east along its north half, with a curved branch to the south. */
  'curve-t-junction': {
    id: 'curve-t-junction',
    model: 'road-curve-intersection',
    ports: [road('w', [-1, -0.5], [-1, 0]), road('e', [1, -0.5], [1, 0]), road('s', [0.5, 1], [0, 1])],
    movements: allMovements(['w', 'e', 's']),
  },
  /** Elevation block under a raised ramp; no road. */
  support: { id: 'support', model: 'tile-high', ports: [], movements: [] },
  /** T-junction: west, east and south arms. */
  't-junction': { id: 't-junction', model: 'road-intersection', ports: [W(), E(), S()], movements: allMovements(['w', 'e', 's']) },
};

/** City Kit models for traffic controls placed beside an approach. No yield sign exists; the warning sign stands in. */
export const CONTROL_MODELS = {
  signal: 'traffic-light',
  stop: 'road-sign-stop',
  yield: 'road-sign-warning',
} as const;
