import type { ObserverCamera } from './observerCamera';

const ORBIT_PER_PIXEL = 0.006;
const TILT_PER_PIXEL = 0.005;
const ZOOM_PER_WHEEL_PIXEL = 0.0015;

/**
 * Mouse controls over the viewport: left-drag pans, right-drag orbits (left/right)
 * and tilts (up/down), scroll wheel zooms. Wheel events outside the viewport keep
 * normal page scrolling. Returns a function that removes every listener.
 */
export function attachViewportInput(element: HTMLElement, observer: ObserverCamera) {
  let drag: { button: number; x: number; y: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    drag = { button: e.button, x: e.clientX, y: e.clientY };
    element.setPointerCapture(e.pointerId);
    element.dataset.dragging = e.button === 0 ? 'pan' : 'orbit';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.button === 0) {
      observer.dragPan(dx, dy, element.clientHeight);
    } else {
      observer.orbit(-dx * ORBIT_PER_PIXEL);
      observer.tilt(-dy * TILT_PER_PIXEL);
    }
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    delete element.dataset.dragging;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    observer.zoom(Math.exp(e.deltaY * ZOOM_PER_WHEEL_PIXEL));
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', endDrag);
    element.removeEventListener('pointercancel', endDrag);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}
