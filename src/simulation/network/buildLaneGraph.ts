import { PIECES, type PortDef } from './pieces';
import type { PiecePlacement } from './scene';

/** A point in board tiles: [x east, y up, z south]. */
export type Point3 = [number, number, number];

export interface Lane {
  id: number;
  /** Index of the placement this lane belongs to. */
  piece: number;
  points: Point3[];
  length: number;
  /** Lanes this one continues into, and lanes that continue into it. */
  next: number[];
  previous: number[];
}

/** Where traffic enters and leaves the board: a road end on the board edge. */
export interface Gateway {
  label: string;
  /** Board position of the road end, in tiles. */
  at: [number, number];
  /** Lanes that start here (traffic arriving) and lanes that end here (traffic leaving). */
  entryLanes: number[];
  exitLanes: number[];
}

/** A road end inside the board with nothing attached: where players can add a piece. */
export interface OpenEnd {
  at: [number, number];
  level: number;
  /** Outward direction of the opening. */
  facing: [number, number];
}

/** A driveway: local trips start (entry lanes) and end (exit lanes) here. */
export interface AccessPoint {
  at: [number, number];
  entryLanes: number[];
  exitLanes: number[];
}

export interface LaneGraph {
  lanes: Lane[];
  gateways: Gateway[];
  openEnds: OpenEnd[];
  accessPoints: AccessPoint[];
}

export const BOARD_TILES = 16;

/** Lane centres sit this far from the road's centre line, in tiles. */
const LANE_OFFSET = 0.2;
/** Centre of a lay-by bay lane from the road's centre line (bay spans 0.4–0.71). */
const BAY_OFFSET = 0.555;
/** Driveway lanes either side of the narrow opening's centre. */
const ACCESS_OFFSET = 0.06;
/** How far a turning-around lane loops past the road end. */
const U_TURN_HANDLE = 0.6;

/** Rotate a local (x, z) vector anticlockwise seen from above (same convention as three.js rotation.y). */
function rotate([x, z]: [number, number], degrees: number): [number, number] {
  const r = (degrees * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e9) / 1e9;
  const s = Math.round(Math.sin(r) * 1e9) / 1e9;
  return [x * c + z * s, -x * s + z * c];
}

/** The right-hand side of a heading, seen from above with x east and z south. */
function rightOf([hx, hz]: [number, number]): [number, number] {
  return [-hz, hx];
}

interface Slot {
  point: Point3;
  /** Travel direction through the slot. */
  direction: [number, number];
}

interface PlacedPort {
  def: PortDef;
  centre: Point3;
  facing: [number, number];
  /** Slots where traffic leaves the piece, and where it arrives. */
  out: Slot[];
  in: Slot[];
}

function placePort(placement: PiecePlacement, def: PortDef): PlacedPort {
  const [ox, oz] = rotate(def.at, placement.rotation);
  const facing = rotate(def.facing, placement.rotation);
  const y = (placement.level ?? 0) + def.level;
  const centre: Point3 = [placement.at[0] + ox, y, placement.at[1] + oz];
  const at = (side: [number, number], offset: number): Point3 => [centre[0] + side[0] * offset, y, centre[2] + side[1] * offset];
  const inward: [number, number] = [-facing[0], -facing[1]];
  const outSlot = (offset: number): Slot => ({ point: at(rightOf(facing), offset), direction: facing });
  const inSlot = (offset: number): Slot => ({ point: at(rightOf(inward), offset), direction: inward });

  const port = { def, centre, facing, out: [] as Slot[], in: [] as Slot[] };
  if (def.profile === 'access') {
    port.out.push(outSlot(ACCESS_OFFSET));
    port.in.push(inSlot(ACCESS_OFFSET));
    return port;
  }
  const flow = placement.flow?.[def.id] ?? def.flow ?? 'two-way';
  if (flow === 'out') port.out.push(outSlot(-LANE_OFFSET), outSlot(LANE_OFFSET));
  else if (flow === 'in') port.in.push(inSlot(-LANE_OFFSET), inSlot(LANE_OFFSET));
  else {
    port.out.push(outSlot(LANE_OFFSET));
    port.in.push(inSlot(LANE_OFFSET));
  }
  if (def.profile === 'layby') {
    if (def.bay === 'out') port.out.push(outSlot(BAY_OFFSET));
    else port.in.push(inSlot(BAY_OFFSET));
  }
  return port;
}

/**
 * Which arriving slot feeds which leaving slot. Straight through with equal lane
 * counts, each lane continues in its own lane; anything else (turns, merges, splits)
 * connects every combination.
 */
function slotPairs(from: PlacedPort, to: PlacedPort): [Slot, Slot][] {
  const straightThrough = from.facing[0] === -to.facing[0] && from.facing[1] === -to.facing[1];
  if (straightThrough && from.in.length === to.out.length) {
    const lateral = (slot: Slot) => {
      const right = rightOf(slot.direction);
      return slot.point[0] * right[0] + slot.point[2] * right[1];
    };
    const ins = [...from.in].sort((a, b) => lateral(a) - lateral(b));
    const outs = [...to.out].sort((a, b) => lateral(a) - lateral(b));
    return ins.map((slot, i) => [slot, outs[i]]);
  }
  return from.in.flatMap((a) => to.out.map((b) => [a, b] as [Slot, Slot]));
}

/** Where a piece's port sits on the board and which way it opens, e.g. to place a sign on that approach. */
export function portPose(placement: PiecePlacement, portId: string): { centre: Point3; facing: [number, number] } {
  const def = PIECES[placement.piece]?.ports.find((p) => p.id === portId);
  if (!def) throw new Error(`${placement.piece} has no port "${portId}"`);
  const { centre, facing } = placePort(placement, def);
  return { centre, facing };
}

/** Bézier handle length that makes a quarter turn a near-perfect circular arc. */
const ARC_HANDLE = 0.5523;
const CURVE_SAMPLES = 16;

/**
 * Lane centreline from an arriving slot to a leaving slot: a straight line when the
 * directions match, otherwise a cubic Bézier tangent to both (a circular arc for
 * quarter turns). Height changes linearly along the lane.
 */
function lanePath(start: Slot, end: Slot): Point3[] {
  const [a, b] = [start.point, end.point];
  const [d0, d1] = [start.direction, end.direction];
  if (d0[0] === d1[0] && d0[1] === d1[1]) return [a, b];
  if (d0[0] === -d1[0] && d0[1] === -d1[1]) return connector(a, d0, b, d1, U_TURN_HANDLE);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const radius = Math.abs(dx * d0[0] + dz * d0[1]);
  const handle = ARC_HANDLE * radius;
  const c1 = [a[0] + d0[0] * handle, a[2] + d0[1] * handle];
  const c2 = [b[0] - d1[0] * handle, b[2] - d1[1] * handle];
  const points: Point3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    points.push([
      w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
      a[1] + (b[1] - a[1]) * t,
      w[0] * a[2] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[2],
    ]);
  }
  return points;
}

/** Cubic Bézier between two points with arbitrary unit tangents. */
function connector(a: Point3, d0: [number, number], b: Point3, d1: [number, number], fixedHandle?: number): Point3[] {
  const handle = fixedHandle ?? 0.5 * Math.hypot(b[0] - a[0], b[2] - a[2]);
  const c1 = [a[0] + d0[0] * handle, a[2] + d0[1] * handle];
  const c2 = [b[0] - d1[0] * handle, b[2] - d1[1] * handle];
  const points: Point3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    points.push([
      w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
      a[1] + (b[1] - a[1]) * t,
      w[0] * a[2] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[2],
    ]);
  }
  // Land exactly on the end point so lanes join.
  points[0] = a;
  points[points.length - 1] = b;
  return points;
}

/**
 * Roundabout lanes: arcs around the ring between merge and diverge points, entry
 * connectors from each arm into the ring, and exit connectors out of it. Traffic
 * circulates anticlockwise seen from above (right-hand traffic). Angles use
 * x = r·cos φ, z = −r·sin φ, so increasing φ is anticlockwise.
 */
function ringLanes(placement: PiecePlacement, ports: PlacedPort[], ring: { radius: number; spread: number }): Point3[][] {
  const [cx, cz] = placement.at;
  const y = placement.level ?? 0;
  const spread = (ring.spread * Math.PI) / 180;
  const onRing = (phi: number): Point3 => [cx + ring.radius * Math.cos(phi), y, cz - ring.radius * Math.sin(phi)];
  const tangent = (phi: number): [number, number] => [-Math.sin(phi), -Math.cos(phi)];

  type RingEvent = { phi: number; point: Point3 };
  const events: RingEvent[] = [];
  const lanes: Point3[][] = [];
  for (const port of ports) {
    const armPhi = Math.atan2(-(port.centre[2] - cz), port.centre[0] - cx);
    const merge = { phi: armPhi + spread, point: onRing(armPhi + spread) };
    const diverge = { phi: armPhi - spread, point: onRing(armPhi - spread) };
    events.push(merge, diverge);
    for (const slot of port.in) lanes.push(connector(slot.point, slot.direction, merge.point, tangent(merge.phi)));
    for (const slot of port.out) lanes.push(connector(diverge.point, tangent(diverge.phi), slot.point, slot.direction));
  }
  const norm = (phi: number) => ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  events.sort((a, b) => norm(a.phi) - norm(b.phi));
  events.forEach((from, i) => {
    const to = events[(i + 1) % events.length];
    const start = norm(from.phi);
    const sweep = norm(to.phi - from.phi) || 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 24)));
    const arc: Point3[] = [];
    for (let k = 0; k <= steps; k++) arc.push(onRing(start + (sweep * k) / steps));
    arc[0] = from.point;
    arc[arc.length - 1] = to.point;
    lanes.push(arc);
  });
  return lanes;
}

function pathLength(points: Point3[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

export function buildLaneGraph(placements: PiecePlacement[]): LaneGraph {
  const lanes: Lane[] = [];
  const allPorts: PlacedPort[] = [];
  placements.forEach((placement, pieceIndex) => {
    const def = PIECES[placement.piece];
    if (!def) throw new Error(`Unknown piece "${placement.piece}"`);
    const ports = new Map(def.ports.map((p) => [p.id, placePort(placement, p)]));
    allPorts.push(...ports.values());
    const addLane = (points: Point3[]) =>
      lanes.push({ id: lanes.length, piece: pieceIndex, points, length: pathLength(points), next: [], previous: [] });
    if (def.ring) ringLanes(placement, [...ports.values()], def.ring).forEach(addLane);
    for (const [fromId, toId] of def.movements) {
      for (const [start, end] of slotPairs(ports.get(fromId)!, ports.get(toId)!)) addLane(lanePath(start, end));
    }
  });
  connectLanes(lanes);
  const { gateways, openEnds, accessPoints } = findLooseEnds(allPorts, lanes);
  return { lanes, gateways, openEnds, accessPoints };
}

function sameXZ(a: Point3, b: Point3) {
  return Math.abs(a[0] - b[0]) < SAME_POINT && Math.abs(a[2] - b[2]) < SAME_POINT;
}

/** Position of a board-edge point going clockwise from the north-west corner. */
function clockwiseFromNorthWest([x, z]: [number, number]) {
  const n = BOARD_TILES;
  if (Math.abs(z) < SAME_POINT) return x;
  if (Math.abs(x - n) < SAME_POINT) return n + z;
  if (Math.abs(z - n) < SAME_POINT) return 2 * n + (n - x);
  return 3 * n + (n - z);
}

function onBoardEdge([x, , z]: Point3) {
  return [x, z].some((v) => Math.abs(v) < SAME_POINT || Math.abs(v - BOARD_TILES) < SAME_POINT);
}

/** Ports with no matching port opposite them become gateways (on the edge) or open ends. */
function findLooseEnds(ports: PlacedPort[], lanes: Lane[]) {
  const loose = ports.filter(
    (port) =>
      !ports.some(
        (other) =>
          other !== port &&
          other.def.profile === port.def.profile &&
          sameXZ(other.centre, port.centre) &&
          Math.abs(other.centre[1] - port.centre[1]) < SAME_POINT &&
          other.facing[0] === -port.facing[0] &&
          other.facing[1] === -port.facing[1],
      ),
  );
  const startsAt = (slots: Slot[]) => lanes.filter((l) => slots.some((s) => pointKey(s.point) === pointKey(l.points[0]))).map((l) => l.id);
  const endsAt = (slots: Slot[]) =>
    lanes.filter((l) => slots.some((s) => pointKey(s.point) === pointKey(l.points[l.points.length - 1]))).map((l) => l.id);

  const accessPoints = loose
    .filter((port) => port.def.profile === 'access')
    .map((port) => ({ at: [port.centre[0], port.centre[2]] as [number, number], entryLanes: startsAt(port.in), exitLanes: endsAt(port.out) }));
  const roadEnds = loose.filter((port) => port.def.profile !== 'access');
  const gateways = roadEnds
    .filter((port) => onBoardEdge(port.centre))
    .map((port) => ({ at: [port.centre[0], port.centre[2]] as [number, number], entryLanes: startsAt(port.in), exitLanes: endsAt(port.out) }))
    .sort((a, b) => clockwiseFromNorthWest(a.at) - clockwiseFromNorthWest(b.at))
    .map((g, i) => ({ label: String.fromCharCode(65 + i), ...g }));
  const openEnds = roadEnds
    .filter((port) => !onBoardEdge(port.centre))
    .map((port) => ({ at: [port.centre[0], port.centre[2]] as [number, number], level: port.centre[1], facing: port.facing }));
  return { gateways, openEnds, accessPoints };
}

/** Points closer than this (in tiles) are the same place. */
const SAME_POINT = 1e-6;

function pointKey([x, y, z]: Point3) {
  const q = (v: number) => Math.round(v / SAME_POINT);
  return `${q(x)},${q(y)},${q(z)}`;
}

/**
 * A lane continues into every lane that starts exactly where it ends, height
 * included, so a road passing under a bridge never connects to it.
 */
function connectLanes(lanes: Lane[]) {
  const startingAt = new Map<string, Lane[]>();
  for (const lane of lanes) {
    const key = pointKey(lane.points[0]);
    startingAt.set(key, [...(startingAt.get(key) ?? []), lane]);
  }
  for (const lane of lanes) {
    for (const next of startingAt.get(pointKey(lane.points[lane.points.length - 1])) ?? []) {
      lane.next.push(next.id);
      next.previous.push(lane.id);
    }
  }
}
