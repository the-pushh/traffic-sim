import type { VehicleDetails } from './vehicleDetails';

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The card for a clicked vehicle, in the same place and style as the road inspector. It leads
 * with highlights (how the driver drives, the speed, what it's doing, where it's going); "Show
 * more details" opens every setting of its type and driver, where it is, and the rest of its trip.
 * The layout is built once per vehicle; later updates only change the values, so the close
 * button is never rebuilt under a click.
 */
export function createVehicleCard(container: HTMLElement, onClose: () => void) {
  const card = document.createElement('section');
  card.className = 'inspector vehicle-card';
  card.setAttribute('aria-label', 'Selected vehicle');
  card.hidden = true;
  container.append(card);

  let shownFor: number | null = null;
  /** The shown vehicle's model picture, kept so a rebuilt card (a row appearing) still shows it. */
  let pictureUrl: string | null = null;
  let values: HTMLElement[] = [];
  /** Whether the full details are open; stays as the player left it from one vehicle to the next. */
  let detailsOpen = false;

  /** The picture slot stays hidden until there's a picture (if drawing it fails, the card just has none). */
  const showPicture = (dataUrl: string) => {
    const slot = card.querySelector<HTMLElement>('.vehicle-picture');
    if (!slot) return;
    slot.style.backgroundImage = `url("${dataUrl}")`;
    slot.hidden = false;
  };

  const showDetails = (open: boolean) => {
    detailsOpen = open;
    const toggle = card.querySelector<HTMLButtonElement>('.vehicle-details-toggle');
    const body = card.querySelector<HTMLElement>('.vehicle-card-body');
    if (!toggle || !body) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide details' : 'Show more details';
    body.hidden = !open;
  };

  card.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.vehicle-card-close')) onClose();
    if (target.closest('.vehicle-details-toggle')) showDetails(!detailsOpen);
  });

  return {
    element: card,
    /** Show (or refresh) the card for vehicle `id`. */
    show(id: number, details: VehicleDetails) {
      const rows = [...details.highlights, ...details.sections.flatMap((s) => s.rows)];
      if (shownFor !== id) pictureUrl = null; // another vehicle: its own picture comes later
      if (shownFor !== id || values.length !== rows.length) {
        // A rebuild (another vehicle, or a row appearing) mustn't drop keyboard focus from the card's buttons.
        const focused = (document.activeElement as HTMLElement | null)?.closest('.vehicle-card') ? (document.activeElement as HTMLElement).className : null;
        shownFor = id;
        card.innerHTML = `
          <header>
            <h2>${escapeHtml(details.title)} <span class="vehicle-id">#${id}</span></h2>
            <button type="button" class="vehicle-card-close" aria-label="Close vehicle details">×</button>
          </header>
          <div class="vehicle-picture" aria-hidden="true" hidden></div>
          <dl class="vehicle-highlights">${details.highlights.map(([label]) => `<dt>${escapeHtml(label)}</dt><dd></dd>`).join('')}</dl>
          <button type="button" class="vehicle-details-toggle" aria-controls="vehicle-card-details"></button>
          <div class="vehicle-card-body" id="vehicle-card-details">
            ${details.sections
              .map((s) => `<h3>${escapeHtml(s.heading)}</h3><dl>${s.rows.map(([label]) => `<dt>${escapeHtml(label)}</dt><dd></dd>`).join('')}</dl>`)
              .join('')}
          </div>`;
        values = [...card.querySelectorAll<HTMLElement>('dd')];
        showDetails(detailsOpen);
        if (pictureUrl) showPicture(pictureUrl);
        if (focused) card.querySelector<HTMLElement>(`.${focused.split(' ')[0]}`)?.focus();
      }
      card.querySelector('h2')!.firstChild!.textContent = `${details.title} `;
      rows.forEach(([, value], i) => {
        if (values[i].textContent !== value) values[i].textContent = value;
      });
      card.hidden = false;
    },
    /** Show a picture of the vehicle's model (once it's drawn) for vehicle `id`, if its card is still open. */
    picture(id: number, dataUrl: string) {
      if (shownFor !== id) return;
      pictureUrl = dataUrl;
      showPicture(dataUrl);
    },
    /** The vehicle has left the board: say so, and keep its last details. */
    gone() {
      const h2 = card.querySelector('h2');
      if (h2 && !card.classList.contains('vehicle-gone')) {
        card.classList.add('vehicle-gone');
        h2.insertAdjacentHTML('beforeend', ' <span class="vehicle-gone-note">· left the board</span>');
      }
    },
    hide() {
      card.hidden = true;
      pictureUrl = null;
      card.classList.remove('vehicle-gone');
      shownFor = null;
    },
    get open() {
      return !card.hidden;
    },
  };
}
