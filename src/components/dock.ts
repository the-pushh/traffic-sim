import { createFivePositionSwitch, createPushButton, createTimelineSlider } from '../hardware/controls';
import {
  INTENSITIES,
  type Intensity,
  type PlayKind,
  RUN_DURATIONS,
  type RunController,
} from '../simulation/runController';
import { icon } from './icons';

export const INTENSITY_LABELS: Record<Intensity, string> = {
  'almost-empty': 'Almost empty',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  congested: 'Congested',
};

/** Short marks printed under the traffic volume switch, lowest to highest. */
const INTENSITY_MARKS = ['1', '2', '3', '4', '5'];
const LOCKED = 'Restart the run to change';

export interface DockCallbacks {
  /** Play was pressed; `kind` says whether the run starts, resumes, or continues. */
  onPlay?: (kind: PlayKind) => void;
  /** The timeline was scrubbed to a moment: the simulation has to catch up (or replay) to it. */
  onSeek?: (seconds: number) => void;
}

export function formatClock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The simulation dock, built from hardware parts on a machined panel: Play/Pause and Restart
 * push buttons, a timeline fader that scrubs through the run, run-length buttons, and a
 * five-position switch for traffic volume. Other modules add sections with `addSection`.
 * Call `sync()` each frame; it only touches the DOM on changes.
 */
export function createDock(container: HTMLElement, run: RunController, callbacks: DockCallbacks = {}) {
  const dock = document.createElement('div');
  dock.className = 'dock hw-panel';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Simulation');
  container.append(dock);
  const section = (...children: HTMLElement[]) => {
    const s = document.createElement('div');
    s.className = 'dock-section';
    s.append(...children);
    dock.append(s);
    return s;
  };
  const divider = () => {
    const d = document.createElement('div');
    d.className = 'dock-divider';
    d.setAttribute('aria-hidden', 'true');
    dock.append(d);
  };

  // ---- Play/Pause, Restart, the timeline and its clock ----
  const playPause = createPushButton({
    label: 'Play',
    icon: icon('play'),
    onPress: () => {
      if (run.state === 'running') {
        run.pause();
      } else {
        const kind = run.play();
        if (kind) callbacks.onPlay?.(kind);
      }
      sync();
    },
  });
  playPause.element.dataset.action = 'play-pause';
  playPause.element.classList.add('is-primary');
  const restart = createPushButton({
    label: 'Restart run',
    icon: icon('restart'),
    onPress: () => {
      run.restart();
      sync();
    },
  });
  restart.element.dataset.action = 'restart';
  const clock = document.createElement('span');
  clock.className = 'clock hw-readout';
  clock.setAttribute('aria-live', 'off');
  const timeline = createTimelineSlider({
    label: 'Run time',
    duration: run.duration,
    majorEvery: 10,
    minorEvery: 2,
    value: 0,
    // While dragging, the clock follows the cap; the simulation catches up on release.
    onScrub: (s) => (clock.textContent = `${formatClock(s)} / ${formatClock(run.duration)}`),
    onCommit: (s) => {
      callbacks.onSeek?.(s);
      sync();
    },
  });
  timeline.element.classList.add('timeline');
  section(playPause.element, restart.element, timeline.element, clock);
  divider();

  // ---- Run length: three buttons, the chosen one lit ----
  const durationButtons = RUN_DURATIONS.map((d) => {
    const b = createPushButton({
      label: `${d} s`,
      icon: `<span>${d} s</span>`,
      led: true,
      wide: true,
      onPress: () => {
        run.setDuration(d);
        sync();
      },
    });
    b.element.dataset.duration = String(d);
    b.element.classList.add('segment');
    return b;
  });
  const durationGroup = document.createElement('div');
  durationGroup.className = 'duration';
  durationGroup.setAttribute('role', 'group');
  durationGroup.setAttribute('aria-label', 'Run length');
  durationGroup.insertAdjacentHTML('afterbegin', `<span class="dock-icon" aria-hidden="true">${icon('clock')}</span>`);
  durationGroup.append(...durationButtons.map((b) => b.element));
  section(durationGroup);
  divider();

  // ---- Traffic volume: a five-position switch ----
  const intensityName = document.createElement('strong');
  intensityName.className = 'intensity-name';
  const lockHint = document.createElement('span');
  lockHint.className = 'lock-hint';
  lockHint.id = 'dock-lock-hint';
  lockHint.hidden = true;
  lockHint.textContent = ' · locked during the run';
  const volume = createFivePositionSwitch({
    label: 'Traffic volume',
    positions: INTENSITIES.map((i) => INTENSITY_LABELS[i]),
    marks: INTENSITY_MARKS,
    value: INTENSITIES.indexOf(run.intensity),
    onChange: (index) => {
      run.setIntensity(INTENSITIES[index]);
      sync();
    },
  });
  const intensity = document.createElement('div');
  intensity.className = 'intensity';
  const caption = document.createElement('span');
  caption.className = 'dock-label';
  caption.append('Traffic ', intensityName, lockHint);
  intensity.append(caption, volume.element);
  const gauge = document.createElement('span');
  gauge.className = 'dock-icon';
  gauge.setAttribute('aria-hidden', 'true');
  gauge.innerHTML = icon('gauge');
  section(gauge, intensity);

  let lastRendered = '';
  let shownRunning: boolean | null = null;
  function sync() {
    // The fader follows the clock every frame (unless the player holds it).
    timeline.show(run.clock);
    const key = `${run.state}|${Math.floor(run.clock)}|${run.duration}|${run.intensity}`;
    if (key === lastRendered) return;
    lastRendered = key;

    // Swap the icon only when Play/Pause flips: replacing it under a press in progress drops the click.
    const running = run.state === 'running';
    if (running !== shownRunning) {
      shownRunning = running;
      playPause.setFace(icon(running ? 'pause' : 'play'), running ? 'Pause' : 'Play');
    }
    dock.dataset.state = run.state;
    timeline.setDuration(run.duration);
    if (!timeline.dragging) clock.textContent = `${formatClock(run.clock)} / ${formatClock(run.duration)}`;

    const locked = run.settingsLocked;
    lockHint.hidden = !locked;
    volume.set(INTENSITIES.indexOf(run.intensity), false);
    volume.setDisabled(locked);
    volume.element.title = locked ? LOCKED : `Traffic volume: ${INTENSITY_LABELS[run.intensity]}`;
    if (locked) volume.element.setAttribute('aria-describedby', 'dock-lock-hint');
    else volume.element.removeAttribute('aria-describedby');
    intensityName.textContent = INTENSITY_LABELS[run.intensity];
    for (const b of durationButtons) {
      const chosen = Number(b.element.dataset.duration) === run.duration;
      b.setDisabled(locked, LOCKED);
      b.setLit(chosen);
      b.element.setAttribute('aria-pressed', String(chosen));
      if (locked) b.element.setAttribute('aria-describedby', 'dock-lock-hint');
      else b.element.removeAttribute('aria-describedby');
    }
  }

  sync();
  return {
    sync,
    element: dock,
    /** Add a section at the end, after a divider (the editor's Parts button, the Controls button). */
    addSection(...children: HTMLElement[]) {
      divider();
      section(...children);
    },
  };
}
