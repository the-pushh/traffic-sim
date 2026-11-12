/** Whether a part is being placed, and how: dragged with the pointer, or moved with the arrow keys. */
export type PlacingMode = 'idle' | 'dragging' | 'keyboard';

export type PlacementKeyAction = 'rotate' | 'drop' | 'cancel';

interface KeyPress {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * What a key does to the part being placed; null when it's not the editor's to handle.
 * Space turns the part only while one is being placed (otherwise it pans the map), once
 * per press. R turns it at any time (the next part starts turned). Enter drops a part
 * placed with the keyboard; Escape cancels either kind of placement.
 */
export function placementKeyAction(press: KeyPress, mode: PlacingMode): PlacementKeyAction | null {
  const placing = mode !== 'idle';
  if (press.key === ' ') return placing && !press.repeat ? 'rotate' : null;
  if (press.key === 'r' || press.key === 'R') return press.ctrlKey || press.metaKey || press.altKey ? null : 'rotate';
  if (press.key === 'Enter') return mode === 'keyboard' ? 'drop' : null;
  if (press.key === 'Escape') return placing ? 'cancel' : null;
  return null;
}
