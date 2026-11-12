import type { SceneDefinition } from '../simulation/network/scene';

/**
 * Blank board: a one-tile road stub in the middle of each edge, each an entry/exit point
 * with an open end facing in, for the player to build their own network from.
 */
export const blankBoard: SceneDefinition = {
  id: 'blank-board',
  name: 'Blank board',
  pieces: [
    { piece: 'straight', at: [8.5, 0.5], rotation: 90 },
    { piece: 'straight', at: [15.5, 8.5], rotation: 0 },
    { piece: 'straight', at: [8.5, 15.5], rotation: 90 },
    { piece: 'straight', at: [0.5, 8.5], rotation: 0 },
  ],
  controls: [],
  // Traffic arrives once the player joins the edges up; until then no trip has a way through.
  demand: { gateways: { A: 1, B: 1, C: 1, D: 1 } },
};
