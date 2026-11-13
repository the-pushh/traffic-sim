import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { PIECES } from '../simulation/network/pieces';
import type { ControlPlacement, PiecePlacement, QuarterTurn, SceneDefinition, SignalTiming } from '../simulation/network/scene';
import { DEFAULT_SIGNAL_TIMING } from '../simulation/traffic/signals';
import type { PartId } from './parts';
import { placePart, type PlacementResult } from './placement';

/** The scene without one piece; its controls go too, and the others follow their pieces' new positions in the list. */
export function removePiece(scene: SceneDefinition, index: number): SceneDefinition {
  return {
    ...scene,
    pieces: scene.pieces.filter((_, i) => i !== index),
    controls: scene.controls.filter((c) => c.piece !== index).map((c) => (c.piece > index ? { ...c, piece: c.piece - 1 } : c)),
  };
}

/** Put a piece's controls back on it at its new index, wherever its ports still exist. */
function reattach(result: PlacementResult, controls: ControlPlacement[]): PlacementResult {
  if (!result.valid || !result.scene) return result;
  const index = result.scene.pieces.length - 1;
  const ports = new Set(PIECES[result.scene.pieces[index].piece].ports.map((p) => p.id));
  const kept = controls.filter((c) => ports.has(c.port)).map((c) => ({ ...c, piece: index }));
  return { ...result, scene: { ...result.scene, controls: [...result.scene.controls, ...kept] } };
}

/** Take a piece off and place it again (same part and rotation unless given), keeping its controls. */
function replaceWith(scene: SceneDefinition, index: number, request: { part?: PartId; pointer?: [number, number]; rotation?: QuarterTurn; snap?: boolean }): PlacementResult {
  const old: PiecePlacement = scene.pieces[index];
  const controls = scene.controls.filter((c) => c.piece === index);
  const without = removePiece(scene, index);
  const result = placePart(without, {
    part: request.part ?? (old.piece as PartId),
    pointer: request.pointer ?? old.at,
    rotation: request.rotation ?? old.rotation,
    level: old.level ?? 0,
    snap: request.snap,
    // Moving, turning or swapping a piece never grows junctions on its neighbours (only new pieces join).
    join: false,
  });
  return reattach(result, controls);
}

/** Move a piece (dragging it to `pointer`), snapping as a new piece would. */
export function movePiece(scene: SceneDefinition, index: number, request: { pointer: [number, number]; rotation?: QuarterTurn }): PlacementResult {
  return replaceWith(scene, index, request);
}

/** Turn a piece a quarter turn anticlockwise where it stands. */
export function rotatePiece(scene: SceneDefinition, index: number): PlacementResult {
  const old = scene.pieces[index];
  return replaceWith(scene, index, { rotation: (((old.rotation + 90) % 360) as QuarterTurn), snap: false });
}

/** Swap a piece for another part in the same spot (e.g. a T-junction for a crossroads). */
export function replacePiece(scene: SceneDefinition, index: number, part: PartId): PlacementResult {
  return replaceWith(scene, index, { part, snap: false });
}

export function removeControl(scene: SceneDefinition, index: number): SceneDefinition {
  return { ...scene, controls: scene.controls.filter((_, i) => i !== index) };
}

/** Swap a control for another kind on the same approach (a signal gets the default timing). */
export function replaceControl(scene: SceneDefinition, index: number, type: ControlPlacement['type']): SceneDefinition {
  return {
    ...scene,
    controls: scene.controls.map((c, i) => (i !== index ? c : type === 'signal' ? { type, piece: c.piece, port: c.port, timing: c.timing ?? { ...DEFAULT_SIGNAL_TIMING } } : { type, piece: c.piece, port: c.port })),
  };
}

/** Move a control to the approach nearest `pointer`, as dropping it there would; a signal keeps its timing. */
export function moveControl(scene: SceneDefinition, index: number, request: { pointer: [number, number] }): PlacementResult {
  const control = scene.controls[index];
  const result = placePart(removeControl(scene, index), { part: control.type, pointer: request.pointer, rotation: 0 });
  if (!result.valid || !result.scene || control.type !== 'signal' || !control.timing) return result;
  const placed = { ...result.control!, timing: { ...control.timing } };
  return { ...result, control: placed, scene: { ...result.scene, controls: [...result.scene.controls.slice(0, -1), placed] } };
}

export function setSignalTiming(scene: SceneDefinition, index: number, timing: SignalTiming): SceneDefinition {
  return { ...scene, controls: scene.controls.map((c, i) => (i === index ? { ...c, timing: { ...timing } } : c)) };
}

/**
 * Entry and exit points are lettered by where they sit round the board (A from the
 * north-west), so an edit that adds or removes one moves the letters. Keep each demand
 * weight on the same road end (and driveway) as before; drop those for ends that are gone.
 */
export function demandFollowsEntries(before: SceneDefinition, after: SceneDefinition): SceneDefinition {
  const ends = (scene: SceneDefinition) => {
    const graph = buildLaneGraph(scene.pieces);
    return [...graph.gateways, ...graph.accessPoints].map((g) => ({ label: g.label, key: `${g.at[0]},${g.at[1]}` }));
  };
  const newLabel = new Map(ends(after).map((e) => [e.key, e.label]));
  const rename = new Map(ends(before).flatMap((e) => (newLabel.has(e.key) ? [[e.label, newLabel.get(e.key)!] as const] : [])));
  const relabel = (weights: Record<string, number> | undefined) =>
    weights && Object.fromEntries(Object.entries(weights).flatMap(([label, w]) => (rename.has(label) ? [[rename.get(label)!, w]] : [])));
  const demand = after.demand;
  return {
    ...after,
    demand: {
      ...demand,
      gateways: relabel(demand.gateways)!,
      ...(demand.destinations && { destinations: relabel(demand.destinations) }),
      ...(demand.peaks && { peaks: demand.peaks.map((p) => ({ ...p, entries: relabel(p.entries)!, destinations: relabel(p.destinations)! })) }),
    },
  };
}

/** Undo and redo for a scene being edited: each entry is a whole scene, as the store keeps them. */
export class EditHistory {
  private readonly past: SceneDefinition[] = [];
  private readonly future: SceneDefinition[] = [];

  constructor(private present: SceneDefinition) {}

  /** Record a new state; anything that could be redone is gone. */
  push(scene: SceneDefinition) {
    this.past.push(this.present);
    this.present = scene;
    this.future.length = 0;
  }

  /** Step back; null when there's nothing to undo. */
  undo(): SceneDefinition | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(this.present);
    this.present = previous;
    return previous;
  }

  /** Step forward again; null when there's nothing to redo. */
  redo(): SceneDefinition | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.present);
    this.present = next;
    return next;
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }
}
