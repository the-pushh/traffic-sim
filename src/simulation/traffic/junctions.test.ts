import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../network/buildLaneGraph';
import type { ControlPlacement, PiecePlacement } from '../network/scene';
import { resolveControls } from './signals';
import { TrafficSimulation } from './trafficSimulation';

const STEP = 1 / 30;
const T = 8; // index of the T-junction piece

/**
 * A major road west–east across the board with a T-junction in the middle and a minor
 * road from the south edge. Gateways (clockwise from the north-west): A east, B south, C west.
 */
const tJunction: PiecePlacement[] = [
  ...Array.from({ length: 16 }, (_, i): PiecePlacement => ({ piece: i === T ? 't-junction' : 'straight', at: [i + 0.5, 8.5], rotation: 0 })),
  ...Array.from({ length: 7 }, (_, i): PiecePlacement => ({ piece: 'straight', at: [8.5, 9.5 + i], rotation: 90 })),
];
const graph = buildLaneGraph(tJunction);
const [, SOUTH, WEST] = ['A', 'B', 'C'];

function sim(controls: ControlPlacement[], seed = 1) {
  return new TrafficSimulation(graph, { seed, controls: resolveControls(tJunction, graph, controls) });
}
function run(s: TrafficSimulation, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s.step(STEP);
    each?.();
  }
}

describe('junctions: stop sign', () => {
  it('makes the minor-road driver stop fully at the line even when the road is clear, then go', () => {
    const s = sim([{ type: 'stop', piece: T, port: 's' }]);
    const car = s.addVehicle({ type: 'sedan', profile: 'steady', from: SOUTH, to: WEST, position: 10, speed: 10 });
    let slowestNearLine = Infinity;
    let sawStopSign = false;
    run(s, 25, () => {
      if (!s.has(car)) return;
      const d = s.stopLineDistance(car);
      if (d < 3) slowestNearLine = Math.min(slowestNearLine, s.vehicle(car).speed);
      if (s.vehicle(car).reason === 'Stop sign') sawStopSign = true;
    });
    expect(gatewayOf(graph, WEST)).toBeDefined();
    expect(slowestNearLine).toBeLessThan(0.1);
    expect(sawStopSign).toBe(true);
    expect(s.has(car)).toBe(false); // it went on and left the board
  });
});

function gatewayOf(g: typeof graph, label: string) {
  return g.gateways.find((x) => x.label === label);
}

const inJunction = (s: TrafficSimulation, id: number, g = graph) => {
  const v = s.vehicle(id);
  return g.lanes[v.route[v.routeIndex]].piece === T;
};
// The minor road is 7 tiles (61.25 m) from the south edge to the junction's stop line.
const MINOR_AT_LINE = 60.5;
const EAST_LABEL = 'A';

describe('junctions: giving way', () => {
  it('waits for a gap in main-road traffic, which does not slow down for it', () => {
    const s = sim([{ type: 'yield', piece: T, port: 's' }]);
    const major = s.addVehicle({ type: 'sedan', profile: 'steady', from: WEST, to: EAST_LABEL, position: 30, speed: 12 });
    s.vehicle(major).driver.courtesy = 0; // this test is about priority, not courtesy
    const minor = s.addVehicle({ type: 'sedan', profile: 'steady', from: SOUTH, to: EAST_LABEL, position: MINOR_AT_LINE, speed: 0 });
    let majorSlowest = Infinity;
    let minorEnteredWhileMajorApproaching = false;
    let waited = false;
    run(s, 12, () => {
      if (s.has(major)) {
        majorSlowest = Math.min(majorSlowest, s.vehicle(major).speed);
        if (s.has(minor) && inJunction(s, minor) && s.routeProgress(major) < 78.75) minorEnteredWhileMajorApproaching = true;
      }
      if (s.has(minor) && s.vehicle(minor).reason === 'Waiting for a gap') waited = true;
    });
    expect(waited).toBe(true);
    expect(minorEnteredWhileMajorApproaching).toBe(false);
    expect(majorSlowest).toBeGreaterThan(11);
  });

  it('lets an assertive driver take an opening that a cautious driver passes up', () => {
    const decide = (acceptedGap: number) => {
      const s = sim([{ type: 'yield', piece: T, port: 's' }]);
      // A tractor at a steady 8 m/s, about 6.5 s from the merge point.
      s.addVehicle({ type: 'tractor', profile: 'steady', from: WEST, to: EAST_LABEL, position: 26.75, speed: 8 });
      const minor = s.addVehicle({ type: 'sedan', profile: 'assertive', from: SOUTH, to: EAST_LABEL, position: MINOR_AT_LINE, speed: 0 });
      s.vehicle(minor).driver.acceptedGap = acceptedGap;
      s.step(STEP);
      return s.vehicle(minor).reason;
    };
    expect(decide(3.0)).not.toBe('Waiting for a gap'); // takes it
    expect(decide(7.0)).toBe('Waiting for a gap'); // passes it up
  });

  it('does not enter while the exit has no room, even with the road clear', () => {
    // A red light just past the junction holds a tractor right where the minor-road car would go.
    const pieces = tJunction.map((p, i) => (i === 10 ? { ...p, piece: 'crossing' } : p));
    const g = buildLaneGraph(pieces);
    const s = new TrafficSimulation(g, {
      seed: 3,
      controls: resolveControls(pieces, g, [
        { type: 'yield', piece: T, port: 's' },
        { type: 'signal', piece: 10, port: 'w', timing: { green: 1, amber: 1, red: 10000, offset: 2 } },
      ]),
    });
    // The lane between the junction and the crossing is 8.75 m long; the tractor waits at its far end.
    s.addVehicle({ type: 'tractor', profile: 'steady', from: WEST, to: EAST_LABEL, position: 87, speed: 0 });
    const minor = s.addVehicle({ type: 'sedan', profile: 'steady', from: SOUTH, to: EAST_LABEL, position: MINOR_AT_LINE, speed: 0 });
    run(s, 10);
    expect(inJunction(s, minor, g)).toBe(false);
    expect(s.vehicle(minor).reason).toBe('Exit lane full');
  });
});

/** Four straight arms from the board edges into a junction piece at the centre (8.5, 8.5) or (8, 8) for 3 × 3 pieces. */
function fourArms(centrePiece: PiecePlacement, reach: number): PiecePlacement[] {
  const [cx, cz] = centrePiece.at;
  const arms: PiecePlacement[] = [centrePiece];
  for (let x = 0.5; x < 16; x++) if (Math.abs(x - cx) > reach) arms.push({ piece: 'straight', at: [x, cz], rotation: 0 });
  for (let z = 0.5; z < 16; z++) if (Math.abs(z - cz) > reach) arms.push({ piece: 'straight', at: [cx, z], rotation: 90 });
  return arms;
}

describe('junctions: roundabout', () => {
  const pieces = fourArms({ piece: 'roundabout', at: [8.5, 8.5], rotation: 0 }, 1.5);
  const g = buildLaneGraph(pieces);
  const label = (x: number, z: number) => g.gateways.find((w) => w.at[0] === x && w.at[1] === z)!.label;
  const [N, E, S, W] = [label(8.5, 0), label(16, 8.5), label(8.5, 16), label(0, 8.5)];

  it('makes entering drivers give way to traffic already on the ring, which keeps going', () => {
    const s = new TrafficSimulation(g, { seed: 4, controls: resolveControls(pieces, g, []) });
    // Anticlockwise from the south arm, this car passes the east and north entries before leaving west.
    const circulating = s.addVehicle({ type: 'sedan', profile: 'steady', from: S, to: W, position: 54, speed: 9 });
    // Waiting at the north entry's line (the north arm is 7 tiles, 61.25 m, long).
    const entering = s.addVehicle({ type: 'sedan', profile: 'steady', from: N, to: E, position: 60.5, speed: 0 });
    let waited = false;
    let circulatingSlowest = Infinity;
    // 30 s: the entering car goes three-quarters of the way round at the ring's curve speed.
    run(s, 30, () => {
      if (s.has(entering) && s.vehicle(entering).reason === 'Waiting for a gap') waited = true;
      if (s.has(circulating) && s.vehicle(circulating).routeIndex > 7) circulatingSlowest = Math.min(circulatingSlowest, s.vehicle(circulating).speed);
    });
    expect(waited).toBe(true);
    expect(circulatingSlowest).toBeGreaterThan(2); // slows to the ring's curve speed (~4 m/s), never stops for the entering car
    expect(s.has(entering)).toBe(false); // it got in afterwards and left
  });
});

describe('junctions: crossroads', () => {
  const pieces = fourArms({ piece: 'crossroad', at: [8.5, 8.5], rotation: 0 }, 0.5);
  const g = buildLaneGraph(pieces);
  const label = (x: number, z: number) => g.gateways.find((w) => w.at[0] === x && w.at[1] === z)!.label;
  const [N, E, S, W] = [label(8.5, 0), label(16, 8.5), label(8.5, 16), label(0, 8.5)];
  // The north and west arms are 8 tiles (70 m) long, the south and east arms 7 tiles (61.25 m).
  const southAtLine = 60.5;

  it('makes a left turn on green give way to oncoming traffic', () => {
    // North and south approaches green together; east and west red.
    const green = { green: 30, amber: 3, red: 30, offset: 0 };
    const red = { green: 30, amber: 3, red: 30, offset: 33 };
    const s = new TrafficSimulation(g, {
      seed: 5,
      controls: resolveControls(pieces, g, [
        { type: 'signal', piece: 0, port: 'n', timing: green },
        { type: 'signal', piece: 0, port: 's', timing: green },
        { type: 'signal', piece: 0, port: 'e', timing: red },
        { type: 'signal', piece: 0, port: 'w', timing: red },
      ]),
    });
    // From the south, turning left (west), with a car coming straight on from the north.
    const turning = s.addVehicle({ type: 'sedan', profile: 'steady', from: S, to: W, position: southAtLine, speed: 0 });
    s.addVehicle({ type: 'sedan', profile: 'steady', from: N, to: S, position: 45, speed: 12 });
    s.step(STEP);
    expect(s.vehicle(turning).reason).toBe('Waiting for a gap');
  });

  it('gives way to traffic from the right at an uncontrolled crossroads', () => {
    const decide = (otherFrom: 'right' | 'left') => {
      const s = new TrafficSimulation(g, { seed: 6, controls: resolveControls(pieces, g, []) });
      // Heading north from the south arm; the right is the east arm, the left the west arm.
      const me = s.addVehicle({ type: 'sedan', profile: 'steady', from: S, to: N, position: southAtLine, speed: 0 });
      s.addVehicle({ type: 'sedan', profile: 'steady', from: otherFrom === 'right' ? E : W, to: otherFrom === 'right' ? W : E, position: 55, speed: 10 });
      s.step(STEP);
      return s.vehicle(me).reason;
    };
    expect(decide('right')).toBe('Waiting for a gap');
    expect(decide('left')).not.toBe('Waiting for a gap');
  });
});

describe('drivers: rules, patience and courtesy', () => {
  it('decides once per stop sign whether to roll through when the junction looks clear', () => {
    const slowestNearLine = (compliance: number) => {
      const s = sim([{ type: 'stop', piece: T, port: 's' }]);
      const car = s.addVehicle({ type: 'sedan', profile: 'impatient', from: SOUTH, to: WEST, position: 30, speed: 10 });
      s.vehicle(car).driver.compliance = compliance;
      let slowest = Infinity;
      run(s, 12, () => {
        if (s.has(car) && s.stopLineDistance(car) < 3) slowest = Math.min(slowest, s.vehicle(car).speed);
      });
      return slowest;
    };
    expect(slowestNearLine(1)).toBeLessThan(0.1); // stops fully
    expect(slowestNearLine(0)).toBeGreaterThan(1); // rolls through
  });

  it('only exceeds the speed limit, modestly, when the driver decides to on that stretch of road', () => {
    const cruising = (compliance: number) => {
      const s = sim([]);
      const car = s.addVehicle({ type: 'sedan', profile: 'assertive', from: WEST, to: 'A', position: 5, speed: 10 });
      s.vehicle(car).driver.compliance = compliance;
      s.vehicle(car).driver.speedFactor = 1.1;
      let fastest = 0;
      run(s, 8, () => s.has(car) && (fastest = Math.max(fastest, s.vehicle(car).speed)));
      return fastest;
    };
    const limit = 50 / 3.6;
    expect(cruising(1)).toBeLessThanOrEqual(limit + 1e-6);
    expect(cruising(0)).toBeGreaterThan(limit * 1.05);
    expect(cruising(0)).toBeLessThanOrEqual(limit * 1.15);
  });

  it('builds impatience while waiting, accepting smaller gaps, and settles once moving again', () => {
    // A signal-controlled crossing on the minor road, red for the first 40 s and green after.
    const pieces = tJunction.map((p, i) => (i === 19 ? { ...p, piece: 'crossing' } : p));
    const g = buildLaneGraph(pieces);
    const s = new TrafficSimulation(g, {
      seed: 8,
      controls: resolveControls(pieces, g, [{ type: 'signal', piece: 19, port: 'w', timing: { green: 100, amber: 1, red: 40, offset: 101 } }]),
    });
    const car = s.addVehicle({ type: 'sedan', profile: 'impatient', from: SOUTH, to: WEST, position: 10, speed: 8 });
    const calm = s.acceptedGap(car);
    run(s, 39);
    const frustrated = s.acceptedGap(car);
    expect(s.vehicle(car).reason).toBe('Red light');
    expect(frustrated).toBeLessThan(calm * 0.85);
    run(s, 6); // green: moving again
    expect(s.acceptedGap(car)).toBeGreaterThan(frustrated);
  });

  it('has a cooperative driver ease off to let a waiting side-road driver out, where a steady one carries on', () => {
    const outcome = (profile: 'cooperative' | 'steady') => {
      const s = sim([{ type: 'yield', piece: T, port: 's' }]);
      const major = s.addVehicle({ type: 'sedan', profile, from: WEST, to: 'A', position: 25, speed: 12 });
      s.vehicle(major).driver.courtesy = profile === 'cooperative' ? 1 : 0;
      const minor = s.addVehicle({ type: 'sedan', profile: 'steady', from: SOUTH, to: 'A', position: MINOR_AT_LINE, speed: 0 });
      let minorFirst = false;
      run(s, 10, () => {
        if (s.has(minor) && inJunction(s, minor) && s.has(major) && s.routeProgress(major) < 70) minorFirst = true;
      });
      return minorFirst;
    };
    expect(outcome('cooperative')).toBe(true);
    expect(outcome('steady')).toBe(false);
  });
});

describe('junctions: controls change the outcome', () => {
  const pieces = fourArms({ piece: 'crossroad', at: [8.5, 8.5], rotation: 0 }, 0.5);
  const g = buildLaneGraph(pieces);
  const label = (x: number, z: number) => g.gateways.find((w) => w.at[0] === x && w.at[1] === z)!.label;
  const [N, E, S, W] = [label(8.5, 0), label(16, 8.5), label(8.5, 16), label(0, 8.5)];

  it('shifts where queues form when a signal’s timing changes', () => {
    const longestWestQueue = (eastWestGreen: number) => {
      const northSouthGreen = 40 - eastWestGreen;
      const ns = { green: northSouthGreen, amber: 3, red: eastWestGreen + 3, offset: 0 };
      const ew = { green: eastWestGreen, amber: 3, red: northSouthGreen + 3, offset: -(northSouthGreen + 3) };
      const s = new TrafficSimulation(g, {
        seed: 9,
        controls: resolveControls(pieces, g, [
          { type: 'signal', piece: 0, port: 'n', timing: ns },
          { type: 'signal', piece: 0, port: 's', timing: ns },
          { type: 'signal', piece: 0, port: 'e', timing: ew },
          { type: 'signal', piece: 0, port: 'w', timing: ew },
        ]),
        demand: { tripsPerMinute: 14, entries: { [N]: 1, [E]: 1, [S]: 1, [W]: 1 }, destinations: { [N]: 1, [E]: 1, [S]: 1, [W]: 1 } },
      });
      let longest = 0;
      const westEntry = g.gateways.find((x) => x.label === W)!.entryLanes;
      run(s, 180, () => {
        // Vehicles from the west, stopped before the crossroads.
        const westQueued = s.allVehicles().filter((v) => westEntry.includes(v.route[0]) && v.speed < 0.5 && g.lanes[v.route[v.routeIndex]].piece !== 0);
        longest = Math.max(longest, westQueued.length);
      });
      return longest;
    };
    expect(longestWestQueue(8)).toBeGreaterThan(longestWestQueue(28));
  });

  it('changes who goes first when a stop sign is added', () => {
    const iWait = (stopOnTheirApproach: boolean) => {
      const s = new TrafficSimulation(g, {
        seed: 10,
        controls: resolveControls(pieces, g, stopOnTheirApproach ? [{ type: 'stop', piece: 0, port: 'e' }] : []),
      });
      const me = s.addVehicle({ type: 'sedan', profile: 'steady', from: S, to: N, position: 60.5, speed: 0 });
      s.addVehicle({ type: 'sedan', profile: 'steady', from: E, to: W, position: 52, speed: 8 }); // from my right
      s.step(STEP);
      return s.vehicle(me).reason === 'Waiting for a gap';
    };
    expect(iWait(false)).toBe(true); // they come from the right: they go first
    expect(iWait(true)).toBe(false); // a stop sign on their side: I go first
  });
});
