import type { LaneGraph } from './buildLaneGraph';
import { rotate } from './geometry';
import { PIECES } from './pieces';

/** The board is this many road tiles on each side. */
export const BOARD_TILES = 16;

/**
 * Shared scene format for presets and saved scenes. Board coordinates are in road
 * tiles: x runs east, z runs south, (0, 0) is the board's north-west corner, and the
 * board is 16 × 16 tiles. Positions may use half tiles (the road split needs them).
 */
export type QuarterTurn = 0 | 90 | 180 | 270;

/** One-way flow through a port: traffic only leaves (`out`) or only arrives (`in`). */
export type PortFlow = 'two-way' | 'in' | 'out';

export interface PiecePlacement {
  piece: string;
  /** Position of the piece's origin on the board, in tiles. */
  at: [number, number];
  /** Rotation about the vertical axis, anticlockwise seen from above. */
  rotation: QuarterTurn;
  /** Height of the piece's base in tiles (0 ground, 0.25 on an elevation tile). */
  level?: number;
  /** Per-port one-way flow, keyed by the piece's port id. Defaults to two-way. */
  flow?: Record<string, PortFlow>;
  /** Speed limit on this piece, km/h. Defaults to the urban 50 km/h. */
  speedLimit?: number;
}

/** The default urban speed limit, km/h. */
export const DEFAULT_SPEED_LIMIT_KMH = 50;
/** Speed limits a scene may set, km/h. */
const SPEED_LIMIT_RANGE: [number, number] = [10, 120];

/** Each lane's speed limit in m/s, from the piece it belongs to. */
export function laneSpeedLimits(pieces: PiecePlacement[], graph: LaneGraph): number[] {
  return graph.lanes.map((lane) => (pieces[lane.piece]?.speedLimit ?? DEFAULT_SPEED_LIMIT_KMH) / 3.6);
}

/** Fixed-time signal cycle in seconds: green, then amber, then red, shifted by `offset`. */
export interface SignalTiming {
  green: number;
  amber: number;
  red: number;
  offset: number;
}

/** A traffic control on one approach to a piece: the port traffic arrives through. */
export interface ControlPlacement {
  type: 'signal' | 'stop' | 'yield';
  /** Index into the scene's `pieces`. */
  piece: number;
  /** The piece's port id for the approach. */
  port: string;
  /** Signals only; defaults apply when omitted. */
  timing?: SignalTiming;
}

/** How trips are spread over the scene; behaviour arrives with the traffic engine (T3, T6). */
export interface DemandPattern {
  /** Relative share of trips entering at each gateway, keyed by gateway label. */
  gateways: Record<string, number>;
  /** Relative share of trips leaving by each gateway; defaults to every reachable exit equally. */
  destinations?: Record<string, number>;
  /**
   * Extra trips during part of each run, e.g. a school's drop-off: `from`–`to` are seconds
   * into the run, and `rate` scales the intensity's trips per minute at each entry.
   * Labels may be gateways (A, B, …) or driveways (P1, P2, …).
   */
  peaks?: { from: number; to: number; rate: number; entries: Record<string, number>; destinations: Record<string, number> }[];
}

export interface SceneDefinition {
  id: string;
  name: string;
  pieces: PiecePlacement[];
  controls: ControlPlacement[];
  demand: DemandPattern;
}

const QUARTER_TURNS = [0, 90, 180, 270];

/** Problems that would stop a scene from loading, in plain language; empty when valid. */
export function validateScene(scene: SceneDefinition): string[] {
  const errors: string[] = [];
  scene.pieces.forEach((placement, i) => {
    const def = PIECES[placement.piece];
    if (!def) {
      errors.push(`Piece ${i}: unknown piece "${placement.piece}"`);
      return;
    }
    if (!QUARTER_TURNS.includes(placement.rotation)) {
      errors.push(`Piece ${i}: rotation must be 0, 90, 180 or 270`);
      return;
    }
    const { min, max } = def.footprint;
    const corners = [min, [max[0], min[1]], max, [min[0], max[1]]] as [number, number][];
    const onBoard = corners.every((corner) => {
      const [x, z] = rotate(corner, placement.rotation);
      const [bx, bz] = [placement.at[0] + x, placement.at[1] + z];
      return bx >= -1e-9 && bz >= -1e-9 && bx <= BOARD_TILES + 1e-9 && bz <= BOARD_TILES + 1e-9;
    });
    if (!onBoard) errors.push(`Piece ${i}: ${placement.piece} at (${placement.at.join(', ')}) is off the ${BOARD_TILES} × ${BOARD_TILES} board`);
    if (placement.speedLimit !== undefined && !(placement.speedLimit >= SPEED_LIMIT_RANGE[0] && placement.speedLimit <= SPEED_LIMIT_RANGE[1]))
      errors.push(`Piece ${i}: speed limit must be ${SPEED_LIMIT_RANGE[0]}–${SPEED_LIMIT_RANGE[1]} km/h`);
    for (const id of Object.keys(placement.flow ?? {})) {
      if (!def.ports.some((p) => p.id === id)) errors.push(`Piece ${i}: ${placement.piece} has no road end "${id}" for a one-way setting`);
    }
  });
  scene.controls.forEach((control, i) => {
    const placement = scene.pieces[control.piece];
    if (!placement) return errors.push(`Control ${i}: there is no piece ${control.piece}`);
    const def = PIECES[placement.piece];
    if (!def) return;
    const port = def.ports.find((p) => p.id === control.port);
    if (!port) return errors.push(`Control ${i}: ${placement.piece} has no approach "${control.port}"`);
    const flow = placement.flow?.[port.id] ?? port.flow ?? 'two-way';
    if (flow === 'out' || port.profile === 'access') errors.push(`Control ${i}: no traffic arrives through approach "${control.port}" of ${placement.piece}`);
  });
  return errors;
}
