import { type Camera, type InstancedMesh, type Mesh, type MeshBasicMaterial, type Object3D, Vector3 } from 'three';
import type { LaneGraph } from '../simulation/network/buildLaneGraph';
import { boardToWorld } from '../scenes/board';
import type { SceneStore } from '../scenes/sceneStore';
import type { SceneDefinition } from '../simulation/network/scene';
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
  /** The 3D scene on screen (for checks on what it draws, such as scenery). */
  view: Object3D;
  graph: LaneGraph;
  simulation: () => TrafficSimulation;
  queues: () => { approach: string; live: number }[];
  queueLabelsShown: () => number;
  store: SceneStore;
  /** Apply an edited scene as the editor would. */
  apply: (scene: SceneDefinition) => Promise<void>;
  /** The editor's live placement preview, and selecting as a click would. */
  preview: () => unknown;
  select: (target: { kind: 'piece' | 'control'; index: number } | null) => void;
}

export function exposeTrafficDebug({ canvas, camera, traffic, view, graph, simulation, queues, queueLabelsShown, store, apply, preview, select }: TrafficDebugSources) {
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
    /** The inspected vehicle's route as drawn: flat chevrons on the road (six vertices each), depth-tested so what's in front hides it. */
    route: () => {
      const group = view.getObjectByName('inspected-route');
      const chevrons = group?.getObjectByName('route-chevrons') as Mesh | undefined;
      const material = chevrons?.material as MeshBasicMaterial | undefined;
      return {
        shown: !!group?.visible && !!chevrons,
        depthTested: material?.depthTest === true,
        writesDepth: material?.depthWrite === true,
        opacity: material?.opacity,
        chevrons: chevrons ? chevrons.geometry.getAttribute('position').count / 6 : 0,
      };
    },
    /** Scenery drawn: how many trees, bushes, rocks and so on, and how many draw calls they take. */
    scenery: () => {
      const layer = view.getObjectByName('scenery');
      const meshes = (layer?.children ?? []) as InstancedMesh[];
      return { meshes: meshes.length, items: meshes.reduce((n, m) => n + m.count, 0) };
    },
    blocked: () => simulation().blockedAtEntries(),
    queues,
    /** Queue labels currently drawn over approaches. */
    queueLabelsShown,
    /** A quick edit for checks: a piece of road in the north-west corner (unsaved). */
    editScene: () => {
      const scene = store.current();
      return apply({ ...scene, pieces: [...scene.pieces, { piece: 'straight', at: [0.5, 0.5], rotation: 0 }] });
    },
    /** The scene on screen, for checks on what an edit did. */
    scene: () => store.current(),
    /** What the editor's preview shows while a part is dragged. */
    preview,
    select,
    /** Where a board point (tiles) is on screen, for dragging parts in checks. */
    screenOf: (x: number, z: number, level = 0) => {
      const p = new Vector3(...boardToWorld([x, level, z])).project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    /** Close every lane of these pieces, as an edit removing them would (until T12's editor exists). */
    closePieces: (pieces: number[]) => simulation().setClosed(graph.lanes.filter((l) => pieces.includes(l.piece)).map((l) => l.id)),
  };
}
