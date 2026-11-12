import type { ControlPlacement, PiecePlacement, PortFlow, SceneDefinition, SignalTiming } from '../simulation/network/scene';
import { range } from './layout';

/** The divided main road: westbound on the north row, eastbound on the south row. */
const WESTBOUND_ROW = 3.5;
const EASTBOUND_ROW = 4.5;
const WESTBOUND: Record<string, PortFlow> = { w: 'out', e: 'in' };
const EASTBOUND: Record<string, PortFlow> = { w: 'in', e: 'out' };
/** Port ids belong to the model: on a piece turned 180°, its `w` port faces east and its `s` port faces north. */
const EASTBOUND_TURNED: Record<string, PortFlow> = { w: 'out', e: 'in' };
/** The narrow shortcut, and the columns where links join it to the main road. */
const SHORTCUT_ROW = 11.5;
const LINK_COLUMNS = [1.5, 14.5];
/** The main road's signalised junction and the shortcut's stop-controlled one share this column. */
const JUNCTION_COLUMN = 8.5;
/** Where the shortcut's T leaves its south arm open for players. */
const OPEN_T_COLUMN = 4.5;
/** School frontage on the shortcut: a zebra crossing, the school driveway, then a drop-off lay-by. */
const ZEBRA_COLUMN = 10.5;
const DRIVEWAY_COLUMN = 11.5;
const LAYBY_COLUMNS = [12.5, 13.5];

/** Speed limits, km/h: a faster main road, a slow shortcut, slower still past the school. */
const MAIN_ROAD_LIMIT = 60;
const SHORTCUT_LIMIT = 30;
const SCHOOL_LIMIT = 20;

/** The main road's light: 30 s for the main road, 15 s for the side street, 3 s ambers. */
const MAIN_GREEN: SignalTiming = { green: 30, amber: 3, red: 18, offset: 0 };
const SIDE_GREEN: SignalTiming = { green: 15, amber: 3, red: 33, offset: -33 };

const pieces: PiecePlacement[] = [];
const at = (x: number, z: number) => pieces.findIndex((p) => p.at[0] === x && p.at[1] === z);

// Main road, edge to edge, two lanes each way.
for (const x of range(0, 16).map((i) => i + 0.5)) {
  const junction = x === JUNCTION_COLUMN;
  pieces.push({ piece: junction ? 'crossroad' : 'straight', at: [x, WESTBOUND_ROW], rotation: 0, flow: WESTBOUND, speedLimit: MAIN_ROAD_LIMIT });
  // Eastbound: T-junctions where the links leave (south arm) and where the side street crosses (north arm).
  const piece = junction || LINK_COLUMNS.includes(x) ? 't-junction' : 'straight';
  pieces.push({ piece, at: [x, EASTBOUND_ROW], rotation: junction ? 180 : 0, flow: junction ? EASTBOUND_TURNED : EASTBOUND, speedLimit: MAIN_ROAD_LIMIT });
}
// Side street north of the main road's junction.
for (const z of range(0, 3)) pieces.push({ piece: 'straight', at: [JUNCTION_COLUMN, z + 0.5], rotation: 90 });
// Links between the main road and the shortcut.
for (const x of LINK_COLUMNS) for (const z of range(5, 11)) pieces.push({ piece: 'straight', at: [x, z + 0.5], rotation: 90 });
// The shortcut, west to east.
const shortcutPiece = (x: number): Pick<PiecePlacement, 'piece' | 'rotation'> => {
  if (LINK_COLUMNS.includes(x)) return { piece: 't-junction', rotation: 180 }; // north arm to the link
  if (x === OPEN_T_COLUMN || x === JUNCTION_COLUMN) return { piece: 't-junction', rotation: 0 }; // south arm
  if (x === ZEBRA_COLUMN) return { piece: 'crossing', rotation: 0 };
  if (x === DRIVEWAY_COLUMN) return { piece: 'driveway', rotation: 0 };
  if (x === LAYBY_COLUMNS[0]) return { piece: 'layby-end', rotation: 0 };
  if (x === LAYBY_COLUMNS[1]) return { piece: 'layby-start', rotation: 0 };
  return { piece: 'straight', rotation: 0 };
};
for (const x of range(0, 16).map((i) => i + 0.5)) {
  const schoolFrontage = x >= ZEBRA_COLUMN && x <= LAYBY_COLUMNS[1];
  pieces.push({ ...shortcutPiece(x), at: [x, SHORTCUT_ROW], speedLimit: schoolFrontage ? SCHOOL_LIMIT : SHORTCUT_LIMIT });
}
// Street south of the shortcut's stop-controlled junction.
for (const z of range(12, 16)) pieces.push({ piece: 'straight', at: [JUNCTION_COLUMN, z + 0.5], rotation: 90 });

const controls: ControlPlacement[] = [
  // Main road junction: one light for the main road, one for the side street.
  { type: 'signal', piece: at(JUNCTION_COLUMN, WESTBOUND_ROW), port: 'e', timing: MAIN_GREEN },
  { type: 'signal', piece: at(JUNCTION_COLUMN, EASTBOUND_ROW), port: 'e', timing: MAIN_GREEN }, // turned 180°: faces west
  { type: 'signal', piece: at(JUNCTION_COLUMN, WESTBOUND_ROW), port: 'n', timing: SIDE_GREEN },
  // Links give way where they meet the main road and the shortcut.
  ...LINK_COLUMNS.flatMap((x): ControlPlacement[] => [
    { type: 'yield', piece: at(x, EASTBOUND_ROW), port: 's' },
    { type: 'yield', piece: at(x, SHORTCUT_ROW), port: 's' }, // turned 180°: faces north
  ]),
  // The shortcut's all-way stop.
  { type: 'stop', piece: at(JUNCTION_COLUMN, SHORTCUT_ROW), port: 'w' },
  { type: 'stop', piece: at(JUNCTION_COLUMN, SHORTCUT_ROW), port: 'e' },
  { type: 'stop', piece: at(JUNCTION_COLUMN, SHORTCUT_ROW), port: 's' },
];

/**
 * School Run: two routes between the west and east of the board — a wide 60 km/h main
 * road with a signalised junction, and a narrow 30 km/h shortcut with an all-way stop —
 * joined by links at both ends. The school fronts the shortcut with a zebra crossing,
 * its driveway and a drop-off lay-by; a drop-off peak of local trips slows the shortcut
 * (`docs/agents/specs/preset-layouts.md`). The shortcut's T at column 4 has an open
 * south arm for players.
 */
export const schoolRun: SceneDefinition = {
  id: 'school-run',
  name: 'School Run',
  pieces,
  controls,
  // Gateways (clockwise from the north-west): A side street north, B/C main road east (in/out),
  // D shortcut east, E street south, F shortcut west, G/H main road west (in/out); P1 the school.
  demand: {
    gateways: { G: 0.6, B: 0.6, F: 0.5, D: 0.4, A: 0.2, E: 0.2 },
    destinations: { C: 1, H: 1, D: 0.7, F: 0.7, A: 0.2, E: 0.2 },
    // The school drop-off: from 10 s to 60 s into a run, parents drive to the school and leave again.
    peaks: [
      { from: 10, to: 60, rate: 0.5, entries: { G: 1, B: 1, F: 1, D: 1, E: 0.5 }, destinations: { P1: 1 } },
      { from: 20, to: 70, rate: 1, entries: { P1: 1 }, destinations: { C: 1, H: 1, D: 1, F: 1 } },
    ],
  },
};
