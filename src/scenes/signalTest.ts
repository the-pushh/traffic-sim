import type { PiecePlacement, SceneDefinition } from '../simulation/network/scene';

/** Index of the signal-controlled pedestrian crossing in the middle of the road. */
const CROSSING = 8;

/**
 * Hidden test scene for the driving core (T3): one road across the board, one lane
 * each way, with a signal-controlled pedestrian crossing in the middle. Traffic
 * queues at red and pulls away on green.
 */
export const signalTest: SceneDefinition = {
  id: 'signal-test',
  name: 'Signal test',
  pieces: Array.from({ length: 16 }, (_, i): PiecePlacement => ({ piece: i === CROSSING ? 'crossing' : 'straight', at: [i + 0.5, 8.5], rotation: 0 })),
  controls: [
    { type: 'signal', piece: CROSSING, port: 'w', timing: { green: 15, amber: 3, red: 12, offset: 0 } },
    { type: 'signal', piece: CROSSING, port: 'e', timing: { green: 15, amber: 3, red: 12, offset: 0 } },
  ],
  // Gateways: A is the east end, B the west end.
  demand: { gateways: { A: 1, B: 1 } },
};
