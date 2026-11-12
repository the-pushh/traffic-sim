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

export interface DockCallbacks {
  /** Play was pressed; `kind` says whether the run starts, resumes, or continues. */
  onPlay?: (kind: PlayKind) => void;
}

export function formatClock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The floating simulation dock: Play/Pause, Restart, clock and progress with the run
 * length beside them, then intensity; the editor adds its Parts button at the end. Call `sync()` each frame; it only touches the DOM on changes.
 */
export function createDock(container: HTMLElement, run: RunController, callbacks: DockCallbacks = {}) {
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Simulation');
  dock.innerHTML = `
    <div class="dock-section dock-run">
      <button type="button" class="icon-button primary" data-action="play-pause"></button>
      <button type="button" class="icon-button" data-action="restart" aria-label="Restart run" title="Restart run">${icon('restart')}</button>
      <div class="timeline">
        <span class="clock" aria-live="off"></span>
        <div class="progress" role="progressbar" aria-label="Run progress" aria-valuemin="0"><div class="progress-fill"></div></div>
      </div>
      <div class="duration" role="group" aria-label="Run length">
        <span class="dock-icon" title="Run length">${icon('clock')}</span>
        ${RUN_DURATIONS.map((d) => `<button type="button" class="segment" data-duration="${d}">${d} s</button>`).join('')}
      </div>
    </div>
    <div class="dock-divider" aria-hidden="true"></div>
    <div class="dock-section dock-traffic">
      <span class="dock-icon" title="Traffic intensity">${icon('gauge')}</span>
      <label class="intensity">
        <span class="dock-label">Intensity <strong class="intensity-name"></strong><span class="lock-hint" id="dock-lock-hint" hidden> · locked during the run</span></span>
        <input type="range" min="0" max="${INTENSITIES.length - 1}" step="1" list="intensity-ticks" />
        <datalist id="intensity-ticks">${INTENSITIES.map((_, i) => `<option value="${i}"></option>`).join('')}</datalist>
      </label>
    </div>
    <div class="dock-divider" aria-hidden="true"></div>
  `;
  container.append(dock);

  const playPause = dock.querySelector<HTMLButtonElement>('[data-action="play-pause"]')!;
  const restart = dock.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
  const clock = dock.querySelector<HTMLElement>('.clock')!;
  const progress = dock.querySelector<HTMLElement>('.progress')!;
  const fill = dock.querySelector<HTMLElement>('.progress-fill')!;
  const intensityInput = dock.querySelector<HTMLInputElement>('.intensity input')!;
  const intensityName = dock.querySelector<HTMLElement>('.intensity-name')!;
  const durationButtons = [...dock.querySelectorAll<HTMLButtonElement>('[data-duration]')];

  playPause.addEventListener('click', () => {
    if (run.state === 'running') {
      run.pause();
    } else {
      const kind = run.play();
      if (kind) callbacks.onPlay?.(kind);
    }
    sync();
  });
  restart.addEventListener('click', () => {
    run.restart();
    sync();
  });
  intensityInput.addEventListener('input', () => {
    const intensity = INTENSITIES[Number(intensityInput.value)];
    if (intensity) run.setIntensity(intensity);
    sync();
  });
  for (const button of durationButtons) {
    button.addEventListener('click', () => {
      const duration = RUN_DURATIONS.find((d) => String(d) === button.dataset.duration);
      if (duration) run.setDuration(duration);
      sync();
    });
  }
  const lockHint = dock.querySelector<HTMLElement>('.lock-hint')!;

  let lastRendered = '';
  let shownRunning: boolean | null = null;
  function sync() {
    const key = `${run.state}|${run.clock}|${run.duration}|${run.intensity}`;
    if (key === lastRendered) return;
    lastRendered = key;

    // Swap the icon only when Play/Pause flips: replacing it on every clock tick puts a new
    // element under a press in progress, and the browser then drops the click.
    const running = run.state === 'running';
    if (running !== shownRunning) {
      shownRunning = running;
      playPause.innerHTML = running ? icon('pause') : icon('play');
      playPause.setAttribute('aria-label', running ? 'Pause' : 'Play');
      playPause.title = running ? 'Pause' : 'Play';
    }
    dock.dataset.state = run.state;

    clock.textContent = `${formatClock(run.clock)} / ${formatClock(run.duration)}`;
    progress.setAttribute('aria-valuemax', String(run.duration));
    progress.setAttribute('aria-valuenow', String(Math.floor(run.clock)));
    fill.style.transform = `scaleX(${run.clock / run.duration})`;

    const locked = run.settingsLocked;
    const lockedHint = locked ? 'Restart the run to change' : '';
    lockHint.hidden = !locked;
    intensityInput.disabled = locked;
    intensityInput.value = String(INTENSITIES.indexOf(run.intensity));
    intensityInput.setAttribute('aria-valuetext', INTENSITY_LABELS[run.intensity]);
    intensityInput.title = lockedHint;
    if (locked) intensityInput.setAttribute('aria-describedby', 'dock-lock-hint');
    else intensityInput.removeAttribute('aria-describedby');
    intensityName.textContent = INTENSITY_LABELS[run.intensity];
    for (const button of durationButtons) {
      button.disabled = locked;
      if (locked) button.setAttribute('aria-describedby', 'dock-lock-hint');
      else button.removeAttribute('aria-describedby');
      button.title = lockedHint;
      button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === run.duration));
    }
  }

  sync();
  return { sync, element: dock };
}
