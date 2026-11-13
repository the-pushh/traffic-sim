// Phosphor icons (MIT, @phosphor-icons/core), inlined at build time so they take currentColor.
import play from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import pause from '@phosphor-icons/core/assets/fill/pause-fill.svg?raw';
import restart from '@phosphor-icons/core/assets/bold/arrow-counter-clockwise-bold.svg?raw';
import clock from '@phosphor-icons/core/assets/bold/clock-bold.svg?raw';
import gauge from '@phosphor-icons/core/assets/bold/gauge-bold.svg?raw';
import plus from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import minus from '@phosphor-icons/core/assets/bold/minus-bold.svg?raw';
import moon from '@phosphor-icons/core/assets/bold/moon-bold.svg?raw';
import sun from '@phosphor-icons/core/assets/bold/sun-bold.svg?raw';
import rotate from '@phosphor-icons/core/assets/bold/arrow-clockwise-bold.svg?raw';
// Phosphor's regular wrench and mirrored hammer (MIT), crossed into one icon for Customise (lighter than the
// bold set on purpose: the crossed tools stay legible at 22 px).
import toolsCrossed from './icons-custom/tools-crossed.svg?raw';

const SOURCES = { play, pause, restart, clock, gauge, plus, minus, moon, sun, rotate, toolsCrossed };

export type IconName = keyof typeof SOURCES;

/** An icon's SVG markup, decorative (hidden from screen readers: the control's label says what it does). */
export function icon(name: IconName): string {
  return SOURCES[name].replace('<svg ', `<svg class="icon icon-${name}" aria-hidden="true" focusable="false" `);
}
