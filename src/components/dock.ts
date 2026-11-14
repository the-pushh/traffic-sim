import {
  INTENSITIES,
  type Intensity,
  type PlayKind,
  RUN_DURATIONS,
  type RunController,
} from '../simulation/runController';
import { countdown, runProgress } from './hudCountdown';
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

/** Gap between the Duration button and its menu, px. */
const MENU_GAP = 6;

/**
 * The floating HUD: one glass toolbar of Play/Pause (in its progress ring), the countdown
 * and Reset | Duration | Traffic load | then sections other modules add with `addSection`
 * (Customise). Call `sync()` each frame; it only touches the DOM on changes.
 */
export function createDock(container: HTMLElement, run: RunController, callbacks: DockCallbacks = {}) {
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Simulation');
  dock.innerHTML = `
    <div class="dock-section dock-run">
      <div class="play-ring">
        <button type="button" class="play-button" data-action="play-pause"><span class="play-icon"></span></button>
        <svg class="ring" viewBox="0 0 48 48" role="progressbar" aria-label="Run progress" aria-valuemin="0">
          <circle class="ring-track" cx="24" cy="24" r="22.5" pathLength="100" />
          <circle class="ring-fill" cx="24" cy="24" r="22.5" pathLength="100" />
        </svg>
      </div>
      <span class="countdown" aria-live="off"></span>
      <button type="button" class="icon-button quiet" data-action="restart" aria-label="Reset run" title="Reset run">${icon('restart')}</button>
    </div>
    <div class="dock-divider" aria-hidden="true"></div>
    <div class="dock-section duration">
      <button type="button" class="duration-trigger" popovertarget="duration-menu" aria-haspopup="listbox">
        <span class="duration-key">Duration:</span> <span class="duration-value"></span>${icon('caret')}
      </button>
      <ul class="duration-menu" id="duration-menu" popover role="listbox" aria-label="Run length">
        ${RUN_DURATIONS.map((d) => `<li role="option" tabindex="-1" data-duration="${d}">${icon('check')}<span>${d} s</span></li>`).join('')}
      </ul>
    </div>
    <div class="dock-divider" aria-hidden="true"></div>
    <div class="dock-section dock-traffic">
      <span class="dock-icon">${icon('gauge')}</span>
      <label class="intensity">
        <span class="dock-label">Traffic load <strong class="intensity-name"></strong><span class="lock-hint visually-hidden" id="dock-lock-hint" hidden> · locked during the run</span></span>
        <input type="range" min="0" max="${INTENSITIES.length - 1}" step="1" list="intensity-ticks" />
        <datalist id="intensity-ticks">${INTENSITIES.map((_, i) => `<option value="${i}"></option>`).join('')}</datalist>
      </label>
    </div>
  `;
  container.append(dock);

  const playPause = dock.querySelector<HTMLButtonElement>('[data-action="play-pause"]')!;
  const playIcon = playPause.querySelector<HTMLElement>('.play-icon')!;
  const restart = dock.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
  const countdownText = dock.querySelector<HTMLElement>('.countdown')!;
  const ring = dock.querySelector<SVGElement>('.ring')!;
  const ringFill = dock.querySelector<SVGCircleElement>('.ring-fill')!;
  const intensityInput = dock.querySelector<HTMLInputElement>('.intensity input')!;
  const intensityName = dock.querySelector<HTMLElement>('.intensity-name')!;
  const trigger = dock.querySelector<HTMLButtonElement>('.duration-trigger')!;
  const durationValue = dock.querySelector<HTMLElement>('.duration-value')!;
  const menu = dock.querySelector<HTMLElement>('.duration-menu')!;
  const options = [...menu.querySelectorAll<HTMLElement>('[role="option"]')];
  const lockHint = dock.querySelector<HTMLElement>('.lock-hint')!;

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

  // The Duration menu: a popover (in the top layer, so its glass blurs the map, not the bar),
  // opening upwards from the button, with the usual listbox keys.
  // Focus goes back to the button when the menu closes from inside it (Escape, a choice),
  // but not when Tab is moving on past it.
  let returnFocus = false;
  let tabbingOut = false;
  menu.addEventListener('beforetoggle', (event) => {
    const opening = (event as ToggleEvent).newState === 'open';
    trigger.setAttribute('aria-expanded', String(opening));
    if (!opening) {
      returnFocus = !tabbingOut && menu.contains(document.activeElement);
      tabbingOut = false;
      return;
    }
    const box = trigger.getBoundingClientRect();
    menu.style.left = `${box.left}px`;
    menu.style.bottom = `${innerHeight - box.top + MENU_GAP}px`;
    menu.style.minWidth = `${box.width}px`;
  });
  menu.addEventListener('toggle', (event) => {
    if ((event as ToggleEvent).newState === 'open') (options.find((o) => o.ariaSelected === 'true') ?? options[0]).focus();
    else if (returnFocus) trigger.focus();
  });
  const choose = (option: HTMLElement) => {
    const duration = RUN_DURATIONS.find((d) => String(d) === option.dataset.duration);
    if (duration) run.setDuration(duration);
    menu.hidePopover();
    sync();
  };
  for (const option of options) option.addEventListener('click', () => choose(option));
  menu.addEventListener('keydown', (event) => {
    const at = options.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => options[(to + options.length) % options.length].focus();
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(options.length - 1);
    else if ((event.key === 'Enter' || event.key === ' ') && at >= 0) choose(options[at]);
    else if (event.key === 'Tab') {
      // Let Tab move on as usual; just close the menu behind it.
      tabbingOut = true;
      menu.hidePopover();
      return;
    } else return;
    event.preventDefault();
  });
  trigger.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !trigger.disabled) {
      event.preventDefault();
      menu.showPopover();
    }
  });
  trigger.setAttribute('aria-expanded', 'false');
  // It's placed against the button when it opens; a resize would leave it adrift, so close it.
  window.addEventListener('resize', () => {
    if (menu.matches(':popover-open')) menu.hidePopover();
  });

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
      playIcon.innerHTML = running ? icon('pause') : icon('play');
      playPause.setAttribute('aria-label', running ? 'Pause' : 'Play');
      playPause.title = running ? 'Pause' : 'Play';
    }
    dock.dataset.state = run.state;
    dock.dataset.clock = String(run.clock);

    countdownText.textContent = countdown(run);
    ringFill.style.strokeDashoffset = String(100 * (1 - runProgress(run)));
    ring.setAttribute('aria-valuemax', String(run.duration));
    ring.setAttribute('aria-valuenow', String(Math.floor(run.clock)));
    ring.setAttribute('aria-valuetext', countdownText.textContent);

    const locked = run.settingsLocked;
    const lockedHint = locked ? 'Reset the run to change' : '';
    lockHint.hidden = !locked;
    intensityInput.disabled = locked;
    intensityInput.value = String(INTENSITIES.indexOf(run.intensity));
    intensityInput.setAttribute('aria-valuetext', INTENSITY_LABELS[run.intensity]);
    intensityInput.title = lockedHint;
    if (locked) intensityInput.setAttribute('aria-describedby', 'dock-lock-hint');
    else intensityInput.removeAttribute('aria-describedby');
    intensityName.textContent = INTENSITY_LABELS[run.intensity];

    durationValue.textContent = `${run.duration} s`;
    trigger.setAttribute('aria-label', `Duration: ${run.duration} s`);
    trigger.disabled = locked;
    trigger.title = lockedHint;
    if (locked) trigger.setAttribute('aria-describedby', 'dock-lock-hint');
    else trigger.removeAttribute('aria-describedby');
    if (locked && menu.matches(':popover-open')) menu.hidePopover();
    for (const option of options) option.ariaSelected = String(Number(option.dataset.duration) === run.duration);
  }

  sync();
  return {
    sync,
    element: dock,
    /** Add a section at the end, after a divider (the editor's Customise button). */
    addSection(section: HTMLElement) {
      const divider = document.createElement('div');
      divider.className = 'dock-divider';
      divider.setAttribute('aria-hidden', 'true');
      dock.append(divider, section);
    },
  };
}
