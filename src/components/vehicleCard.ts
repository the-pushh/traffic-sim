import type { VehicleDetails } from './vehicleDetails';

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The card for a clicked vehicle, in the same place and style as the road inspector: its
 * type's and driver's settings, where it is and what it's doing, and the rest of its trip.
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
  let values: HTMLElement[] = [];

  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('.vehicle-card-close')) onClose();
  });

  return {
    element: card,
    /** Show (or refresh) the card for vehicle `id`. */
    show(id: number, details: VehicleDetails) {
      if (shownFor !== id || values.length !== details.sections.reduce((n, s) => n + s.rows.length, 0)) {
        shownFor = id;
        card.innerHTML = `
          <header>
            <h2>${escapeHtml(details.title)} <span class="vehicle-id">#${id}</span></h2>
            <button type="button" class="vehicle-card-close" aria-label="Close vehicle details">×</button>
          </header>
          <div class="vehicle-card-body">
            ${details.sections
              .map((s) => `<h3>${escapeHtml(s.heading)}</h3><dl>${s.rows.map(([label]) => `<dt>${escapeHtml(label)}</dt><dd></dd>`).join('')}</dl>`)
              .join('')}
          </div>`;
        values = [...card.querySelectorAll<HTMLElement>('dd')];
      }
      card.querySelector('h2')!.firstChild!.textContent = `${details.title} `;
      const rows = details.sections.flatMap((s) => s.rows);
      rows.forEach(([, value], i) => {
        if (values[i].textContent !== value) values[i].textContent = value;
      });
      card.hidden = false;
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
      card.classList.remove('vehicle-gone');
      shownFor = null;
    },
    get open() {
      return !card.hidden;
    },
  };
}
