import type { ControlPlacement, PiecePlacement, PortFlow, SceneDefinition, SignalTiming } from '../simulation/network/scene';
import { range } from './layout';

/** The divided route: westbound on the north row, eastbound on the south row; one lane each way over the flyover. */
const WESTBOUND_ROW = 4.5;
const EASTBOUND_ROW = 5.5;
const SINGLE_ROW = 5; // the road split joins the divided rows to a single road on their shared edge
const WESTBOUND: Record<string, PortFlow> = { w: 'out', e: 'in' };
const EASTBOUND: Record<string, PortFlow> = { w: 'in', e: 'out' };
/** Where eastbound drivers can turn off before the narrowing, and where the alternative merges back. */
const TURN_OFF_COLUMN = 1.5;
const MERGE_COLUMN = 13.5;
/**
 * The road splits: two lanes become one at column 5, just before the climb, and one becomes
 * two again at column 11. (The sketch narrows at column 3; two columns later leaves room for
 * the queue to build between the turn-off and the narrowing, where drivers can see it.)
 */
const NARROWING_X = 5.5;
const WIDENING_X = 11.5;
/** The surface road runs north–south under the bridge. */
const SURFACE_COLUMN = 8.5;
/** The slower surface alternative. */
const ALTERNATIVE_ROW = 11.5;

/** Speed limits, km/h: the raised route is the fast way; the alternative is longer and signalled, so slower overall. */
const ROUTE_LIMIT = 70;
const ALTERNATIVE_LIMIT = 60;

/** The alternative's crossroads with the surface road: 35 s for the alternative, 20 s for the surface road, 3 s ambers. */
const ALTERNATIVE_GREEN: SignalTiming = { green: 35, amber: 3, red: 23, offset: 0 };
const SURFACE_GREEN: SignalTiming = { green: 20, amber: 3, red: 38, offset: -38 };

const pieces: PiecePlacement[] = [];
const at = (x: number, z: number) => pieces.findIndex((p) => p.at[0] === x && p.at[1] === z);

// The divided route at the west end, with the turn-off T on the eastbound carriageway.
for (const x of range(0, 5).map((i) => i + 0.5)) {
  pieces.push({ piece: 'straight', at: [x, WESTBOUND_ROW], rotation: 0, flow: WESTBOUND, speedLimit: ROUTE_LIMIT });
  pieces.push({ piece: x === TURN_OFF_COLUMN ? 't-junction' : 'straight', at: [x, EASTBOUND_ROW], rotation: 0, flow: EASTBOUND, speedLimit: ROUTE_LIMIT });
}
// The narrowing, the climb, the bridge over the surface road, the descent and the widening.
pieces.push(
  { piece: 'split', at: [NARROWING_X, SINGLE_ROW], rotation: 0, speedLimit: ROUTE_LIMIT },
  { piece: 'ramp', at: [6.5, SINGLE_ROW], rotation: 0, speedLimit: ROUTE_LIMIT },
  { piece: 'support', at: [7.5, SINGLE_ROW], rotation: 0 },
  { piece: 'ramp', at: [7.5, SINGLE_ROW], rotation: 0, level: 0.25, speedLimit: ROUTE_LIMIT },
  { piece: 'bridge', at: [SURFACE_COLUMN, SINGLE_ROW], rotation: 90, speedLimit: ROUTE_LIMIT },
  { piece: 'support', at: [9.5, SINGLE_ROW], rotation: 0 },
  { piece: 'ramp', at: [9.5, SINGLE_ROW], rotation: 180, level: 0.25, speedLimit: ROUTE_LIMIT },
  { piece: 'ramp', at: [10.5, SINGLE_ROW], rotation: 180, speedLimit: ROUTE_LIMIT },
  { piece: 'split', at: [WIDENING_X, SINGLE_ROW], rotation: 180, speedLimit: ROUTE_LIMIT },
);
// The divided route at the east end, with the merge T on the eastbound carriageway.
for (const x of range(12, 16).map((i) => i + 0.5)) {
  pieces.push({ piece: 'straight', at: [x, WESTBOUND_ROW], rotation: 0, flow: WESTBOUND, speedLimit: ROUTE_LIMIT });
  pieces.push({ piece: x === MERGE_COLUMN ? 't-junction' : 'straight', at: [x, EASTBOUND_ROW], rotation: 0, flow: EASTBOUND, speedLimit: ROUTE_LIMIT });
}
// Links down to the alternative and back up.
for (const x of [TURN_OFF_COLUMN, MERGE_COLUMN]) for (const z of range(6, 11)) pieces.push({ piece: 'straight', at: [x, z + 0.5], rotation: 90, speedLimit: ALTERNATIVE_LIMIT });
// The slower surface alternative, west to east: a bend from the west link, the crossroads, and a T whose east arm is open.
for (const x of range(1, 14).map((i) => i + 0.5)) {
  const piece = x === TURN_OFF_COLUMN ? 'bend' : x === SURFACE_COLUMN ? 'crossroad' : x === MERGE_COLUMN ? 't-junction' : 'straight';
  // The bend turned 180° joins north and east; the T turned 180° has arms east, west and north.
  const rotation = x === TURN_OFF_COLUMN || x === MERGE_COLUMN ? 180 : 0;
  pieces.push({ piece, at: [x, ALTERNATIVE_ROW], rotation, speedLimit: ALTERNATIVE_LIMIT });
}
// The surface road, edge to edge, passing under the bridge with no connection there.
for (const z of range(0, 16)) if (z + 0.5 !== ALTERNATIVE_ROW) pieces.push({ piece: 'straight', at: [SURFACE_COLUMN, z + 0.5], rotation: 90 });

const crossroads = at(SURFACE_COLUMN, ALTERNATIVE_ROW);
const controls: ControlPlacement[] = [
  { type: 'signal', piece: crossroads, port: 'w', timing: ALTERNATIVE_GREEN },
  { type: 'signal', piece: crossroads, port: 'e', timing: ALTERNATIVE_GREEN },
  { type: 'signal', piece: crossroads, port: 'n', timing: SURFACE_GREEN },
  { type: 'signal', piece: crossroads, port: 's', timing: SURFACE_GREEN },
  // The alternative merges back into the raised route under a yield sign.
  { type: 'yield', piece: at(MERGE_COLUMN, EASTBOUND_ROW), port: 's' },
];

/**
 * Flyover Bottleneck: a divided route narrows to one lane each way, climbs over a flyover
 * above a north–south surface road and widens again. Eastbound drivers can turn off before
 * the narrowing onto a slower surface alternative, which crosses the surface road at a
 * signal and merges back after the descent (`docs/agents/specs/preset-layouts.md`). The
 * alternative's T at column 13 leaves its east arm open.
 */
export const flyoverBottleneck: SceneDefinition = {
  id: 'flyover-bottleneck',
  name: 'Flyover Bottleneck',
  pieces,
  controls,
  // Gateways (clockwise from the north-west): A surface road north, B/C route east (in/out),
  // D surface road south, E/F route west (in/out). Most traffic heads east over the flyover.
  demand: { gateways: { E: 2, B: 0.4, A: 0.3, D: 0.3 }, destinations: { C: 1, F: 0.6, A: 0.2, D: 0.2 } },
};
