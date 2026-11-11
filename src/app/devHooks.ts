import { type Camera, type Object3D, Vector3 } from 'three';
import type { TrafficSimulation } from '../simulation/traffic/trafficSimulation';

/**
 * Dev-server-only hook for the browser check (`scripts/verify-browser.mjs`): where each
 * vehicle is on screen and why it is doing what it does. Not included in production builds.
 */
export function exposeTrafficDebug(canvas: HTMLCanvasElement, camera: Camera, traffic: Object3D, simulation: () => TrafficSimulation) {
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
  };
}
