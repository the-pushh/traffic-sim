/** Narrower than this, the dock, panels and map don't fit, whatever the device, px. */
const NARROWEST = 768;

/**
 * Whether this is a phone or tablet, which get a message instead of the app (the owner's
 * choice: it's made for a laptop). Touch-first devices with no hover are phones and tablets;
 * a touchscreen laptop still hovers with its trackpad, so it gets the app.
 */
export function isHandheld({ width, coarsePointer, canHover }: { width: number; coarsePointer: boolean; canHover: boolean }): boolean {
  return width < NARROWEST || (coarsePointer && !canHover);
}

/** The same question about the browser this is running in. */
export function runningOnHandheld(): boolean {
  return isHandheld({
    width: Math.min(window.innerWidth, screen.width),
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    canHover: matchMedia('(any-hover: hover)').matches,
  });
}
