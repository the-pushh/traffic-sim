import type { CameraJoystick } from '../three/controls/cameraJoystick';

const ARROW_DIRECTIONS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** Enable or disable the on-screen joystick element (focusability and announced state). */
export function setJoystickEnabled(root: HTMLElement, enabled: boolean) {
  root.tabIndex = enabled ? 0 : -1;
  root.setAttribute('aria-disabled', String(!enabled));
}

/**
 * On-screen joystick: drag the knob (mouse, trackpad, or touch) or hold arrow keys
 * while it has focus. Left/right orbits, up/down tilts. Returns a detach function.
 */
export function attachJoystickControl(root: HTMLElement, joystick: CameraJoystick) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const knob = root.querySelector<HTMLElement>('.joystick-knob')!;
  const heldKeys = new Set<string>();
  let pointer: { id: number; x: number; y: number } | null = null;

  /** Knob travel: the knob's centre stops one knob-radius inside the rim. */
  const radius = () => (root.clientWidth - knob.offsetWidth) / 2;

  /** Pointer deflection wins while dragging; otherwise held arrow keys steer. */
  const steer = () => {
    const r = radius();
    let offset = { x: 0, y: 0 };
    if (pointer) {
      const rect = root.getBoundingClientRect();
      offset = { x: pointer.x - (rect.left + rect.width / 2), y: pointer.y - (rect.top + rect.height / 2) };
    } else {
      for (const key of heldKeys) {
        offset.x += ARROW_DIRECTIONS[key].x * r;
        offset.y += ARROW_DIRECTIONS[key].y * r;
      }
    }
    const knobPos = joystick.push(offset.x, offset.y, r);
    knob.style.transform = `translate(${knobPos.x}px, ${knobPos.y}px)`;
    if (pointer || heldKeys.size) root.dataset.active = '';
    else delete root.dataset.active;
  };

  root.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      root.focus();
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      root.setPointerCapture(e.pointerId);
      steer();
    },
    { signal },
  );
  root.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== pointer?.id) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      steer();
    },
    { signal },
  );
  const endPointer = (e: PointerEvent) => {
    if (e.pointerId !== pointer?.id) return;
    pointer = null;
    steer();
  };
  root.addEventListener('pointerup', endPointer, { signal });
  root.addEventListener('pointercancel', endPointer, { signal });
  root.addEventListener('lostpointercapture', endPointer, { signal });

  root.addEventListener(
    'keydown',
    (e) => {
      if (!(e.key in ARROW_DIRECTIONS)) return;
      e.preventDefault();
      heldKeys.add(e.key);
      steer();
    },
    { signal },
  );
  root.addEventListener(
    'keyup',
    (e) => {
      if (heldKeys.delete(e.key)) steer();
    },
    { signal },
  );
  root.addEventListener(
    'blur',
    () => {
      heldKeys.clear();
      steer();
    },
    { signal },
  );

  return () => {
    listeners.abort();
    pointer = null;
    heldKeys.clear();
    steer();
  };
}
