import type { PiecePlacement, SceneDefinition, SignalTiming } from '../simulation/network/scene';
import { range } from './layout';

/** The roundabout's centre, tiles (it covers columns 6–8 and rows 6–8). */
const CENTRE = 7.5;
/** The signalled pedestrian crossing two tiles past the roundabout's east exit. */
const CROSSING_X = 11.5;
/** The T-junction further east whose north arm is left open. */
const T_JUNCTION_X = 13.5;
/**
 * A 48 s cycle with a 15 s red: at moderate traffic its queue fits in the two tiles before
 * the circle; when traffic is heavy it spills back into the circle.
 */
const CROSSING_TIMING: SignalTiming = { green: 30, amber: 3, red: 15, offset: 0 };

const eastWest = (xs: number[]): PiecePlacement[] => xs.map((x) => ({ piece: 'straight', at: [x + 0.5, CENTRE], rotation: 0 }));
const northSouth = (zs: number[]): PiecePlacement[] => zs.map((z) => ({ piece: 'straight', at: [CENTRE, z + 0.5], rotation: 90 }));

const pieces: PiecePlacement[] = [
  { piece: 'roundabout', at: [CENTRE, CENTRE], rotation: 0 },
  ...eastWest(range(0, 6)), // west arm
  ...northSouth(range(0, 6)), // north arm
  ...northSouth(range(9, 16)), // south arm
  ...eastWest([9, 10]), // east arm up to the crossing: the queue's room before the circle
  { piece: 'crossing', at: [CROSSING_X, CENTRE], rotation: 0 },
  ...eastWest([12]),
  // T-junction with its third arm pointing north, left open for players to connect.
  { piece: 't-junction', at: [T_JUNCTION_X, CENTRE], rotation: 180 },
  ...eastWest([14, 15]),
];
const crossing = pieces.findIndex((p) => p.piece === 'crossing');

/**
 * Market Roundabout: a four-arm single-lane roundabout with uneven demand (heavier from
 * the west and north) and a signalled crossing just past the east exit, whose queue can
 * spill back into the circle (`docs/agents/specs/preset-layouts.md`). A T-junction further
 * east has an open north arm for a new connection.
 */
export const marketRoundabout: SceneDefinition = {
  id: 'market-roundabout',
  name: 'Market Roundabout',
  pieces,
  controls: [
    { type: 'signal', piece: crossing, port: 'w', timing: CROSSING_TIMING },
    { type: 'signal', piece: crossing, port: 'e', timing: CROSSING_TIMING },
  ],
  // Gateways (clockwise from the north-west): A north, B east, C south, D west. About 15
  // trips a minute at Medium: a single-lane roundabout carries roughly 20.
  demand: { gateways: { A: 0.45, B: 0.25, C: 0.2, D: 0.6 } },
};
