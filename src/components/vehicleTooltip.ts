import { type Camera, type Object3D, Raycaster, Vector2 } from 'three';
import type { TrafficSimulation } from '../simulation/traffic/trafficSimulation';

/**
 * Hover tag over a vehicle: "Type · Profile · Reason", e.g. "Heavy truck · Assertive ·
 * Braking for the car ahead". Updated every frame while the pointer rests on it.
 */
export function createVehicleTooltip(container: HTMLElement, canvas: HTMLCanvasElement) {
  const tip = document.createElement('div');
  tip.className = 'vehicle-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  container.append(tip);

  const raycaster = new Raycaster();
  let pointer: Vector2 | null = null;
  let client = { x: 0, y: 0 };
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    client = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    tip.hidden = true;
  });

  function update(camera: Camera, traffic: Object3D, simulation: TrafficSimulation) {
    if (!pointer) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(traffic, true).find((h) => h.object.userData.vehicleId !== undefined);
    const id = hit?.object.userData.vehicleId as number | undefined;
    if (id === undefined || !simulation.has(id)) {
      tip.hidden = true;
      return;
    }
    const v = simulation.vehicle(id);
    tip.textContent = `${v.type.label} · ${v.driver.label} · ${v.reason}`;
    tip.style.transform = `translate(${client.x + 14}px, ${client.y + 14}px)`;
    tip.hidden = false;
  }

  return { update };
}
