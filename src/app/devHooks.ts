import { type Camera, type Object3D, Vector3 } from 'three';
import type { LaneGraph } from '../simulation/network/buildLaneGraph';
import type { SceneStore } from '../scenes/sceneStore';
import type { TrafficSimulation } from '../simulation/traffic/trafficSimulation';

/**
 * Dev-server-only hook for the browser check (`scripts/verify-browser.mjs`): where each
 * vehicle is on screen and why it is doing what it does, and closing pieces to check blocked
 * trips. Not included in production builds.
 */
export interface TrafficDebugSources {
  canvas: HTMLCanvasElement;
  camera: Camera;
  traffic: Object3D;
  graph: LaneGraph;
  simulation: () => TrafficSimulation;
  queues: () => { approach: string; live: number }[];
  queueLabelsShown: () => number;
  store: SceneStore;
}

export function exposeTrafficDebug({ canvas, camera, traffic, graph, simulation, queues, queueLabelsShown, store }: TrafficDebugSources) {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __trafficDebug: unknown }).__trafficDebug = {
    vehicles: () =>
      traffic.children.map((object) => {
        const p = object.getWorldPosition(new Vector3()).project(camera);
        const rect = canvas.getBoundingClientRect();
        const v = simulation().vehicle(object.userData.vehicleId);
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, reason: v.reason, speed: v.speed };
      }),
    counts: () => simulation().counts,
    blocked: () => simulation().blockedAtEntries(),
    queues,
    /** Queue labels currently drawn over approaches. */
    queueLabelsShown,
    /** Stand-in for the editor (T12): change the scene on screen without saving, to check Save, Reset and the leave dialog. */
    editScene: () => {
      const scene = store.current();
      store.edit({ ...scene, pieces: [...scene.pieces, { piece: 'straight', at: [0.5, 0.5], rotation: 0 }] });
    },
    /** Close every lane of these pieces, as an edit removing them would (until T12's editor exists). */
    closePieces: (pieces: number[]) => simulation().setClosed(graph.lanes.filter((l) => pieces.includes(l.piece)).map((l) => l.id)),
  };
}
