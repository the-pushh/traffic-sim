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
import wrench from '@phosphor-icons/core/assets/bold/wrench-bold.svg?raw';
import caret from '@phosphor-icons/core/assets/bold/caret-down-bold.svg?raw';
import check from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';

const SOURCES = { play, pause, restart, clock, gauge, plus, minus, moon, sun, rotate, wrench, caret, check };

export type IconName = keyof typeof SOURCES;

/** An icon's SVG markup, decorative (hidden from screen readers: the control's label says what it does). */
export function icon(name: IconName): string {
  return SOURCES[name].replace('<svg ', `<svg class="icon icon-${name}" aria-hidden="true" focusable="false" `);
}
