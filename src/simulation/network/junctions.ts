import type { LaneGraph } from './buildLaneGraph';
import type { Conflict } from './conflicts';

/** Group junction pieces (pieces with conflicting lanes) that join directly into one junction; -1 per lane elsewhere. */
export function junctionClusters(graph: LaneGraph, conflicts: Map<number, Conflict[]>): number[] {
  const junctionPiece = new Set(graph.lanes.filter((l) => conflicts.get(l.id)!.length > 0).map((l) => l.piece));
  const parent = new Map([...junctionPiece].map((p) => [p, p]));
  const root = (p: number): number => (parent.get(p) === p ? p : root(parent.get(p)!));
  for (const lane of graph.lanes) {
    if (!junctionPiece.has(lane.piece)) continue;
    for (const next of lane.next) {
      const other = graph.lanes[next].piece;
      if (junctionPiece.has(other)) parent.set(root(other), root(lane.piece));
    }
  }
  return graph.lanes.map((l) => (junctionPiece.has(l.piece) ? root(l.piece) : -1));
}
