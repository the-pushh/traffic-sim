/**
 * Shared corner rounding: a rounded rectangle's radius is its shorter side times
 * `--corner-ratio` (main.css). Surfaces whose size depends on the layout get their
 * `--short-side` measured here, from their border box, whenever it changes.
 */

/** Surfaces sized by their content or the layout (controls use their size token instead). */
const MEASURED = ['.first-visit-tip', '.vehicle-tooltip', '.results-card', '.leave-dialog', '.parts-drawer', '.parts-group .part', '.inspector', '.placement-reason', '.duration-menu'].join(',');

/** The shorter side of a border box, px; null when it has no size (hidden), so the last value stays. */
export function shortSide(width: number, height: number): number | null {
  return width > 0 && height > 0 ? Math.min(width, height) : null;
}

/** The radius a rounded rectangle gets from its shorter side. */
export function cornerRadius(side: number, ratio: number): number {
  return side * ratio;
}

/** Keep `--short-side` up to date on every rounded surface in `root`, including ones added later. */
export function startCornerRounding(root: HTMLElement = document.body) {
  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0];
      const side = box ? shortSide(box.inlineSize, box.blockSize) : shortSide(entry.contentRect.width, entry.contentRect.height);
      if (side !== null) (entry.target as HTMLElement).style.setProperty('--short-side', `${Math.round(side * 10) / 10}px`);
    }
  });
  const watched = new WeakSet<Element>();
  const watch = (node: Element) => {
    const found = [...(node.matches(MEASURED) ? [node] : []), ...node.querySelectorAll(MEASURED)];
    for (const element of found) {
      if (watched.has(element)) continue;
      watched.add(element);
      sizes.observe(element, { box: 'border-box' });
    }
  };
  watch(root);
  new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes) if (node instanceof Element) watch(node);
  }).observe(root, { childList: true, subtree: true });
}
