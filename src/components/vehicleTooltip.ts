import type { TrafficSimulation } from '../simulation/traffic/trafficSimulation';

/** How often to re-check what is under a resting pointer as vehicles move, ms. */
const RECHECK_MS = 100;

/**
 * Hover tag over a vehicle: "Type · Profile · Reason", e.g. "Heavy truck · Assertive ·
 * Braking for the car ahead", and "Click for details" under it; the cursor becomes a
 * pointer over a car. `pick` finds the vehicle under a screen point; it runs when the
 * pointer moves and every 100 ms while it rests.
 */
export function createVehicleTooltip(container: HTMLElement, canvas: HTMLCanvasElement) {
  const tip = document.createElement('div');
  tip.className = 'vehicle-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  container.append(tip);

  let pointer: { ndc: { x: number; y: number }; x: number; y: number } | null = null;
  let moved = false;
  let lastPick = 0;
  let picked: number | undefined;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      ndc: { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 },
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    moved = true;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    tip.hidden = true;
    delete canvas.dataset.overVehicle;
  });

  function update(pick: (ndc: { x: number; y: number }) => number | undefined, simulation: TrafficSimulation, now: number) {
    if (!pointer) return;
    if (moved || now - lastPick > RECHECK_MS) {
      picked = pick(pointer.ndc);
      moved = false;
      lastPick = now;
    }
    if (picked === undefined || !simulation.has(picked)) {
      tip.hidden = true;
      delete canvas.dataset.overVehicle; // back to the map's grab cursor
      return;
    }
    const v = simulation.vehicle(picked);
    canvas.dataset.overVehicle = ''; // a pointer: the car can be clicked
    const summary = `${v.type.label} · ${v.driver.label} · ${v.reason}`;
    if (tip.firstChild?.textContent !== summary) tip.innerHTML = `<span></span><span class="vehicle-tooltip-hint">Click for details</span>`;
    tip.firstElementChild!.textContent = summary;
    tip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
    tip.hidden = false;
  }

  return { update };
}
