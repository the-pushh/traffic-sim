import { type DragGesture, dragGesture, mapClaimsSpace } from './dragGesture';
import type { ObserverCamera } from './observerCamera';

const ORBIT_PER_PIXEL = 0.006;
const TILT_PER_PIXEL = 0.005;
const ZOOM_PER_WHEEL_PIXEL = 0.0015;

function isTextField(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]') !== null;
}

/** Arrow keys on the focused map turn the view by this much per press, radians. */
const KEY_ORBIT = 0.08;
const KEY_TILT = 0.06;
/** A press becomes a drag (turning or panning the view) once the pointer moves this far, px; less is a click. */
const DRAG_START_PX = 6;

/**
 * Viewport camera input. Drag on the map to turn the view (left/right orbits, up/down
 * tilts), unless the drag starts on the selected road piece (`onSelection`: the editor moves
 * it); hold Space and drag to pan; scroll to zoom; with the map focused, the arrow keys turn
 * the view. Returns a detach function.
 */
export function attachViewportInput(
  element: HTMLElement,
  observer: ObserverCamera,
  { onSelection = () => false, placing = () => false }: { onSelection?: (e: PointerEvent) => boolean; placing?: () => boolean } = {},
) {
  const listeners = new AbortController();
  const { signal } = listeners;
  let pointerOverViewport = false;
  /** Space is physically held (outside text fields). A drag that starts on the map then pans. */
  let spaceHeld = false;
  let pannedDuringHold = false;
  /** `started`: the pointer has moved far enough to be a drag (a click's jitter never turns the view). */
  let drag: { gesture: DragGesture; pointerId: number; x: number; y: number; startX: number; startY: number; started: boolean } | null = null;

  const setSpaceHeld = (held: boolean) => {
    spaceHeld = held;
    if (!held) pannedDuringHold = false;
    if (held) element.dataset.spaceHeld = '';
    else delete element.dataset.spaceHeld;
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'Space') return;
      const typingInTextField = isTextField(e.target);
      if (mapClaimsSpace({ pointerOverViewport, typingInTextField, pannedDuringHold })) e.preventDefault();
      if (!typingInTextField) setSpaceHeld(true);
    },
    { signal },
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code !== 'Space' || !spaceHeld) return;
      // After a pan, don't let releasing Space press whichever button has focus.
      if (mapClaimsSpace({ pointerOverViewport, typingInTextField: isTextField(e.target), pannedDuringHold })) e.preventDefault();
      setSpaceHeld(false);
    },
    { signal },
  );
  window.addEventListener('blur', () => setSpaceHeld(false), { signal });

  // Hover state only decides whether Space is consumed; a pointerdown on the map proves location itself.
  element.addEventListener('pointerenter', () => (pointerOverViewport = true), { signal });
  element.addEventListener('pointermove', () => (pointerOverViewport = true), { signal });
  element.addEventListener('pointerleave', () => (pointerOverViewport = false), { signal });

  element.addEventListener(
    'pointerdown',
    (e) => {
      const gesture = dragGesture({ button: e.button, spaceHeld, onSelection: e.button === 0 && !spaceHeld && onSelection(e) });
      if (!gesture) return;
      e.preventDefault();
      drag = { gesture, pointerId: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, started: false };
      element.setPointerCapture(e.pointerId);
      element.dataset.dragging = gesture;
    },
    { signal },
  );

  element.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_START_PX) return;
        drag.started = true;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.gesture === 'pan') {
        pannedDuringHold = true;
        observer.dragPan(dx, dy, element.clientHeight);
      } else {
        observer.orbit(-dx * ORBIT_PER_PIXEL);
        observer.tilt(-dy * TILT_PER_PIXEL);
      }
    },
    { signal },
  );

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    delete element.dataset.dragging;
  };
  element.addEventListener('pointerup', endDrag, { signal });
  element.addEventListener('pointercancel', endDrag, { signal });
  element.addEventListener('lostpointercapture', endDrag, { signal });

  element.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      observer.zoom(Math.exp(e.deltaY * ZOOM_PER_WHEEL_PIXEL));
    },
    { passive: false, signal },
  );
  element.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

  // Keyboard: focus the map (Tab) and use the arrow keys to turn the view.
  element.addEventListener(
    'keydown',
    (e) => {
      const turns: Record<string, [number, number]> = { ArrowLeft: [KEY_ORBIT, 0], ArrowRight: [-KEY_ORBIT, 0], ArrowUp: [0, KEY_TILT], ArrowDown: [0, -KEY_TILT] };
      const turn = turns[e.key];
      // While a part is being placed the arrows move it (the editor's); shortcuts with modifiers aren't ours.
      if (!turn || placing() || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (turn[0]) observer.orbit(turn[0]);
      if (turn[1]) observer.tilt(turn[1]);
    },
    { signal },
  );

  return () => {
    listeners.abort();
    setSpaceHeld(false);
  };
}
