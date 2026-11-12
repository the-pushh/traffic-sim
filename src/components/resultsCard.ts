import type { RunState } from '../simulation/runController';
import type { LabelledResults } from '../simulation/traffic/trafficSession';
import { INTENSITY_LABELS } from './dock';

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function label(r: LabelledResults) {
  return `${r.scene} · ${INTENSITY_LABELS[r.intensity]} · ${r.duration} s`;
}

function travelTime(r: LabelledResults) {
  return r.averageTravelTime === null ? '—' : `${Math.round(r.averageTravelTime)} s <span class="sample">· ${r.travelTimeSamples} ${r.travelTimeSamples === 1 ? 'trip' : 'trips'}</span>`;
}

/**
 * Results of the run that just ended, beside the previous run, above the dock. Shown
 * when a run ends; hidden when the next one starts or when closed.
 */
export function createResultsCard(container: HTMLElement, results: () => LabelledResults, state: () => RunState) {
  const card = document.createElement('section');
  card.className = 'results-card';
  card.setAttribute('aria-label', 'Run results');
  card.hidden = true;
  // Reopens the card after it's closed, while the run stays ended.
  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.className = 'results-reopen';
  reopen.textContent = 'Show results';
  reopen.hidden = true;
  // Announces new results to screen readers without moving focus.
  const announcer = document.createElement('p');
  announcer.className = 'visually-hidden';
  announcer.setAttribute('aria-live', 'polite');
  container.prepend(card, reopen, announcer);

  const show = (visible: boolean) => {
    card.hidden = !visible;
    reopen.hidden = visible || !latest || state() !== 'ended';
  };
  reopen.addEventListener('click', () => {
    show(true);
    card.querySelector<HTMLButtonElement>('.results-close')?.focus();
  });

  let latest: LabelledResults | null = null;
  let previous: LabelledResults | null = null;
  let lastState: RunState = state();

  const render = () => {
    if (!latest) return;
    const runs = previous ? [latest, previous] : [latest];
    const cells = (f: (r: LabelledResults) => string) => runs.map((r) => `<td>${f(r)}</td>`).join('');
    const approaches = latest.peakQueues.map((q, i) => `<tr><th scope="row">${escapeHtml(q.approach)}</th>${cells((r) => String(r.peakQueues[i]?.approach === q.approach ? r.peakQueues[i].peak : '—'))}</tr>`).join('');
    card.innerHTML = `
      <header>
        <h2>Results</h2>
        <button type="button" class="results-close" aria-label="Close results">×</button>
      </header>
      <div class="results-scroll">
        <table>
          <thead><tr><td></td>${runs.map((r, i) => `<th scope="col"><span class="run-name">${i === 0 ? 'This run' : 'Previous run'}</span><span class="run-label">${escapeHtml(label(r))}</span></th>`).join('')}</tr></thead>
          <tbody>
            <tr><th scope="row">Trips due · entered · finished</th>${cells((r) => `${r.due} · ${r.entered} · ${r.finished}`)}</tr>
            <tr><th scope="row">Average travel time</th>${cells(travelTime)}</tr>
            <tr><th scope="row">Blocked trips</th>${cells((r) => `${r.blocked} <span class="sample">of ${r.due} due</span>`)}</tr>
            <tr class="group"><th scope="rowgroup" colspan="${runs.length + 1}">Peak queue, vehicles <span class="sample">· ${latest.peakQueues.length} approaches</span></th></tr>
            ${approaches}
          </tbody>
        </table>
      </div>`;
    card.querySelector('.results-close')!.addEventListener('click', () => {
      show(false);
      reopen.focus();
    });
  };

  return {
    element: card,
    /** Call every frame: shows the results as the run ends and hides them once the next run starts. */
    sync() {
      const now = state();
      if (now === lastState) return;
      if (now === 'ended') {
        previous = latest;
        latest = results();
        render();
        show(true);
        announcer.textContent = `Run ended. Results: ${latest.finished} of ${latest.due} trips finished.`;
      } else if (now === 'running' || now === 'ready') {
        show(false);
        announcer.textContent = '';
      }
      lastState = now;
    },
  };
}
