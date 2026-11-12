/** A part the player can drag from the dock: a road piece or a traffic control. */
export interface Part {
  id: PartId;
  label: string;
  group: PartGroup;
  /** What it places: a road piece (by `PIECES` id) or a control on an approach. */
  kind: 'piece' | 'control';
}

export type PartGroup = 'Roads' | 'Curves' | 'Junctions' | 'Ends' | 'Flyovers' | 'Controls';

export type PartId =
  | 'straight'
  | 'crossing'
  | 'driveway'
  | 'bend'
  | 'curve'
  | 't-junction'
  | 'crossroad'
  | 'curve-t-junction'
  | 'roundabout'
  | 'split'
  | 'turnaround'
  | 'dead-end'
  | 'ramp'
  | 'ramp-steep'
  | 'bridge'
  | 'support'
  | 'signal'
  | 'stop'
  | 'yield';

/** The parts drawer, grouped by purpose in the order it shows them. */
export const PARTS: readonly Part[] = [
  { id: 'straight', label: 'Straight road', group: 'Roads', kind: 'piece' },
  { id: 'crossing', label: 'Pedestrian crossing', group: 'Roads', kind: 'piece' },
  { id: 'driveway', label: 'Driveway', group: 'Roads', kind: 'piece' },
  { id: 'bend', label: 'Tight bend', group: 'Curves', kind: 'piece' },
  { id: 'curve', label: 'Wide curve', group: 'Curves', kind: 'piece' },
  { id: 't-junction', label: 'T-junction', group: 'Junctions', kind: 'piece' },
  { id: 'crossroad', label: 'Crossroads', group: 'Junctions', kind: 'piece' },
  { id: 'curve-t-junction', label: 'Curved T-junction', group: 'Junctions', kind: 'piece' },
  { id: 'roundabout', label: 'Roundabout', group: 'Junctions', kind: 'piece' },
  { id: 'split', label: 'Road split (2 lanes to 1)', group: 'Junctions', kind: 'piece' },
  { id: 'turnaround', label: 'Turnaround', group: 'Ends', kind: 'piece' },
  { id: 'dead-end', label: 'Dead end', group: 'Ends', kind: 'piece' },
  { id: 'ramp', label: 'Ramp', group: 'Flyovers', kind: 'piece' },
  { id: 'ramp-steep', label: 'Steep ramp', group: 'Flyovers', kind: 'piece' },
  { id: 'bridge', label: 'Bridge', group: 'Flyovers', kind: 'piece' },
  { id: 'support', label: 'Support', group: 'Flyovers', kind: 'piece' },
  { id: 'signal', label: 'Traffic light', group: 'Controls', kind: 'control' },
  { id: 'stop', label: 'Stop sign', group: 'Controls', kind: 'control' },
  { id: 'yield', label: 'Give way sign', group: 'Controls', kind: 'control' },
];

export const partById = (id: PartId) => PARTS.find((p) => p.id === id)!;
