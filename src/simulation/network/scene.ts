import { PIECES } from './pieces';

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
}

/** A traffic control on one approach to a piece: the port traffic arrives through. */
export interface ControlPlacement {
  type: 'signal' | 'stop' | 'yield';
  /** Index into the scene's `pieces`. */
  piece: number;
  /** The piece's port id for the approach. */
  port: string;
}

/** How trips are spread over the scene; behaviour arrives with the traffic engine (T3, T6). */
export interface DemandPattern {
  /** Relative share of trips entering at each gateway, keyed by gateway label. */
  gateways: Record<string, number>;
}

export interface SceneDefinition {
  id: string;
  name: string;
  pieces: PiecePlacement[];
  controls: ControlPlacement[];
  demand: DemandPattern;
}

const BOARD = 16;
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
    const r = (placement.rotation * Math.PI) / 180;
    const [c, s] = [Math.round(Math.cos(r)), Math.round(Math.sin(r))];
    const points = [[0, 0], ...def.ports.map((p) => p.at)].map(([x, z]) => [placement.at[0] + x * c + z * s, placement.at[1] - x * s + z * c]);
    if (points.some(([x, z]) => x < 0 || x > BOARD || z < 0 || z > BOARD)) {
      errors.push(`Piece ${i}: ${placement.piece} at (${placement.at.join(', ')}) is off the ${BOARD} × ${BOARD} board`);
    }
  });
  scene.controls.forEach((control, i) => {
    const placement = scene.pieces[control.piece];
    if (!placement) return errors.push(`Control ${i}: there is no piece ${control.piece}`);
    const def = PIECES[placement.piece];
    if (def && !def.ports.some((p) => p.id === control.port)) errors.push(`Control ${i}: ${placement.piece} has no approach "${control.port}"`);
  });
  return errors;
}
