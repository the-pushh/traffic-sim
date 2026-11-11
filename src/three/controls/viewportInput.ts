import { type DragGesture, dragGesture, mapClaimsSpace } from './dragGesture';
import type { ObserverCamera } from './observerCamera';

const ORBIT_PER_PIXEL = 0.006;
const TILT_PER_PIXEL = 0.005;
const ZOOM_PER_WHEEL_PIXEL = 0.0015;

function isTextField(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]') !== null;
}

/**
 * Viewport camera input. Hold Space and drag on the map to pan;
 * right-drag is an optional orbit/tilt shortcut; the scroll wheel or trackpad scroll
 * zooms. A plain drag is left for editing road pieces. Returns a detach function.
 */
export function attachViewportInput(element: HTMLElement, observer: ObserverCamera) {
  const listeners = new AbortController();
  const { signal } = listeners;
  let pointerOverViewport = false;
  /** Space is physically held (outside text fields). A drag that starts on the map then pans. */
  let spaceHeld = false;
  let pannedDuringHold = false;
  let drag: { gesture: DragGesture; pointerId: number; x: number; y: number } | null = null;

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
      const gesture = dragGesture({ button: e.button, spaceHeld });
      if (!gesture) return;
      e.preventDefault();
      drag = { gesture, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      element.setPointerCapture(e.pointerId);
      element.dataset.dragging = gesture;
    },
    { signal },
  );

  element.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
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

  return () => {
    listeners.abort();
    setSpaceHeld(false);
  };
}
