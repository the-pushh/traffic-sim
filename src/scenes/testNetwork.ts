import type { PiecePlacement, SceneDefinition } from '../simulation/network/scene';
import { range } from './layout';

const straightsEastWest = (z: number, xs: number[]): PiecePlacement[] => xs.map((x) => ({ piece: 'straight', at: [x + 0.5, z], rotation: 0 }));
const straightsNorthSouth = (x: number, zs: number[]): PiecePlacement[] => zs.map((z) => ({ piece: 'straight', at: [x, z + 0.5], rotation: 90 }));
const NORTH_SOUTH = { green: 18, amber: 3, red: 21, offset: 0 };
const EAST_WEST = { green: 18, amber: 3, red: 21, offset: -21 };

/**
 * Hidden test scene that exercises the lane network: a signalised crossroads, a
 * flyover on two-stage ramps over a north–south road, a roundabout, T-junctions, a
 * driveway, a turnaround, and an open road end for players to extend. Not one of the
 * four presets.
 */
export const testNetwork: SceneDefinition = {
  id: 'test-network',
  name: 'Test network',
  pieces: [
    // Main road along z = 8.5, west edge → crossroads → flyover → roundabout → east edge.
    ...straightsEastWest(8.5, [0, 2]),
    { piece: 't-junction', at: [1.5, 8.5], rotation: 180 }, // north arm left open
    { piece: 'crossroad', at: [3.5, 8.5], rotation: 0 },
    ...straightsEastWest(8.5, [4]),
    { piece: 'ramp', at: [5.5, 8.5], rotation: 0 },
    { piece: 'support', at: [6.5, 8.5], rotation: 0 },
    { piece: 'ramp', at: [6.5, 8.5], rotation: 0, level: 0.25 },
    { piece: 'bridge', at: [7.5, 8.5], rotation: 90 },
    { piece: 'support', at: [8.5, 8.5], rotation: 0 },
    { piece: 'ramp', at: [8.5, 8.5], rotation: 180, level: 0.25 },
    { piece: 'ramp', at: [9.5, 8.5], rotation: 180 },
    { piece: 'roundabout', at: [11.5, 8.5], rotation: 0 },
    ...straightsEastWest(8.5, [13, 15]),
    { piece: 't-junction', at: [14.5, 8.5], rotation: 0 }, // south arm → short stub with a turnaround
    { piece: 'straight', at: [14.5, 9.5], rotation: 90 },
    { piece: 'turnaround', at: [14.5, 10.5], rotation: 90 },
    // North–south road through the crossroads, with a driveway to the south.
    ...straightsNorthSouth(3.5, [...range(0, 8), 9, 10, 11, 13, 14, 15]),
    { piece: 'driveway', at: [3.5, 12.5], rotation: 90 },
    // North–south road passing under the bridge.
    ...straightsNorthSouth(7.5, range(0, 16)),
    // Roundabout arms to the north and south edges.
    ...straightsNorthSouth(11.5, [...range(0, 7), ...range(10, 16)]),
  ],
  // Two signal phases: north–south, then east–west.
  controls: [
    { type: 'signal', piece: 3, port: 'n', timing: NORTH_SOUTH },
    { type: 'signal', piece: 3, port: 'e', timing: EAST_WEST },
    { type: 'signal', piece: 3, port: 's', timing: NORTH_SOUTH },
    { type: 'signal', piece: 3, port: 'w', timing: EAST_WEST },
  ],
  // Eight entries share one single-lane central corridor: a quarter weight each keeps it busy without overloading it.
  demand: { gateways: { A: 0.25, B: 0.25, C: 0.25, D: 0.25, E: 0.25, F: 0.25, G: 0.25, H: 0.25 } },
};
