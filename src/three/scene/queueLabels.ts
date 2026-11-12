import { Group, type Sprite } from 'three';
import { boardToWorld } from '../../scenes/board';
import type { Approach } from '../../simulation/measures/measures';
import { badgeMaterial, textSprite } from './badges';

/** Amber with white bold numerals (about 3.6:1, enough for large bold text over the 3D scene). */
const QUEUE_COLOR = '#b86e00';
/** How far back up the approach from the stop line the label sits, tiles. */
const LABEL_SETBACK = 0.7;
/** How high above the road the label floats, world units. */
const LABEL_HEIGHT = 1.8;
/** Queue labels are a little smaller than gateway badges (world units). */
const LABEL_SIZE = 1.5;

/** A live queue count floating over each controlled approach, hidden while it's empty. */
export function createQueueLabels(approaches: Approach[]) {
  const group = new Group();
  group.name = 'queue-labels';
  const labels: (Sprite | null)[] = approaches.map((approach) => {
    if (!approach.at) return null;
    const [x, level, z] = approach.at;
    const [wx, wy, wz] = boardToWorld([x + approach.upstream[0] * LABEL_SETBACK, level, z + approach.upstream[1] * LABEL_SETBACK]);
    const label = textSprite('0', QUEUE_COLOR);
    label.position.set(wx, wy + LABEL_HEIGHT, wz);
    label.scale.setScalar(LABEL_SIZE);
    label.visible = false;
    label.name = `queue-${approach.name}`;
    group.add(label);
    return label;
  });
  const shown: number[] = approaches.map(() => 0);
  return {
    group,
    /** Show each approach's live queue (vehicles); updates only labels whose count changed. */
    update(live: readonly number[]) {
      live.forEach((count, i) => {
        const label = labels[i];
        if (!label || count === shown[i]) return;
        shown[i] = count;
        label.visible = count > 0;
        if (count > 0) label.material = badgeMaterial(count > 99 ? '99+' : String(count), QUEUE_COLOR);
      });
    },
    /** How many queue labels are showing (for the browser check). */
    visibleCount: () => labels.filter((l) => l?.visible).length,
  };
}
