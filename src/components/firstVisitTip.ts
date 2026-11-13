const STORAGE_KEY = 'traffic-sim:first-visit-tip-dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode or blocked storage: the tip just shows again next visit.
  }
}

/**
 * One-time tip above the dock. Disappears on the first Play or when closed, and is
 * remembered in this browser.
 */
export function createFirstVisitTip(container: HTMLElement, durationSeconds: () => number) {
  if (readDismissed()) return { dismiss() {}, sync() {} };

  const tip = document.createElement('div');
  tip.className = 'first-visit-tip';
  tip.setAttribute('role', 'note');
  tip.innerHTML = `
    <p class="tip-main"></p>
    <p class="tip-camera">Over the map: hold Space and drag to pan, scroll to zoom. <strong>Controls</strong> has the joystick to orbit and tilt.</p>
    <button type="button" class="tip-close" aria-label="Dismiss tip">×</button>
  `;
  const main = tip.querySelector<HTMLElement>('.tip-main')!;
  container.append(tip);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    writeDismissed();
    tip.remove();
  };
  tip.querySelector('.tip-close')!.addEventListener('click', dismiss);

  let shownDuration = -1;
  const sync = () => {
    const d = durationSeconds();
    if (d === shownDuration || dismissed) return;
    shownDuration = d;
    main.innerHTML = `Press <strong>Play</strong> to run ${d} s of traffic.`;
  };
  sync();
  return { dismiss, sync };
}
