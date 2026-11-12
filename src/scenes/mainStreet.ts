import type { ControlPlacement, PiecePlacement, PortFlow, SceneDefinition, SignalTiming } from '../simulation/network/scene';
import { range } from './layout';

/** Westbound carriageway (north row) and eastbound carriageway (south row) of the arterial. */
const WESTBOUND_ROW = 7.5;
const EASTBOUND_ROW = 8.5;
const WESTBOUND: Record<string, PortFlow> = { w: 'out', e: 'in' };
const EASTBOUND: Record<string, PortFlow> = { w: 'in', e: 'out' };
/** Side streets cross the arterial at these columns; the short block is the one tile between the last two. */
const JUNCTION_COLUMNS = [3.5, 9.5, 11.5];

/** One 60 s cycle per junction: the arterial's green, then the side street's. */
const ARTERIAL_GREEN = 30;
const SIDE_GREEN = 24;
const AMBER = 3;
/**
 * When each junction's arterial green starts, seconds into the cycle. The middle light
 * follows the first by about the eastbound driving time (52.5 m ≈ 5 s), so a group from
 * the first light can get through all three. The last light turns red 2 s before the
 * middle one, so westbound traffic isn't caught in the short block (which would shut out
 * the last side street's turners); eastbound stragglers do get caught there, filling it
 * and holding the middle junction's traffic back.
 */
const GREEN_STARTS = [0, 5, 3];

const arterialTiming = (start: number): SignalTiming => ({ green: ARTERIAL_GREEN, amber: AMBER, red: SIDE_GREEN + AMBER, offset: -start });
const sideTiming = (start: number): SignalTiming => ({ green: SIDE_GREEN, amber: AMBER, red: ARTERIAL_GREEN + AMBER, offset: -(start + ARTERIAL_GREEN + AMBER) });


const pieces: PiecePlacement[] = [];
const controls: ControlPlacement[] = [];

// The arterial: two one-way carriageways, two lanes each, edge to edge.
for (const x of range(0, 16).map((i) => i + 0.5)) {
  const junction = JUNCTION_COLUMNS.includes(x);
  pieces.push({ piece: junction ? 'crossroad' : 'straight', at: [x, WESTBOUND_ROW], rotation: 0, flow: WESTBOUND });
  pieces.push({ piece: junction ? 'crossroad' : 'straight', at: [x, EASTBOUND_ROW], rotation: 0, flow: EASTBOUND });
}
// Signals on the outer approaches of each two-tile junction; drivers cross both tiles in one go.
JUNCTION_COLUMNS.forEach((x, j) => {
  const north = pieces.findIndex((p) => p.at[0] === x && p.at[1] === WESTBOUND_ROW);
  const south = pieces.findIndex((p) => p.at[0] === x && p.at[1] === EASTBOUND_ROW);
  const start = GREEN_STARTS[j];
  controls.push({ type: 'signal', piece: north, port: 'e', timing: arterialTiming(start) });
  controls.push({ type: 'signal', piece: south, port: 'w', timing: arterialTiming(start) });
  controls.push({ type: 'signal', piece: north, port: 'n', timing: sideTiming(start) });
  // The last junction's south arm is left open for players to extend.
  if (j < JUNCTION_COLUMNS.length - 1) controls.push({ type: 'signal', piece: south, port: 's', timing: sideTiming(start) });
});
// Narrower side streets (one lane each way) to the north and south edges.
for (const x of JUNCTION_COLUMNS) {
  for (const z of range(0, 7)) pieces.push({ piece: 'straight', at: [x, z + 0.5], rotation: 90 });
  if (x !== JUNCTION_COLUMNS.at(-1)) for (const z of range(9, 16)) pieces.push({ piece: 'straight', at: [x, z + 0.5], rotation: 90 });
}

/**
 * Main Street: a wide divided arterial with three staggered signalised junctions and a
 * one-tile short block between the last two (`docs/agents/specs/preset-layouts.md`).
 * Free grass beside the arterial and an open south arm at the last junction leave room
 * for a turn lane or a new side street.
 */
export const mainStreet: SceneDefinition = {
  id: 'main-street',
  name: 'Main Street',
  pieces,
  controls,
  // Most trips run along the arterial; the side streets feed it and take a share of it.
  demand: { gateways: { H: 1, D: 1, A: 0.25, B: 0.25, C: 0.25, F: 0.25, G: 0.25 }, destinations: { E: 1, I: 1, A: 0.2, B: 0.2, C: 0.2, F: 0.2, G: 0.2 } },
};

