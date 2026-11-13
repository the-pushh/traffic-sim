import { PARTS } from '../editor/parts';
import type { LaneGraph, Point3 } from '../simulation/network/buildLaneGraph';
import { pointAlongLane } from '../simulation/network/laneGeometry';
import type { SceneDefinition } from '../simulation/network/scene';
import { METRES_PER_TILE, type VehicleState } from '../simulation/traffic/trafficSimulation';

/** A vehicle's card: a title, labelled rows in sections, and the rest of its route to draw on the map. */
export interface VehicleDetails {
  title: string;
  /** What the card shows first: the driver and their habits, the speed, what it's doing, where it's going. */
  highlights: [string, string][];
  sections: { heading: string; rows: [string, string][] }[];
  /** Board points (tiles; x, height, z) from the vehicle to the end of its route. */
  path: Point3[];
}

/** How many of the road pieces ahead the card names. */
const PIECES_AHEAD = 4;
const kmh = (metresPerSecond: number) => `${Math.round(metresPerSecond * 3.6)} km/h`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const fixed = (value: number, unit: string, digits = 1) => `${value.toFixed(digits)} ${unit}`;

/** What a road piece is called on the card: its name in the parts tray, or its id in words. */
function pieceName(piece: string) {
  const part = PARTS.find((p) => p.id === piece);
  if (part) return part.label;
  const words = piece.replace(/-/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
}

function compass([x, z]: [number, number]) {
  const angle = Math.atan2(z, x);
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return names[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

/**
 * Everything set for a vehicle (its type's abilities and its driver's preferences), where it
 * is and what it's doing, and the rest of its trip, for the card shown when it's clicked.
 */
export function describeVehicle(v: VehicleState, graph: LaneGraph, scene: SceneDefinition): VehicleDetails {
  const lane = graph.lanes[v.route[v.routeIndex]];
  const { point, heading } = pointAlongLane(lane, v.position / METRES_PER_TILE);
  const ahead = v.route.slice(v.routeIndex);
  const remaining = ahead.reduce((sum, id) => sum + graph.lanes[id].length * METRES_PER_TILE, 0) - v.position;

  // The pieces still to drive through, each once, in order.
  const pieces: number[] = [];
  for (const id of ahead) if (pieces.at(-1) !== graph.lanes[id].piece) pieces.push(graph.lanes[id].piece);
  const upcoming = pieces.slice(1, 1 + PIECES_AHEAD).map((i) => pieceName(scene.pieces[i].piece));

  // The path from here: the rest of this lane, then every lane after it.
  const path: Point3[] = [point];
  let travelled = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const [a, b] = [lane.points[i - 1], lane.points[i]];
    travelled += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (travelled > v.position / METRES_PER_TILE) path.push(b);
  }
  for (const id of ahead.slice(1)) path.push(...graph.lanes[id].points.slice(1));

  const d = v.driver;
  const headingFor = graph.accessPoints.some((a) => a.label === v.destination) ? `driveway ${v.destination}` : `exit ${v.destination}`;
  const distanceLeft = `${Math.round(remaining)} m`;
  return {
    title: `${v.type.label} · ${d.label} driver`,
    highlights: [
      ['Driver', d.label],
      ['Habits', `${fixed(d.headway, 's')} gap · obeys ${percent(d.compliance)}`],
      ['Speed', `${kmh(v.speed)} (wants ${Math.round(v.preferredSpeed * 3.6)})`],
      ['Doing', v.reason],
      ['Heading for', `${headingFor} · ${distanceLeft}`],
    ],
    sections: [
      {
        heading: 'Vehicle',
        rows: [
          ['Length', fixed(v.type.length, 'm')],
          ['Top speed', kmh(v.type.maxSpeed)],
          ['Strongest acceleration', fixed(v.type.maxAcceleration, 'm/s²')],
          ['Hardest braking', fixed(v.type.maxBraking, 'm/s²')],
        ],
      },
      {
        heading: 'Driver',
        rows: [
          ['Profile', d.label],
          ['Speed against the limit', `× ${d.speedFactor.toFixed(2)}`],
          ['Following time', fixed(d.headway, 's')],
          ['Smallest gap', fixed(d.minGap, 'm')],
          ['Acceleration used', `${percent(d.acceleration)} of its best`],
          ['Comfortable braking', fixed(d.comfortBraking, 'm/s²')],
          ['Gap accepted at junctions', fixed(d.acceptedGap, 's')],
          ['Obeys signs and signals', `${percent(d.compliance)} of the time`],
          ['Patience', `${Math.round(d.patience)} s`],
          ['Lets others out', `${percent(d.courtesy)} of the time`],
          ['Watches for queues', percent(d.routeAwareness)],
        ],
      },
      {
        heading: 'Now',
        rows: [
          ['Position', `tile ${point[0].toFixed(1)}, ${point[2].toFixed(1)}`],
          ['On', pieceName(scene.pieces[lane.piece].piece)],
          ['Heading', compass(heading)],
          ['Speed', kmh(v.speed)],
          ['Wants', kmh(v.preferredSpeed)],
          ['Acceleration', fixed(v.acceleration, 'm/s²')],
          ['Doing', v.reason],
          ['Held up', `${Math.round(v.heldUp)} s recently`],
        ],
      },
      {
        heading: 'Trajectory',
        rows: [
          ['Heading for', headingFor],
          ['Distance left', distanceLeft],
          ['Next', upcoming.length ? upcoming.join(' → ') : 'Leaving the board'],
          ...(v.blocked ? ([['Note', 'No way through to its exit']] as [string, string][]) : []),
        ],
      },
    ],
    path,
  };
}
