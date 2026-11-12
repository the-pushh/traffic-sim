import type { LaneGraph } from '../network/buildLaneGraph';

/**
 * Cheapest paths over the lane graph. Each lane costs its free-flow time plus an
 * optional extra (e.g. the queue a driver can see on it); closed lanes are never used.
 */
export class Router {
  private closedLanes: ReadonlySet<number> = new Set();

  constructor(
    private readonly graph: LaneGraph,
    /** Seconds to drive each lane at the speed it allows, with no traffic. */
    readonly freeFlowTime: readonly number[],
  ) {}

  /** Lanes no new path may use (e.g. a connection removed by an edit). */
  get closed(): ReadonlySet<number> {
    return this.closedLanes;
  }

  /** Replace the set of closed lanes. */
  close(lanes: Iterable<number>) {
    this.closedLanes = new Set(lanes);
  }

  /**
   * The cheapest path that starts on one of `starts` and ends on one of `targets`, as
   * lane ids from start to target, with its cost in seconds; null when there's none.
   * `closed` defaults to the lanes currently closed.
   */
  path(starts: Iterable<number>, targets: ReadonlySet<number>, extra?: (lane: number) => number, closed: ReadonlySet<number> = this.closed): { lanes: number[]; cost: number } | null {
    const cost = (lane: number) => this.freeFlowTime[lane] + (extra?.(lane) ?? 0);
    const best = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const heap = new MinHeap();
    for (const lane of starts) {
      if (closed.has(lane)) continue;
      const c = cost(lane);
      if (c < (best.get(lane) ?? Infinity)) {
        best.set(lane, c);
        cameFrom.set(lane, -1);
        heap.push(lane, c);
      }
    }
    while (heap.size) {
      const { lane, cost: reached } = heap.pop();
      if (reached > best.get(lane)!) continue; // stale entry
      if (targets.has(lane)) {
        const lanes = [lane];
        while (cameFrom.get(lanes[lanes.length - 1])! >= 0) lanes.push(cameFrom.get(lanes[lanes.length - 1])!);
        return { lanes: lanes.reverse(), cost: reached };
      }
      for (const next of this.graph.lanes[lane].next) {
        if (closed.has(next)) continue;
        const c = reached + cost(next);
        if (c < (best.get(next) ?? Infinity)) {
          best.set(next, c);
          cameFrom.set(next, lane);
          heap.push(next, c);
        }
      }
    }
    return null;
  }

  /** Cost of driving these lanes, seconds. */
  costOf(lanes: Iterable<number>, extra?: (lane: number) => number) {
    let total = 0;
    for (const lane of lanes) total += this.freeFlowTime[lane] + (extra?.(lane) ?? 0);
    return total;
  }
}

/** Binary min-heap of lanes keyed by cost. */
class MinHeap {
  private readonly items: { lane: number; cost: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(lane: number, cost: number) {
    const items = this.items;
    items.push({ lane, cost });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let smallest = i;
        if (l < items.length && items[l].cost < items[smallest].cost) smallest = l;
        if (r < items.length && items[r].cost < items[smallest].cost) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
