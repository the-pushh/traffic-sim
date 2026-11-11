import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from './buildLaneGraph';
import type { PiecePlacement } from './scene';

/** Board coordinates are in tiles: x east, z south, (0, 0) is the north-west corner. */
const straight = (x: number, z: number, rotation: 0 | 90 | 180 | 270 = 0): PiecePlacement => ({ piece: 'straight', at: [x, z], rotation });

function heading(points: number[][]) {
  const a = points[0];
  const b = points[points.length - 1];
  return [Math.sign(Math.round((b[0] - a[0]) * 1000)), Math.sign(Math.round((b[2] - a[2]) * 1000))];
}

describe('lane graph: a straight road', () => {
  it('has one lane each way, each keeping to the right of its travel direction', () => {
    const graph = buildLaneGraph([straight(8.5, 8.5)]);

    expect(graph.lanes).toHaveLength(2);
    const eastbound = graph.lanes.find((l) => heading(l.points)[0] === 1)!;
    const westbound = graph.lanes.find((l) => heading(l.points)[0] === -1)!;
    // Heading east, the right-hand side is south (+z); lanes sit 0.2 tile either side of the centre line.
    expect(eastbound.points[0][2]).toBeCloseTo(8.5 + 0.2, 6);
    expect(westbound.points[0][2]).toBeCloseTo(8.5 - 0.2, 6);
    expect(eastbound.length).toBeCloseTo(1, 6);
  });
});

describe('lane graph: joining pieces', () => {
  it('continues each lane into the next piece where two straights meet end to end', () => {
    const graph = buildLaneGraph([straight(7.5, 8.5), straight(8.5, 8.5)]);
    const east = graph.lanes.filter((l) => heading(l.points)[0] === 1).sort((a, b) => a.points[0][0] - b.points[0][0]);
    const west = graph.lanes.filter((l) => heading(l.points)[0] === -1).sort((a, b) => b.points[0][0] - a.points[0][0]);

    expect(east[0].next).toEqual([east[1].id]);
    expect(east[1].previous).toEqual([east[0].id]);
    expect(west[0].next).toEqual([west[1].id]);
    expect(east[1].next).toEqual([]);
  });

  it('does not connect pieces that only touch side-on or leave a gap', () => {
    const sideOn = buildLaneGraph([straight(8.5, 8.5), straight(9.5, 8.5, 90)]);
    const gap = buildLaneGraph([straight(7.5, 8.5), straight(9.5, 8.5)]);

    for (const graph of [sideOn, gap]) for (const lane of graph.lanes) expect(lane.next).toEqual([]);
  });

  it('runs north–south when rotated a quarter turn, and connects to a matching rotated piece', () => {
    const graph = buildLaneGraph([straight(8.5, 7.5, 90), straight(8.5, 8.5, 90)]);
    const southbound = graph.lanes.filter((l) => heading(l.points)[1] === 1);
    expect(southbound).toHaveLength(2);
    // Heading south, the right-hand side is west (−x).
    expect(southbound[0].points[0][0]).toBeCloseTo(8.5 - 0.2, 6);
    expect(southbound.some((l) => l.next.length === 1)).toBe(true);
  });
});

describe('lane graph: entry and exit points', () => {
  it('turns road ends at the board edge into labelled entry/exit points', () => {
    // A road across the whole board, west edge to east edge.
    const graph = buildLaneGraph(Array.from({ length: 16 }, (_, i) => straight(i + 0.5, 8.5)));

    expect(graph.gateways.map((g) => g.label).sort()).toEqual(['A', 'B']);
    const west = graph.gateways.find((g) => g.at[0] === 0)!;
    const east = graph.gateways.find((g) => g.at[0] === 16)!;
    expect(west.entryLanes).toHaveLength(1);
    expect(west.exitLanes).toHaveLength(1);
    expect(graph.lanes[west.entryLanes[0]].previous).toEqual([]);
    expect(graph.lanes[east.exitLanes[0]].next).toEqual([]);
    expect(graph.openEnds).toEqual([]);
  });

  it('labels gateways clockwise from the north-west corner', () => {
    const graph = buildLaneGraph([straight(0.5, 8.5), straight(15.5, 3.5), straight(4.5, 0.5, 90), straight(10.5, 15.5, 90)]);
    const byLabel = Object.fromEntries(graph.gateways.map((g) => [g.label, g.at]));
    expect(byLabel).toEqual({ A: [4.5, 0], B: [16, 3.5], C: [10.5, 16], D: [0, 8.5] });
  });

  it('marks a loose road end inside the board as an open connection point, not a gateway', () => {
    const graph = buildLaneGraph([straight(0.5, 8.5), straight(1.5, 8.5)]);

    expect(graph.gateways).toHaveLength(1);
    expect(graph.openEnds).toEqual([{ at: [2, 8.5], level: 0, facing: [1, 0] }]);
  });
});

const place = (piece: string, x: number, z: number, rotation: 0 | 90 | 180 | 270 = 0): PiecePlacement => ({ piece, at: [x, z], rotation });

function endHeading(points: number[][]) {
  const [a, b] = [points[points.length - 2], points[points.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return [Math.round((b[0] - a[0]) / len), Math.round((b[2] - a[2]) / len)];
}

describe('lane graph: junctions and curves', () => {
  it('gives a crossroads every movement except U-turns, with circular turns', () => {
    const graph = buildLaneGraph([place('crossroad', 8.5, 8.5)]);
    expect(graph.lanes).toHaveLength(12);

    const fromWest = graph.lanes.filter((l) => Math.abs(l.points[0][0] - 8) < 1e-6);
    const byExit = Object.fromEntries(fromWest.map((l) => [endHeading(l.points).join(','), l.length]));
    expect(byExit['1,0']).toBeCloseTo(1, 3); // straight on
    expect(byExit['0,1']).toBeCloseTo((Math.PI / 2) * 0.3, 2); // right turn (south), tight
    expect(byExit['0,-1']).toBeCloseTo((Math.PI / 2) * 0.7, 2); // left turn (north), wide
  });

  it('gives a T-junction the six movements between its three arms', () => {
    const graph = buildLaneGraph([place('t-junction', 8.5, 8.5)]);
    expect(graph.lanes).toHaveLength(6);
    // Arms are west, east and south: no lane reaches the closed north side (z = 8).
    expect(graph.lanes.every((l) => l.points.every((p) => p[2] > 8.05))).toBe(true);
  });

  it('turns a road heading east to heading south through a bend, and through the wider 2 × 2 curve', () => {
    for (const [piece, x, z, westPortX] of [
      ['bend', 8.5, 8.5, 8],
      ['curve', 9, 9, 8],
    ] as const) {
      const graph = buildLaneGraph([straight(westPortX - 0.5, 8.5), place(piece, x, z)]);
      const eastbound = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === 1)!;
      expect(eastbound.next).toHaveLength(1);
      expect(endHeading(graph.lanes[eastbound.next[0]].points)).toEqual([0, 1]);
    }
  });
});

describe('lane graph: levels', () => {
  const flyover: PiecePlacement[] = [
    straight(5.5, 8.5),
    place('ramp', 6.5, 8.5), // ground → 0.25
    { piece: 'ramp', at: [7.5, 8.5], rotation: 0, level: 0.25 }, // 0.25 → 0.5
    place('bridge', 8.5, 8.5, 90), // deck at 0.5, running east–west
    { piece: 'ramp', at: [9.5, 8.5], rotation: 180, level: 0.25 }, // 0.5 → 0.25
    place('ramp', 10.5, 8.5, 180), // 0.25 → ground
    straight(11.5, 8.5),
    // A ground road running north–south under the bridge.
    straight(8.5, 7.5, 90),
    straight(8.5, 8.5, 90),
    straight(8.5, 9.5, 90),
  ];

  function reachable(graph: ReturnType<typeof buildLaneGraph>, from: number) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) for (const n of graph.lanes[queue.shift()!].next) if (!seen.has(n)) (seen.add(n), queue.push(n));
    return seen;
  }

  it('climbs the ramps onto the bridge and back down to the road beyond', () => {
    const graph = buildLaneGraph(flyover);
    const startEast = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === 1)!;
    const endEast = graph.lanes.find((l) => l.piece === 6 && heading(l.points)[0] === 1)!;

    expect(reachable(graph, startEast.id).has(endEast.id)).toBe(true);
    const onBridge = graph.lanes.filter((l) => l.piece === 3);
    expect(onBridge.every((l) => l.points.every((p) => Math.abs(p[1] - 0.5) < 1e-9))).toBe(true);
  });

  it('keeps the road under the bridge separate from the bridge', () => {
    const graph = buildLaneGraph(flyover);
    const bridgeLanes = new Set(graph.lanes.filter((l) => l.piece === 3).map((l) => l.id));
    const underLanes = graph.lanes.filter((l) => l.piece >= 7);

    for (const lane of underLanes) {
      expect(lane.next.some((n) => bridgeLanes.has(n))).toBe(false);
      expect(lane.previous.some((n) => bridgeLanes.has(n))).toBe(false);
      expect(lane.points.every((p) => p[1] === 0)).toBe(true);
    }
    const southbound = underLanes.filter((l) => heading(l.points)[1] === 1).sort((a, b) => a.points[0][2] - b.points[0][2]);
    expect(southbound[0].next).toEqual([southbound[1].id]);
  });
});

describe('lane graph: roundabout', () => {
  const graph = buildLaneGraph([place('roundabout', 8.5, 8.5)]);
  const centre = [8.5, 8.5];

  function reachableWithin(from: number) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) for (const n of graph.lanes[queue.shift()!].next) if (!seen.has(n)) (seen.add(n), queue.push(n));
    return seen;
  }

  it('circulates anticlockwise seen from above', () => {
    // At the ring's northernmost point, traffic heads west.
    const north = graph.lanes
      .flatMap((l) => l.points.slice(1).map((p, i) => ({ p, prev: l.points[i] })))
      .filter(({ p }) => Math.abs(p[0] - centre[0]) < 0.06 && p[2] < centre[1] - 0.6)[0];
    expect(north.p[0] - north.prev[0]).toBeLessThan(0);
  });

  it('lets traffic from every arm reach every other arm', () => {
    const entries = graph.lanes.filter((l) => l.previous.length === 0);
    const exits = graph.lanes.filter((l) => l.next.length === 0);
    expect(entries).toHaveLength(4);
    expect(exits).toHaveLength(4);
    for (const entry of entries) {
      const reached = reachableWithin(entry.id);
      for (const exit of exits) expect(reached.has(exit.id)).toBe(true);
    }
  });

  it('connects its arms to the roads around it', () => {
    const withArms = buildLaneGraph([place('roundabout', 8.5, 8.5), straight(6.5, 8.5), straight(10.5, 8.5)]);
    const westRoadEastbound = withArms.lanes.find((l) => l.piece === 1 && heading(l.points)[0] === 1)!;
    expect(withArms.lanes[westRoadEastbound.next[0]].piece).toBe(0);
  });
});

function reach(graph: ReturnType<typeof buildLaneGraph>, from: number) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) for (const n of graph.lanes[queue.shift()!].next) if (!seen.has(n)) (seen.add(n), queue.push(n));
  return seen;
}

describe('lane graph: lane counts and special pieces', () => {
  it('carries two lanes in the same direction on a one-way road, lane by lane', () => {
    const oneWay = (x: number): PiecePlacement => ({ piece: 'straight', at: [x, 8.5], rotation: 0, flow: { w: 'in', e: 'out' } });
    const graph = buildLaneGraph([oneWay(7.5), oneWay(8.5)]);

    expect(graph.lanes).toHaveLength(4);
    expect(graph.lanes.every((l) => heading(l.points)[0] === 1)).toBe(true);
    for (const lane of graph.lanes.filter((l) => l.piece === 0)) {
      expect(lane.next).toHaveLength(1);
      expect(graph.lanes[lane.next[0]].points[0][2]).toBeCloseTo(lane.points[0][2], 9); // stays in its lane
    }
  });

  it('merges a two-lane carriageway into one lane at the road split, and splits the other way', () => {
    const graph = buildLaneGraph([place('split', 8.5, 8)]);
    const eastbound = graph.lanes.filter((l) => heading(l.points)[0] === 1);
    const westbound = graph.lanes.filter((l) => heading(l.points)[0] === -1);

    expect(eastbound).toHaveLength(2); // two lanes in from the south carriageway…
    expect(new Set(eastbound.map((l) => l.points.at(-1)!.join(','))).size).toBe(1); // …into one lane
    expect(westbound).toHaveLength(2);
    expect(new Set(westbound.map((l) => l.points[0].join(','))).size).toBe(1);
    expect(eastbound.every((l) => l.points[0][2] > 8)).toBe(true); // right-hand: eastbound carriageway on the south side
  });

  it('lets westbound traffic pull into a lay-by bay and rejoin, while eastbound traffic passes', () => {
    const graph = buildLaneGraph([place('layby-end', 7.5, 8.5), place('layby', 8.5, 8.5), place('layby-start', 9.5, 8.5)]);
    const bayLanes = graph.lanes.filter((l) => l.piece === 1 && Math.abs(l.points[0][2] - (8.5 - 0.555)) < 1e-6);
    expect(bayLanes).toHaveLength(1);
    expect(heading(bayLanes[0].points)[0]).toBe(-1);

    // Westbound traffic arriving at the bay's start can choose the bay or stay on the through lane.
    const westIntoStart = graph.lanes.filter((l) => l.piece === 2 && l.previous.length === 0 && heading(l.points)[0] === -1);
    expect(westIntoStart).toHaveLength(2);
    expect(westIntoStart.some((l) => reach(graph, l.id).has(bayLanes[0].id))).toBe(true);
    const eastThrough = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === 1)!;
    expect(reach(graph, eastThrough.id).has(bayLanes[0].id)).toBe(false);
  });

  it('lets traffic turn around at a road end', () => {
    // Road ends open on their east side, so this one is turned to face the road coming from the west.
    const graph = buildLaneGraph([straight(7.5, 8.5), place('turnaround', 8.5, 8.5, 180)]);
    const eastbound = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === 1)!;
    const westbound = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === -1)!;
    expect(reach(graph, eastbound.id).has(westbound.id)).toBe(true);
    expect(graph.openEnds).toHaveLength(1); // only the straight's west end
  });

  it('makes a driveway a local access point that trips can start from and end at', () => {
    const graph = buildLaneGraph([place('driveway', 8.5, 8.5)]);
    expect(graph.accessPoints).toHaveLength(1);
    const access = graph.accessPoints[0];
    expect(access.at).toEqual([8.5, 9]);
    expect(access.entryLanes.length).toBeGreaterThan(0);
    expect(access.exitLanes.length).toBeGreaterThan(0);
    // Arriving at the driveway doesn't lead straight back out of it.
    for (const id of access.exitLanes) expect(graph.lanes[id].next.some((n) => access.entryLanes.includes(n))).toBe(false);
  });

  it('connects a curved T-junction straight through and round its curved branch', () => {
    const graph = buildLaneGraph([place('curve-t-junction', 9, 9)]);
    expect(graph.lanes).toHaveLength(6);
  });

  it('treats a pedestrian crossing as a straight road', () => {
    const graph = buildLaneGraph([straight(7.5, 8.5), place('crossing', 8.5, 8.5), straight(9.5, 8.5)]);
    const east = graph.lanes.find((l) => l.piece === 0 && heading(l.points)[0] === 1)!;
    expect(graph.lanes[east.next[0]].piece).toBe(1);
  });
});

describe('lane graph: incompatible joints', () => {
  const oneWayOut: PiecePlacement = { piece: 'straight', at: [7.5, 8.5], rotation: 0, flow: { w: 'in', e: 'out' } };

  it('reports a one-way road meeting a two-way road instead of silently dropping a lane', () => {
    const graph = buildLaneGraph([oneWayOut, straight(8.5, 8.5)]);

    expect(graph.mismatches).toEqual([{ at: [8, 8.5], level: 0, reason: 'Lane directions don’t match: one-way meets two-way' }]);
    for (const lane of graph.lanes) {
      expect(lane.next.filter((n) => graph.lanes[n].piece !== lane.piece)).toEqual([]);
    }
    // The joint is a mismatch, not a free road end (only the far ends are open).
    expect(graph.openEnds.map((e) => e.at)).toEqual([
      [7, 8.5],
      [9, 8.5],
    ]);
  });

  it('reports two one-way roads pointing at each other', () => {
    const facing: PiecePlacement = { piece: 'straight', at: [8.5, 8.5], rotation: 0, flow: { w: 'out', e: 'in' } };
    const graph = buildLaneGraph([oneWayOut, facing]);
    expect(graph.mismatches).toHaveLength(1);
  });

  it('reports a lay-by road end meeting a normal road end and keeps their lanes apart', () => {
    const graph = buildLaneGraph([straight(7.5, 8.5), place('layby', 8.5, 8.5)]);

    expect(graph.mismatches).toEqual([{ at: [8, 8.5], level: 0, reason: 'Lay-by road meets a road without a lay-by' }]);
    const crossing = graph.lanes.filter((l) => l.next.some((n) => graph.lanes[n].piece !== l.piece));
    expect(crossing).toEqual([]);
    expect(graph.openEnds.map((e) => e.at)).toEqual([
      [7, 8.5],
      [9, 8.5],
    ]);
  });

  it('still joins matching one-way roads and divided carriageways', () => {
    const next: PiecePlacement = { piece: 'straight', at: [8.5, 8.5], rotation: 0, flow: { w: 'in', e: 'out' } };
    const graph = buildLaneGraph([oneWayOut, next]);
    expect(graph.mismatches).toEqual([]);
    expect(graph.lanes.filter((l) => l.piece === 0).every((l) => l.next.length === 1)).toBe(true);
  });
});
