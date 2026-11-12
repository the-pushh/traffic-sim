import { Group, type Sprite } from 'three';
import { boardToWorld } from '../../scenes/board';
import type { Approach } from '../../simulation/measures/measures';
import { badgeMaterial, textSprite } from './badges';

const QUEUE_COLOR = '#b86e00';
/** How far back up the approach from the stop line the label sits, tiles; and how high, world units. */
const BACK = 0.7;
const HEIGHT = 1.8;

/** A live queue count floating over each controlled approach, hidden while it's empty. */
export function createQueueLabels(approaches: Approach[]) {
  const group = new Group();
  group.name = 'queue-labels';
  const labels: Sprite[] = approaches.map((approach) => {
    const [x, level, z] = approach.at;
    const [wx, wy, wz] = boardToWorld([x + approach.upstream[0] * BACK, level, z + approach.upstream[1] * BACK]);
    const label = textSprite('0', QUEUE_COLOR);
    label.position.set(wx, wy + HEIGHT, wz);
    label.scale.setScalar(1.5);
    label.visible = false;
    label.name = `queue-${approach.name}`;
    group.add(label);
    return label;
  });
  const shown: number[] = approaches.map(() => 0);
  return {
    group,
    /** Show each approach's live queue (vehicles); updates only labels whose count changed. */
    update(live: number[]) {
      live.forEach((count, i) => {
        if (count === shown[i]) return;
        shown[i] = count;
        labels[i].visible = count > 0;
        if (count > 0) labels[i].material = badgeMaterial(count > 99 ? '99+' : String(count), QUEUE_COLOR);
      });
    },
  };
}
