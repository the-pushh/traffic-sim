import { clampTilt, detentAngle, nearestDetent, travelPosition, travelValue } from './controlMath';

/**
 * Hardware-style controls for the simulation: push buttons, a five-position switch,
 * a detented knob, a timeline slider, a joystick and a Controls drawer. Each returns its
 * element and a small API; all work by pointer and keyboard and show a visible focus ring.
 */

// ---------------------------------------------------------------- push button

export interface PushButtonOptions {
  label: string;
  /** Shown on the cap: an SVG icon, or the label as text when omitted. */
  icon?: string;
  /** A status light on the cap (the Controls button). */
  led?: boolean;
  /** Wider cap with the label printed (otherwise a square cap with the icon). */
  wide?: boolean;
  onPress?: () => void;
}

/**
 * A push button: the cap sinks into its well while held (the sidewall shortens), and springs
 * back on release. Works with a pointer, Space and Enter.
 */
export function createPushButton(options: PushButtonOptions) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hw-button hw-focusable${options.wide ? ' wide' : ''}`;
  button.setAttribute('aria-label', options.label);
  button.title = options.label;
  const shown = options.icon ?? `<span>${options.label}</span>`;
  button.innerHTML = `<span class="hw-cap"><span class="hw-cap-side"></span><span class="hw-cap-face">${options.led ? '<span class="hw-led"></span>' : ''}${shown}</span></span>`;
  let led = button.querySelector<HTMLElement>('.hw-led');

  const down = () => button.classList.add('is-pressed');
  const up = () => button.classList.remove('is-pressed');
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    button.setPointerCapture(e.pointerId);
    down();
  });
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
  button.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down();
  });
  button.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') up();
  });
  button.addEventListener('blur', up);
  button.addEventListener('click', () => options.onPress?.());

  const face = button.querySelector<HTMLElement>('.hw-cap-face')!;
  return {
    element: button,
    /** Light or darken the cap's status light. */
    setLit(lit: boolean) {
      led?.classList.toggle('is-on', lit);
    },
    /** What the cap shows (an icon, or text), and its accessible name. */
    setFace(html: string, label?: string) {
      face.innerHTML = `${led ? led.outerHTML : ''}${html}`;
      led = face.querySelector<HTMLElement>('.hw-led');
      if (label) {
        button.setAttribute('aria-label', label);
        button.title = label;
      }
    },
    setDisabled(disabled: boolean, why = '') {
      button.disabled = disabled;
      button.title = disabled && why ? why : (button.getAttribute('aria-label') ?? '');
    },
  };
}

// ---------------------------------------------------------------- five-position switch

export interface DetentOptions {
  label: string;
  /** Names of the positions, first to last. */
  positions: readonly string[];
  /** Short marks printed by each position (defaults to 1…n). */
  marks?: readonly string[];
  value: number;
  onChange?: (index: number) => void;
}

/** A lever in a gated slot with one notch per position; it moves between them and stays where it's left. */
export function createFivePositionSwitch(options: DetentOptions) {
  const count = options.positions.length;
  const root = document.createElement('div');
  root.className = 'hw-switch hw-focusable';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', options.label);
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', String(count - 1));
  const marks = options.marks ?? options.positions.map((_, i) => String(i + 1));
  root.innerHTML = `
    <div class="hw-switch-plate">
      <div class="hw-switch-slot"></div>
      ${options.positions.map(() => '<div class="hw-switch-notch"></div>').join('')}
      <div class="hw-switch-lever"></div>
    </div>
    <div class="hw-switch-scale">${marks.map((m) => `<span class="hw-switch-mark">${m}</span>`).join('')}</div>`;
  const plate = root.querySelector<HTMLElement>('.hw-switch-plate')!;
  const lever = root.querySelector<HTMLElement>('.hw-switch-lever')!;
  const notches = [...root.querySelectorAll<HTMLElement>('.hw-switch-notch')];
  const markEls = [...root.querySelectorAll<HTMLElement>('.hw-switch-mark')];
  // Slot inset (px) inside the plate; positions are spread evenly between its ends.
  const SLOT_INSET = 14;
  const at = (i: number) => `calc(${SLOT_INSET}px + (100% - ${2 * SLOT_INSET}px) * ${i / (count - 1)})`;
  notches.forEach((n, i) => (n.style.left = at(i)));
  markEls.forEach((m, i) => (m.style.left = at(i)));

  let value = options.value;
  const show = () => {
    lever.style.left = at(value);
    markEls.forEach((m, i) => m.classList.toggle('is-current', i === value));
    root.setAttribute('aria-valuenow', String(value));
    root.setAttribute('aria-valuetext', options.positions[value]);
    root.title = `${options.label}: ${options.positions[value]}`;
  };
  let disabled = false;
  const set = (next: number, notify = true) => {
    next = Math.min(count - 1, Math.max(0, next));
    if (next === value) return;
    value = next;
    show();
    if (notify) options.onChange?.(value);
  };
  const fromPointer = (clientX: number) => {
    const r = plate.getBoundingClientRect();
    return nearestDetent((clientX - r.left - SLOT_INSET) / (r.width - 2 * SLOT_INSET), count);
  };
  root.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    set(fromPointer(e.clientX));
  });
  root.addEventListener('pointermove', (e) => {
    if (root.hasPointerCapture(e.pointerId)) set(fromPointer(e.clientX));
  });
  root.addEventListener('lostpointercapture', () => root.classList.remove('is-dragging'));
  root.addEventListener('keydown', (e) => {
    if (disabled) return;
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (step) set(value + step);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(count - 1);
    else return;
    e.preventDefault();
  });
  show();
  return {
    element: root,
    get value() {
      return value;
    },
    set,
    /** Locked: shown greyed, ignores input, still focusable so its reason can be read. */
    setDisabled(next: boolean) {
      disabled = next;
      root.setAttribute('aria-disabled', String(next));
    },
  };
}

// ---------------------------------------------------------------- detented knob

const KNOB_SWEEP = 240;
/** Pixels of vertical drag per detent. */
const KNOB_DRAG_PER_STEP = 18;

/** A knurled knob whose pointer snaps between the positions; drag up/down, scroll, or use the arrow keys. */
export function createDetentedKnob(options: DetentOptions) {
  const count = options.positions.length;
  const marks = options.marks ?? options.positions.map((_, i) => String(i + 1));
  const root = document.createElement('div');
  root.className = 'hw-knob hw-focusable';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', options.label);
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', String(count - 1));
  // Scale printed round the knob: a tick and a mark at each detent.
  const cx = 46;
  const cy = 44;
  const scale = marks
    .map((m, i) => {
      const a = ((detentAngle(i, count, KNOB_SWEEP) - 90) * Math.PI) / 180;
      const p = (r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r].map((v) => v.toFixed(2));
      const [x1, y1] = p(28);
      const [x2, y2] = p(32);
      const [tx, ty] = p(39);
      return `<line data-i="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text data-i="${i}" x="${tx}" y="${Number(ty) + 3}">${m}</text>`;
    })
    .join('');
  root.innerHTML = `
    <svg class="hw-knob-scale" viewBox="0 0 92 84" aria-hidden="true">${scale}</svg>
    <div class="hw-knob-seat"><div class="hw-knob-body"><div class="hw-knob-face"></div></div></div>`;
  const body = root.querySelector<HTMLElement>('.hw-knob-body')!;
  const scaleEls = [...root.querySelectorAll<SVGElement>('[data-i]')];

  let value = options.value;
  const show = () => {
    body.style.setProperty('--angle', `${detentAngle(value, count, KNOB_SWEEP)}deg`);
    scaleEls.forEach((el) => el.classList.toggle('is-current', Number(el.dataset.i) === value));
    root.setAttribute('aria-valuenow', String(value));
    root.setAttribute('aria-valuetext', options.positions[value]);
    root.title = `${options.label}: ${options.positions[value]}`;
  };
  let disabled = false;
  const set = (next: number, notify = true) => {
    next = Math.min(count - 1, Math.max(0, next));
    if (next === value) return;
    value = next;
    show();
    if (notify) options.onChange?.(value);
  };
  let drag: { y: number; from: number } | null = null;
  root.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    drag = { y: e.clientY, from: value };
  });
  root.addEventListener('pointermove', (e) => {
    if (drag) set(drag.from + Math.round((drag.y - e.clientY) / KNOB_DRAG_PER_STEP));
  });
  root.addEventListener('lostpointercapture', () => {
    drag = null;
    root.classList.remove('is-dragging');
  });
  root.addEventListener('wheel', (e) => {
    if (disabled) return;
    e.preventDefault();
    set(value + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
  root.addEventListener('keydown', (e) => {
    if (disabled) return;
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (step) set(value + step);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(count - 1);
    else return;
    e.preventDefault();
  });
  show();
  return {
    element: root,
    get value() {
      return value;
    },
    set,
    setDisabled(next: boolean) {
      disabled = next;
      root.setAttribute('aria-disabled', String(next));
    },
  };
}

// ---------------------------------------------------------------- timeline slider

export interface TimelineOptions {
  label: string;
  /** Length of the run, seconds. */
  duration: number;
  /** Seconds between labelled marks, and between small marks. */
  majorEvery: number;
  minorEvery: number;
  value: number;
  /** While the cap is dragged: where it is (show it, but don't do the work yet). */
  onScrub?: (seconds: number) => void;
  /** The cap was let go, or moved with a key: go to this moment. */
  onCommit?: (seconds: number) => void;
}

/** Padding from the slider's edges to its first and last marks: the cap's centre travels exactly between them. */
const TIMELINE_INSET = 10;

/** A fader cap in a recessed track; its indicator lines up with the scale, and its travel ends on the first and last marks. */
export function createTimelineSlider(options: TimelineOptions) {
  const root = document.createElement('div');
  root.className = 'hw-timeline hw-focusable';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', options.label);
  root.setAttribute('aria-valuemin', '0');
  root.innerHTML = `<div class="hw-timeline-scale"></div><div class="hw-timeline-track"><div class="hw-timeline-fill"></div></div><div class="hw-timeline-cap"></div>`;
  const scale = root.querySelector<HTMLElement>('.hw-timeline-scale')!;
  const track = root.querySelector<HTMLElement>('.hw-timeline-track')!;
  const fill = root.querySelector<HTMLElement>('.hw-timeline-fill')!;
  const cap = root.querySelector<HTMLElement>('.hw-timeline-cap')!;
  let value = options.value;
  let duration = options.duration;
  let dragging = false;
  let disabled = false;
  let shown = '';

  const travel = () => ({ start: TIMELINE_INSET, end: root.clientWidth - TIMELINE_INSET });
  const layout = () => {
    const t = travel();
    // The track runs a little past the marks so the cap never sits on its rounded end.
    track.style.left = `${t.start - 4}px`;
    track.style.width = `${t.end - t.start + 8}px`;
    root.setAttribute('aria-valuemax', String(duration));
    scale.innerHTML = '';
    const major = Math.max(options.majorEvery, Math.round(duration / 3 / options.majorEvery) * options.majorEvery);
    const minor = major / 5;
    for (let s = 0; s <= duration + 1e-9; s += minor) {
      const x = travelPosition(s, duration, t);
      const isMajor = Math.abs(s / major - Math.round(s / major)) < 1e-9;
      scale.insertAdjacentHTML('beforeend', `<span class="hw-timeline-tick${isMajor ? ' is-major' : ''}" style="left:${x}px"></span>`);
      if (isMajor) scale.insertAdjacentHTML('beforeend', `<span class="hw-timeline-label" style="left:${x}px">${s}s</span>`);
    }
    shown = '';
    show();
  };
  const show = () => {
    const t = travel();
    const x = travelPosition(value, duration, t);
    const key = `${x.toFixed(1)}|${t.end}`;
    if (key === shown) return; // cheap to call every frame
    shown = key;
    cap.style.left = `${x}px`;
    fill.style.width = `${x - t.start + 4}px`;
    root.setAttribute('aria-valuenow', String(Math.round(value)));
    root.setAttribute('aria-valuetext', `${Math.round(value)} of ${duration} seconds`);
  };
  const clamp = (v: number) => Math.min(duration, Math.max(0, v));
  const fromPointer = (clientX: number) => travelValue(clientX - root.getBoundingClientRect().left, duration, travel());
  root.addEventListener('pointerdown', (e) => {
    if (disabled || e.button !== 0) return;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    dragging = true;
    value = fromPointer(e.clientX);
    show();
    options.onScrub?.(value);
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    value = fromPointer(e.clientX);
    show();
    options.onScrub?.(value);
  });
  root.addEventListener('lostpointercapture', () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    options.onCommit?.(value);
  });
  root.addEventListener('keydown', (e) => {
    if (disabled) return;
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -options.majorEvery, PageUp: options.majorEvery }[e.key];
    let next: number;
    if (step) next = Math.round(value) + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = duration;
    else return;
    e.preventDefault();
    value = clamp(next);
    show();
    options.onCommit?.(value);
  });
  new ResizeObserver(layout).observe(root);
  return {
    element: root,
    get value() {
      return value;
    },
    /** True while the player is dragging the cap (don't move it from outside then). */
    get dragging() {
      return dragging;
    },
    /** Show a moment without reporting it (the run's clock, every frame). */
    show(seconds: number) {
      if (dragging) return;
      value = clamp(seconds);
      show();
    },
    setDuration(seconds: number) {
      if (seconds === duration) return;
      duration = seconds;
      value = clamp(value);
      layout();
    },
    setDisabled(next: boolean) {
      disabled = next;
      root.setAttribute('aria-disabled', String(next));
    },
  };
}

// ---------------------------------------------------------------- joystick

/** Furthest the cap moves from centre at full tilt, px (shown as tilt of the shaft and cap). */
const STICK_REACH = 20;
/** Keyboard: tilt reached while an arrow key is held. */
const KEY_TILT = 1;

/**
 * A stick on a visible pivot in a rubber boot: it tilts in two axes (the shaft leans and
 * the cap moves and foreshortens) and springs back to centre on release.
 */
export function createJoystick(options: { label: string; onTilt?: (x: number, y: number) => void }) {
  const root = document.createElement('div');
  root.className = 'hw-joystick hw-focusable';
  root.tabIndex = 0;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-roledescription', 'joystick');
  root.setAttribute('aria-label', `${options.label}. Drag, or hold the arrow keys; it returns to centre on release.`);
  root.innerHTML = `
    <svg viewBox="0 0 104 104" aria-hidden="true">
      <defs>
        <radialGradient id="hw-js-well" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#151317"/><stop offset="1" stop-color="#0a090b"/></radialGradient>
        <radialGradient id="hw-js-boot" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#3a373e"/><stop offset="0.7" stop-color="#1d1b20"/><stop offset="1" stop-color="#121014"/></radialGradient>
        <linearGradient id="hw-js-shaft" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#9c99a1"/><stop offset="0.35" stop-color="#e6e4e8"/><stop offset="1" stop-color="#6b6870"/></linearGradient>
        <radialGradient id="hw-js-cap" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#f0eef2"/><stop offset="0.55" stop-color="#c3c0c7"/><stop offset="1" stop-color="#7d7a82"/></radialGradient>
        <filter id="hw-js-cast" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
      </defs>
      <!-- Bezel ring seated in the panel, with the gap and the well. -->
      <circle cx="52" cy="52" r="50" fill="#3a3640" />
      <circle cx="52" cy="52" r="50" fill="none" stroke="rgb(255 255 255 / 0.10)" stroke-width="1" />
      <circle cx="52" cy="52" r="45.5" fill="#0b0a0c" />
      <circle cx="52" cy="52" r="44.5" fill="url(#hw-js-well)" />
      <!-- Rubber boot: molded rings around the pivot. -->
      <circle cx="52" cy="52" r="30" fill="url(#hw-js-boot)" />
      <circle cx="52" cy="52" r="24" fill="none" stroke="rgb(0 0 0 / 0.55)" stroke-width="1.2" />
      <circle cx="52" cy="52" r="23" fill="none" stroke="rgb(255 255 255 / 0.06)" stroke-width="1" />
      <circle cx="52" cy="52" r="16" fill="none" stroke="rgb(0 0 0 / 0.55)" stroke-width="1.2" />
      <circle cx="52" cy="52" r="15" fill="none" stroke="rgb(255 255 255 / 0.06)" stroke-width="1" />
      <!-- Pivot collar. -->
      <circle cx="52" cy="52" r="8" fill="#0d0c0f" />
      <circle cx="52" cy="52" r="6.5" fill="#55525b" stroke="rgb(255 255 255 / 0.2)" stroke-width="0.8" />
      <!-- Cast shadow, shaft and cap (moved by script). -->
      <ellipse class="js-cast" cx="55" cy="56" rx="11" ry="10" fill="rgb(0 0 0 / 0.55)" filter="url(#hw-js-cast)" />
      <polygon class="js-shaft" fill="url(#hw-js-shaft)" stroke="rgb(0 0 0 / 0.5)" stroke-width="0.6" />
      <g class="js-cap">
        <ellipse class="js-cap-side" fill="#5d5a63" />
        <ellipse class="js-cap-top" fill="url(#hw-js-cap)" stroke="rgb(0 0 0 / 0.45)" stroke-width="0.7" />
        <ellipse class="js-cap-dish" fill="none" stroke="rgb(0 0 0 / 0.18)" stroke-width="0.8" />
      </g>
    </svg>`;
  const svg = root.querySelector('svg')!;
  const cast = svg.querySelector<SVGEllipseElement>('.js-cast')!;
  const shaft = svg.querySelector<SVGPolygonElement>('.js-shaft')!;
  const capSide = svg.querySelector<SVGEllipseElement>('.js-cap-side')!;
  const capTop = svg.querySelector<SVGEllipseElement>('.js-cap-top')!;
  const capDish = svg.querySelector<SVGEllipseElement>('.js-cap-dish')!;

  // Tilt now, where it's heading, and its velocity (a spring returns it to centre).
  const tilt = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };
  let holding = false;
  const keys = new Set<string>();

  const draw = () => {
    const [px, py] = [52, 52];
    const [ex, ey] = [px + tilt.x * STICK_REACH, py + tilt.y * STICK_REACH];
    const lean = Math.hypot(tilt.x, tilt.y);
    // Shaft: tapered from the collar to the cap, its width across the lean direction.
    const angle = Math.atan2(ey - py, ex - px) || 0;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const [w0, w1] = [3.4, 2.6];
    shaft.setAttribute('points', [
      [px + nx * w0, py + ny * w0], [ex + nx * w1, ey + ny * w1], [ex - nx * w1, ey - ny * w1], [px - nx * w0, py - ny * w0],
    ].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' '));
    shaft.style.display = lean < 0.02 ? 'none' : '';
    // Cap: a disc seen tilted, so it foreshortens along the lean; its sidewall shows on the low side.
    const squash = 1 - 0.28 * lean;
    const deg = (angle * 180) / Math.PI;
    for (const [el, r, dy] of [[capSide, 12, 2.2], [capTop, 12, 0], [capDish, 7, 0]] as const) {
      el.setAttribute('cx', String(ex));
      el.setAttribute('cy', String(ey + dy));
      el.setAttribute('rx', String(r * squash));
      el.setAttribute('ry', String(r));
      el.setAttribute('transform', `rotate(${deg} ${ex} ${ey})`);
    }
    // Shadow cast down-right, falling further as the stick leans.
    cast.setAttribute('cx', String(ex + 3 + tilt.x * 2));
    cast.setAttribute('cy', String(ey + 4 + tilt.y * 2));
  };

  let frame = 0;
  let last = 0;
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - (last || now)) / 1000);
    last = now;
    if (holding) {
      tilt.x = target.x;
      tilt.y = target.y;
      velocity.x = velocity.y = 0;
    } else {
      // A stiff, lightly damped spring: back to centre with a small overshoot.
      for (const axis of ['x', 'y'] as const) {
        const force = -320 * tilt[axis] - 18 * velocity[axis];
        velocity[axis] += force * dt;
        tilt[axis] += velocity[axis] * dt;
      }
    }
    draw();
    options.onTilt?.(tilt.x, tilt.y);
    const resting = !holding && Math.hypot(tilt.x, tilt.y) < 0.002 && Math.hypot(velocity.x, velocity.y) < 0.01;
    if (resting) {
      tilt.x = tilt.y = 0;
      draw();
      options.onTilt?.(0, 0);
      frame = 0;
      last = 0;
      return;
    }
    frame = requestAnimationFrame(step);
  };
  const run = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  const aim = (clientX: number, clientY: number) => {
    const r = root.getBoundingClientRect();
    const t = clampTilt((clientX - (r.left + r.width / 2)) / STICK_REACH, (clientY - (r.top + r.height / 2)) / STICK_REACH);
    target.x = t.x;
    target.y = t.y;
  };
  let grab: { x: number; y: number } | null = null;
  let disabled = false;
  root.addEventListener('pointerdown', (e) => {
    if (disabled || e.button !== 0) return;
    root.setPointerCapture(e.pointerId);
    holding = true;
    // Relative drag: the stick follows the hand from wherever it was grabbed.
    const r = root.getBoundingClientRect();
    grab = { x: e.clientX - (r.left + r.width / 2) - tilt.x * STICK_REACH, y: e.clientY - (r.top + r.height / 2) - tilt.y * STICK_REACH };
    run();
  });
  root.addEventListener('pointermove', (e) => {
    if (!holding || !grab) return;
    aim(e.clientX - grab.x, e.clientY - grab.y);
    run();
  });
  const release = () => {
    holding = false;
    grab = null;
    run();
  };
  root.addEventListener('lostpointercapture', release);

  const fromKeys = () => {
    const x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const y = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    const t = clampTilt(x * KEY_TILT * 2, y * KEY_TILT * 2);
    target.x = t.x;
    target.y = t.y;
    holding = keys.size > 0;
    run();
  };
  root.addEventListener('keydown', (e) => {
    if (disabled || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    keys.add(e.key);
    fromKeys();
  });
  root.addEventListener('keyup', (e) => {
    if (!keys.delete(e.key)) return;
    fromKeys();
  });
  root.addEventListener('blur', () => {
    keys.clear();
    release();
  });
  draw();
  return {
    element: root,
    tilt: () => ({ ...tilt }),
    setDisabled(next: boolean) {
      disabled = next;
      root.tabIndex = next ? -1 : 0;
      root.setAttribute('aria-disabled', String(next));
      if (next) {
        keys.clear();
        release();
      }
    },
  };
}

// ---------------------------------------------------------------- controls drawer

/**
 * A pane that slides out beside its button. The button is a push button with a status
 * light that stays lit while the pane is open; pressing it again closes the pane.
 */
export function createControlsDrawer(options: { label: string; pane: HTMLElement }) {
  const pane = options.pane;
  pane.classList.add('hw-drawer', 'hw-panel');
  pane.dataset.open = 'false';
  pane.id ||= 'hw-controls-pane';
  pane.setAttribute('role', 'region');
  pane.setAttribute('aria-label', options.label);
  let open = false;
  const button = createPushButton({
    label: options.label,
    icon: `<span>${options.label}</span>`,
    led: true,
    wide: true,
    onPress: () => set(!open),
  });
  button.element.setAttribute('aria-expanded', 'false');
  button.element.setAttribute('aria-controls', pane.id);
  const set = (next: boolean) => {
    open = next;
    pane.dataset.open = String(open);
    pane.inert = !open;
    button.element.setAttribute('aria-expanded', String(open));
    button.setLit(open);
  };
  set(false);
  return { button: button.element, pane, get open() { return open; }, set };
}
