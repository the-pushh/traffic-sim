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
}

/** A piece snaps to an open road end when its matching port would be this close to the pointer, tiles. */
const SNAP_RADIUS = 1.1;
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
  const placement: PiecePlacement = snap?.placement ?? { piece: request.part, at: gridPosition(request.part, request.rotation, request.pointer), rotation: request.rotation, level: request.level ?? 0 };
  if (!def.ports.length) placement.level = request.level ?? 0;
  const edited: SceneDefinition = { ...scene, pieces: [...scene.pieces, placement] };
  const fail = (reason: string): PlacementResult => ({ valid: false, reason, scene: null, placement, snappedTo: snap?.at ?? null });

  if (validateScene(edited).some((e) => e.startsWith(`Piece ${scene.pieces.length}:`) && e.includes('off the'))) return fail('Off the board');
  if (scene.pieces.some((other) => overlaps(other, placement))) return fail('Something’s already there');
  const heightProblem = heightMismatch(scene, placement);
  if (heightProblem) return fail(heightProblem);
  const before = buildLaneGraph(scene.pieces).mismatches.length;
  const mismatches = buildLaneGraph(edited.pieces).mismatches;
  if (mismatches.length > before) return fail(mismatches[mismatches.length - 1].reason);
  return { valid: true, scene: edited, placement, snappedTo: snap?.at ?? null };
}

/** The nearest open road end that one of the piece's ports (at this rotation) can meet, and the placement that meets it. */
function snapToOpenEnd(scene: SceneDefinition, request: PlacementRequest) {
  const def = PIECES[request.part];
  let best: { placement: PiecePlacement; at: [number, number, number]; distance: number } | null = null;
  for (const end of openRoadEnds(scene)) {
    for (const port of def.ports.filter((p) => p.profile === 'road')) {
      const facing = rotate(port.facing, request.rotation);
      // Our port must face back into the existing road.
      if (Math.abs(facing[0] + end.facing[0]) > EPSILON || Math.abs(facing[1] + end.facing[1]) > EPSILON) continue;
      const offset = rotate(port.at, request.rotation);
      const at: [number, number] = [end.at[0] - offset[0], end.at[2] - offset[1]];
      const distance = Math.hypot(at[0] - request.pointer[0], at[1] - request.pointer[1]);
      if (distance > SNAP_RADIUS || (best && distance >= best.distance)) continue;
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
