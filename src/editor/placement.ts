import { buildLaneGraph, portPose } from '../simulation/network/buildLaneGraph';
import { rotate } from '../simulation/network/geometry';
import { PIECES } from '../simulation/network/pieces';
import type { ControlPlacement, PiecePlacement, PortFlow, QuarterTurn, SceneDefinition } from '../simulation/network/scene';
import { BOARD_TILES, validateScene } from '../simulation/network/scene';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import { partById, type PartId } from './parts';

/** Where the player is dropping (or previewing) a part, in board tiles. */
export interface PlacementRequest {
  part: PartId;
  pointer: [number, number];
  rotation: QuarterTurn;
  /** Height to place at when not snapping (tiles). */
  level?: number;
  /** Snap to a nearby open road end (default true). */
  snap?: boolean;
}

/** What would happen: the same answer for the translucent preview and for the drop. */
export interface PlacementResult {
  valid: boolean;
  /** Why not, in plain words, when invalid. */
  reason?: string;
  /** The scene with the part in place (null when invalid). */
  scene: SceneDefinition | null;
  placement?: PiecePlacement;
  control?: ControlPlacement;
  /** The open road end the piece snapped to, [x, level, z], to highlight; null if placed freely. */
  snappedTo: [number, number, number] | null;
  /** Pieces that become junctions to take the new road (the new piece itself is index = pieces.length - 1). */
  joins?: Join[];
}

/** A piece turned into a junction so a road touching its side connects. */
export interface Join {
  index: number;
  from: string;
  to: string;
}

/** A piece snaps to an open road end when its matching port would be this close to the pointer, tiles. */
const SNAP_RADIUS = 1.1;
/** Joining the side of a road needs the pointer over the tile the new piece would take, tiles. */
const JOIN_SNAP_RADIUS = 0.6;
/** A control lands on an approach whose opening is this close to the pointer, tiles. */
const CONTROL_RADIUS = 0.8;
/** Pieces where traffic meets: a control has to go on one of their approaches. */
const CONTROLLABLE = new Set(['t-junction', 'crossroad', 'curve-t-junction', 'roundabout', 'crossing', 'split']);
const EPSILON = 1e-6;

/**
 * Decide where a part would go and whether it may: snapping a road piece to a nearby open
 * road end (matching its height and one-way direction), otherwise onto the grid under the
 * pointer; controls go on the junction approach nearest the pointer.
 */
export function placePart(scene: SceneDefinition, request: PlacementRequest): PlacementResult {
  return partById(request.part).kind === 'control' ? placeControl(scene, request) : placePiece(scene, request);
}

function placePiece(scene: SceneDefinition, request: PlacementRequest): PlacementResult {
  const def = PIECES[request.part];
  const snap = request.snap === false ? null : snapToOpenEnd(scene, request);
  let placement: PiecePlacement = snap?.placement ?? { piece: request.part, at: gridPosition(request.part, request.rotation, request.pointer), rotation: request.rotation, level: request.level ?? 0 };
  if (!def.ports.length) placement.level = request.level ?? 0;
  // Roads that touch the side of a piece join it: that piece becomes a junction.
  const joined = joinTouching(scene, placement);
  placement = joined.placement;
  const edited: SceneDefinition = { ...joined.scene, pieces: [...joined.scene.pieces, placement] };
  const fail = (reason: string): PlacementResult => ({ valid: false, reason, scene: null, placement, snappedTo: snap?.at ?? null });

  if (validateScene(edited).some((e) => e.startsWith(`Piece ${scene.pieces.length}:`) && e.includes('off the'))) return fail('Off the board');
  if (scene.pieces.some((other) => overlaps(other, placement))) return fail('Something’s already there');
  const heightProblem = heightMismatch(scene, placement);
  if (heightProblem) return fail(heightProblem);
  const before = buildLaneGraph(scene.pieces).mismatches.length;
  const mismatches = buildLaneGraph(edited.pieces).mismatches;
  if (mismatches.length > before) return fail(mismatches[mismatches.length - 1].reason);
  return { valid: true, scene: edited, placement, snappedTo: snap?.at ?? null, ...(joined.joins.length && { joins: joined.joins }) };
}

/** The nearest open road end that one of the piece's ports (at this rotation) can meet, and the placement that meets it. */
function snapToOpenEnd(scene: SceneDefinition, request: PlacementRequest) {
  const def = PIECES[request.part];
  let best: { placement: PiecePlacement; at: [number, number, number]; distance: number } | null = null;
  const candidates = [...openRoadEnds(scene).map((e) => ({ ...e, radius: SNAP_RADIUS })), ...joinPoints(scene).map((e) => ({ ...e, radius: JOIN_SNAP_RADIUS }))];
  for (const end of candidates) {
    for (const port of def.ports.filter((p) => p.profile === 'road')) {
      const facing = rotate(port.facing, request.rotation);
      // Our port must face back into the existing road.
      if (Math.abs(facing[0] + end.facing[0]) > EPSILON || Math.abs(facing[1] + end.facing[1]) > EPSILON) continue;
      const offset = rotate(port.at, request.rotation);
      const at: [number, number] = [end.at[0] - offset[0], end.at[2] - offset[1]];
      const distance = Math.hypot(at[0] - request.pointer[0], at[1] - request.pointer[1]);
      if (distance > end.radius || (best && distance >= best.distance)) continue;
      const placement: PiecePlacement = { piece: request.part, at, rotation: request.rotation, level: end.at[1] - port.level };
      const flow = continuedFlow(request.part, port.id, end.flow);
      if (flow) placement.flow = flow;
      best = { placement, at: end.at, distance };
    }
  }
  return best;
}

/** Open road ends in the scene: unconnected road ports inside the board, with their one-way setting. */
function openRoadEnds(scene: SceneDefinition) {
  const ports = scene.pieces.flatMap((placement) =>
    PIECES[placement.piece].ports
      .filter((p) => p.profile === 'road')
      .map((port) => {
        const { centre, facing } = portPose(placement, port.id);
        return { at: centre, facing, flow: (placement.flow?.[port.id] ?? port.flow ?? 'two-way') as PortFlow };
      }),
  );
  const same = (a: [number, number, number], b: [number, number, number]) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON && Math.abs(a[2] - b[2]) < EPSILON;
  const inside = (p: [number, number, number]) => p[0] > EPSILON && p[2] > EPSILON && p[0] < BOARD_TILES - EPSILON && p[2] < BOARD_TILES - EPSILON;
  return ports.filter((p, i) => inside(p.at) && !ports.some((q, j) => j !== i && same(p.at, q.at)));
}

/**
 * A straight-through piece joining a one-way road carries the one-way on: traffic that
 * leaves the old road arrives through our port and leaves through the other.
 */
function continuedFlow(piece: string, portId: string, endFlow: PortFlow): Record<string, PortFlow> | undefined {
  const def = PIECES[piece];
  const roadPorts = def.ports.filter((p) => p.profile === 'road');
  if (endFlow === 'two-way' || roadPorts.length !== 2) return undefined;
  const other = roadPorts.find((p) => p.id !== portId)!.id;
  const ours: PortFlow = endFlow === 'out' ? 'in' : 'out';
  return { [portId]: ours, [other]: ours === 'in' ? 'out' : 'in' };
}

/** The piece's centre on the grid under the pointer: whole tiles for odd sizes, tile corners for even ones. */
function gridPosition(piece: string, rotation: QuarterTurn, pointer: [number, number]): [number, number] {
  const { min, max } = PIECES[piece].footprint;
  const [a, b] = [rotate(min, rotation), rotate(max, rotation)];
  const size = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
  const snapAxis = (value: number, extent: number) => (Math.round(extent) % 2 === 1 ? Math.floor(value) + 0.5 : Math.round(value));
  return [snapAxis(pointer[0], size[0]), snapAxis(pointer[1], size[1])];
}

/** Whether two pieces would occupy the same space: footprints overlap at overlapping heights (a bridge clears the road below, a ramp sits on its support). */
function overlaps(a: PiecePlacement, b: PiecePlacement) {
  const [ra, rb] = [footprintRect(a), footprintRect(b)];
  const width = Math.min(ra[2], rb[2]) - Math.max(ra[0], rb[0]);
  const depth = Math.min(ra[3], rb[3]) - Math.max(ra[1], rb[1]);
  if (width <= EPSILON || depth <= EPSILON) return false;
  const [ha, hb] = [heightBand(a), heightBand(b)];
  return ha[0] < hb[1] - EPSILON && hb[0] < ha[1] - EPSILON;
}

function footprintRect(p: PiecePlacement): [number, number, number, number] {
  const { min, max } = PIECES[p.piece].footprint;
  const [a, b] = [rotate(min, p.rotation), rotate(max, p.rotation)];
  return [p.at[0] + Math.min(a[0], b[0]), p.at[1] + Math.min(a[1], b[1]), p.at[0] + Math.max(a[0], b[0]), p.at[1] + Math.max(a[1], b[1])];
}

/** The height a piece's road surface spans (a support block fills up to the ramp on it). */
function heightBand(p: PiecePlacement): [number, number] {
  const level = p.level ?? 0;
  const ports = PIECES[p.piece].ports;
  if (!ports.length) return [level, level + 0.2];
  const levels = ports.map((port) => level + port.level);
  return [Math.min(...levels) - 0.05, Math.max(...levels) + 0.05];
}

/** A road end of the new piece sitting on an open end at a different height. */
function heightMismatch(scene: SceneDefinition, placement: PiecePlacement): string | null {
  const ends = openRoadEnds(scene);
  for (const port of PIECES[placement.piece].ports) {
    const { centre } = portPose(placement, port.id);
    const below = ends.find((e) => Math.abs(e.at[0] - centre[0]) < EPSILON && Math.abs(e.at[2] - centre[2]) < EPSILON);
    if (below && Math.abs(below.at[1] - centre[1]) > EPSILON) return 'Ramp needed to connect these heights';
  }
  return null;
}

function placeControl(scene: SceneDefinition, request: PlacementRequest): PlacementResult {
  const type = request.part as ControlPlacement['type'];
  let best: { piece: number; port: string; distance: number } | null = null;
  scene.pieces.forEach((placement, piece) => {
    if (!CONTROLLABLE.has(placement.piece)) return;
    for (const port of PIECES[placement.piece].ports) {
      const flow = placement.flow?.[port.id] ?? port.flow ?? 'two-way';
      if (port.profile !== 'road' || flow === 'out') continue;
      const { centre } = portPose(placement, port.id);
      const distance = Math.hypot(centre[0] - request.pointer[0], centre[2] - request.pointer[1]);
      if (distance <= CONTROL_RADIUS && (!best || distance < best.distance)) best = { piece, port: port.id, distance };
    }
  });
  if (!best) return { valid: false, reason: 'Drop it where a road enters a junction', scene: null, snappedTo: null };
  const { piece, port } = best as { piece: number; port: string };
  const control: ControlPlacement = type === 'signal' ? { type, piece, port, timing: { ...DEFAULT_SIGNAL_TIMING } } : { type, piece, port };
  const controls = [...scene.controls.filter((c) => !(c.piece === piece && c.port === port)), control];
  const { centre } = portPose(scene.pieces[piece], port);
  return { valid: true, scene: { ...scene, controls }, control, snappedTo: centre };
}

// ---- Joining: a road end against the side of a plain road piece turns it into a junction ----

type Compass = 'n' | 'e' | 's' | 'w';
const COMPASS: Record<Compass, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const compassOf = ([x, z]: [number, number]): Compass => (Math.abs(x) > Math.abs(z) ? (x > 0 ? 'e' : 'w') : z > 0 ? 's' : 'n');
/** One-tile, ground-level, two-way road pieces that can grow an arm (and the shapes they can become). */
const JOINABLE = new Set(['straight', 'bend', 't-junction']);
const JUNCTION_SHAPES = ['straight', 'bend', 't-junction', 'crossroad'];
const ROTATIONS: QuarterTurn[] = [0, 90, 180, 270];

/** The compass directions a placed piece's road ends face. */
function armsOf(p: PiecePlacement): Set<Compass> {
  return new Set(PIECES[p.piece].ports.filter((port) => port.profile === 'road').map((port) => compassOf(rotate(port.facing, p.rotation))));
}

/** Whether this placed piece can take another arm. */
function canJoin(p: PiecePlacement) {
  return JOINABLE.has(p.piece) && !p.flow && !p.speedLimit && (p.level ?? 0) === 0;
}

/** The one-tile piece and turn whose road ends face exactly these directions, if there is one. */
function shapeWithArms(arms: Set<Compass>): { piece: string; rotation: QuarterTurn } | null {
  for (const piece of JUNCTION_SHAPES) {
    for (const rotation of ROTATIONS) {
      const own = armsOf({ piece, at: [0, 0], rotation });
      if (own.size === arms.size && [...arms].every((a) => own.has(a))) return { piece, rotation };
    }
  }
  return null;
}

/** The midpoints of a joinable piece's sides with no road end, where a road could join it, facing out. */
function joinPoints(scene: SceneDefinition) {
  return scene.pieces.filter(canJoin).flatMap((p) => {
    const arms = armsOf(p);
    return (Object.keys(COMPASS) as Compass[])
      .filter((side) => !arms.has(side))
      .map((side) => ({ at: [p.at[0] + COMPASS[side][0] / 2, 0, p.at[1] + COMPASS[side][1] / 2] as [number, number, number], facing: COMPASS[side], flow: 'two-way' as PortFlow }));
  });
}

/** The same piece grown an arm towards `side`, keeping its controls on the approaches they were on. */
function grow(p: PiecePlacement, side: Compass): PiecePlacement | null {
  const shape = shapeWithArms(new Set([...armsOf(p), side]));
  return shape ? { piece: shape.piece, at: p.at, rotation: shape.rotation, level: p.level ?? 0 } : null;
}

/** The port of `to` that faces the same way as `portId` did on `from`. */
function samePort(from: PiecePlacement, portId: string, to: PiecePlacement): string | undefined {
  const facing = compassOf(rotate(PIECES[from.piece].ports.find((port) => port.id === portId)!.facing, from.rotation));
  return PIECES[to.piece].ports.find((port) => port.profile === 'road' && compassOf(rotate(port.facing, to.rotation)) === facing)?.id;
}

const near = (a: number, b: number) => Math.abs(a - b) < EPSILON;

/**
 * Grow arms where roads touch: on old pieces whose side the new piece's road ends touch, and
 * on the new piece where an old open road end touches its side. Controls follow their approach.
 */
function joinTouching(scene: SceneDefinition, placement: PiecePlacement) {
  const joins: Join[] = [];
  const pieces = [...scene.pieces];
  let controls = scene.controls;
  const level = placement.level ?? 0;
  const newEnds = PIECES[placement.piece].ports.filter((port) => port.profile === 'road').map((port) => portPose(placement, port.id));
  pieces.forEach((old, index) => {
    if (!canJoin(old) || !near(level, 0)) return;
    for (const end of newEnds) {
      if (!near(end.centre[1], 0)) continue;
      const [dx, dz] = [end.centre[0] - old.at[0], end.centre[2] - old.at[1]];
      // The new road end sits on the middle of one of this piece's sides.
      const onSide = (near(Math.abs(dx), 0.5) && near(dz, 0)) || (near(Math.abs(dz), 0.5) && near(dx, 0));
      if (!onSide) continue;
      const side = compassOf([dx, dz]);
      if (armsOf(pieces[index]).has(side)) continue; // already a road end there
      const grown = grow(pieces[index], side);
      if (!grown) continue;
      controls = controls.flatMap((c) => {
        if (c.piece !== index) return [c];
        const port = samePort(pieces[index], c.port, grown);
        return port ? [{ ...c, port }] : [];
      });
      joins.push({ index, from: old.piece, to: grown.piece });
      pieces[index] = grown;
    }
  });
  // An old open road end against the new piece's side: the new piece grows the arm.
  let placed = placement;
  if (canJoin(placement)) {
    for (const end of openRoadEnds({ ...scene, pieces })) {
      const [dx, dz] = [end.at[0] - placed.at[0], end.at[2] - placed.at[1]];
      const onSide = (near(Math.abs(dx), 0.5) && near(dz, 0)) || (near(Math.abs(dz), 0.5) && near(dx, 0));
      if (!onSide || !near(end.at[1], 0) || end.flow !== 'two-way') continue;
      const side = compassOf([dx, dz]);
      if (armsOf(placed).has(side)) continue;
      const grown = grow(placed, side);
      if (!grown) continue;
      joins.push({ index: scene.pieces.length, from: placed.piece, to: grown.piece });
      placed = grown;
    }
  }
  return { scene: { ...scene, pieces, controls }, placement: placed, joins };
}
