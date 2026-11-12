import type { LaneGraph } from '../network/buildLaneGraph';
import { type Conflict, findConflicts, type Turn, turnBetween, turnOf } from '../network/conflicts';
import { type Driver, type ProfileId, sampleDriver } from './drivers';
import { Random } from './random';
import { Router } from './routing';
import { type ApproachControl, aspectAt, type SignalControl } from './signals';
import { VEHICLE_TYPES, type VehicleType, type VehicleTypeId } from './vehicleTypes';

/** One lane is 0.4 tile and 3.5 m wide, so a road tile is 8.75 m. */
export const METRES_PER_TILE = 8.75;
/** Default urban speed limit, m/s (50 km/h). */
export const DEFAULT_SPEED_LIMIT = 50 / 3.6;
/** IDM acceleration exponent. */
const DELTA = 4;
/** How far ahead drivers look for a vehicle or obstacle, metres. */
const LOOKAHEAD = 250;
/** Drivers stop this far short of the stop line, metres. */
const STOP_LINE_MARGIN = 0.5;
/** A car this close behind its leader (in its own preferred following distance) is following it. */
const FOLLOWING_RANGE = 2.5;
/** Nothing may ever get closer than this to the vehicle ahead, metres. */
const CONTACT_MARGIN = 0.1;
/** Drivers start weighing up a junction this far before its stop line, metres. */
const JUNCTION_APPROACH = 60;
/** Speed below which a vehicle counts as stopped, m/s. */
const STOPPED = 0.1;
/** Speed below which a driver counts as held up (impatience builds), m/s. */
const HELD_UP = 1;
/** How much faster impatience eases once moving than it builds while waiting. */
const CALMING_RATE = 2;
/** A driver rolling through a stop sign slows to this, m/s. */
const ROLLING_SPEED = 2.5;
/** Sideways acceleration drivers accept through a curve, m/s². */
const CURVE_ACCELERATION = 2.5;
/**
 * Courteous drivers notice someone waiting to pull out this far ahead of the meeting
 * point, metres: far enough to decide before they commit to the junction (about 35 m
 * out at 50 km/h) plus the width of the junction.
 */
const COURTESY_RANGE = 70;
/** Speed a courteous driver slows to while letting someone out, m/s. */
const COURTESY_SPEED = 3;
/** Where lanes split, a vehicle on the other branch blocks the split until its rear is this far along, metres. */
const DIVERGE_CLEARANCE = 3;
/** Gateways closer than this (tiles) are one road: the two carriageways of a divided road are 1 tile apart. */
const SAME_ROAD = 1.5;
/** Usual extra time lost at a stop sign and at a yield, seconds (for route choice). */
const STOP_DELAY = 4;
const YIELD_DELAY = 1.5;
/** Time each queued vehicle adds for drivers behind it, seconds (for route choice). */
const QUEUE_DISCHARGE = 2;
/** Held up this long, a driver starts weighing up other routes, seconds; and checks again this often. */
const REROUTE_AFTER = 3;
const REROUTE_EVERY = 1;
/** Another route must save at least this much, seconds, or this share of the time left, before a driver switches. */
const REROUTE_SAVING = 3;
const REROUTE_SHARE = 0.15;
/** How much more a fully frustrated driver weighs queues than a calm one (sensitivity × (1 + this × impatience)). */
const FRUSTRATED_ROUTE_WEIGHT = 4;
/** A trip waiting at an entry reconsiders its route this often while the entrance is full, seconds. */
const ENTRY_ROUTE_REFRESH = 1;

/** Why a vehicle is doing what it does, as shown on hover. */
export type Reason =
  | 'Red light'
  | 'Amber light'
  | 'Stop sign'
  | 'Waiting for a gap'
  | 'Exit lane full'
  | 'Road closed ahead'
  | 'Queued behind the car ahead'
  | 'Braking for the car ahead'
  | 'Following the car ahead'
  | 'Pulling away'
  | 'Cruising';

export interface VehicleState {
  id: number;
  type: VehicleType;
  driver: Driver;
  /** Gateway label of the exit this trip is heading for. */
  destination: string;
  /** Lanes from entry to exit. */
  route: number[];
  /** Index into `route` of the current lane. */
  routeIndex: number;
  /** Distance of the front bumper along the current lane, metres. */
  position: number;
  speed: number;
  acceleration: number;
  /** Speed this driver wants on the current road, m/s. */
  preferredSpeed: number;
  reason: Reason;
  /** Lane of a stop line the driver decided to go through on amber. */
  committedThrough: number | null;
  /** Junction entry lane the driver has committed to entering. */
  committedJunction: number | null;
  /** Stop-sign lane where the driver has already come to a full stop. */
  stoppedAt: number | null;
  /** When the driver came to a stop at the line of the junction ahead (Infinity if not waiting there). */
  waitingSince: number;
  /** Braking a courteous driver applies this step to let someone out, m/s². */
  courtesyBraking: number;
  /** Seconds spent held up recently; drives impatience. */
  heldUp: number;
  /** Highest speed allowed this step by a decision (rolling a stop, letting someone out), m/s. */
  speedCap: number;
  /** Rule and courtesy decisions already made, so each is made once per encounter. */
  decisions: Map<string, boolean>;
  /** This vehicle's own seeded generator for those decisions. */
  random: Random;
  /** What last stopped the driver entering a junction (diagnostics). */
  blockedBy: string;
  /** Count of junctions passed: identifies the stretch of road the vehicle is on. */
  stretch: number;
  /** When the driver next weighs up another route while held up. */
  routeCheckAt: number;
  /** Cut off from every exit by a closure: the route stops short of it and the vehicle waits there. */
  stranded: boolean;
  /** Can no longer reach its destination (counted as a blocked trip). */
  blocked: boolean;
}

/** Trips arriving at the board's entries. Rates are per entry with weight 1. */
export interface Demand {
  tripsPerMinute: number;
  /** Relative share of trips at each entry gateway, by label. Entries not listed get none. */
  entries: Record<string, number>;
  /** Relative share of trips to each exit gateway; defaults to every reachable exit equally. */
  destinations?: Record<string, number>;
  vehicleMix?: Partial<Record<VehicleTypeId, number>>;
  profileMix?: Partial<Record<ProfileId, number>>;
}

export const DEFAULT_VEHICLE_MIX: Record<VehicleTypeId, number> = { compact: 20, sedan: 30, suv: 15, pickup: 10, van: 10, boxTruck: 8, heavyTruck: 5, tractor: 2 };
export const DEFAULT_PROFILE_MIX: Record<ProfileId, number> = { steady: 40, cautious: 20, cooperative: 20, assertive: 10, impatient: 10 };

export interface TripCounts {
  /** Trips that have arrived at an entry. */
  due: number;
  /** Trips that got onto the board. */
  entered: number;
  /** Trips that reached their exit. */
  finished: number;
  /** Trips waiting outside a full entrance right now. */
  waiting: number;
  /** Trips with no way to their destination: turned away at the entry, or cut off on the board. */
  blocked: number;
}

export interface SimulationOptions {
  seed: number;
  /** Signals, stop signs and yields on approaches (see `resolveControls`). */
  controls?: ApproachControl[];
  /** Signals only; shorthand kept for signal-only scenes. */
  signals?: SignalControl[];
  demand?: Demand;
}

/** A trip waiting at an entry; its vehicle and driver are fixed when it arrives. */
interface PendingTrip {
  type: VehicleTypeId;
  driver: Driver;
  to: string;
  /** False for trips that arrived before the counts were last reset (e.g. during warm-up). */
  counted: boolean;
  /** The route it will take (null: no way through), and when it was chosen; refreshed while it waits. */
  routed?: { lanes: number[] | null; at: number };
}

interface Entry {
  label: string;
  ratePerSecond: number;
  arrivals: Random;
  nextArrival: number;
  waiting: PendingTrip[];
}

export interface NewVehicle {
  type: VehicleTypeId;
  profile: ProfileId;
  /** Gateway labels. */
  from: string;
  to: string;
  /** Front bumper's distance along the route, metres (defaults to just inside the entry). */
  position?: number;
  /** Starting speed, m/s. */
  speed?: number;
}

interface Obstacle {
  /** Distance from this vehicle's front bumper to the obstacle's rear, metres. */
  gap: number;
  speed: number;
  kind: 'car' | 'red' | 'amber' | 'stop' | 'gap' | 'exit' | 'closed';
  /** The vehicle ahead, for cars. */
  vehicle?: VehicleState;
}

/** Where a vehicle's rear bumper is: a lane of its route and the distance along it. */
interface Rear {
  vehicle: VehicleState;
  lane: number;
  position: number;
}

/**
 * Agent-based traffic on a lane graph. Each vehicle follows a route and adjusts its
 * speed with the Intelligent Driver Model, using its driver's preferences within its
 * vehicle's physical limits. Advances in fixed steps; all randomness is seeded.
 */
export class TrafficSimulation {
  private readonly vehicles = new Map<number, VehicleState>();
  private readonly random: Random;
  private nextId = 0;
  private readonly laneLength: number[];
  private readonly controlOnLane = new Map<number, ApproachControl>();
  /** Every controlled approach, in the order given (`controls`, then `signals`). */
  private readonly controls: ApproachControl[];
  private readonly conflicts: Map<number, Conflict[]>;
  private readonly turns: Turn[];
  /**
   * Which junction each lane belongs to (-1 for ordinary road). Junction pieces that join
   * directly, like the two crossroads where a divided road meets a side street, are one
   * junction: drivers commit to crossing all of it and never stop in between.
   */
  private readonly junctionOf: number[];
  /** Highest comfortable speed through each lane, from its tightest curve, m/s. */
  private readonly curveSpeed: number[];
  /** For each lane, the other lanes that end at the same merge point. */
  private readonly mergesWith: Map<number, number[]>;
  /** Simulated seconds since the simulation started. */
  time = 0;
  private readonly entries: Entry[];
  private readonly demand?: Demand;
  private readonly designedRoutes = new Map<string, number[] | null>();
  private readonly router: Router;
  private readonly queueDelay: number[];
  private queueDelayAt = -1;
  private tripCount = 0;
  private entered = 0;
  private finished = 0;
  private due = 0;
  private blocked = 0;
  /** Trips turned away at each entry because there was no way through, by gateway label. */
  private blockedAt: Record<string, number> = {};
  private readonly exitLanes: ReadonlySet<number>;
  /** Each gateway's entry lanes and its exit lanes as a set, by label. */
  private readonly gateways: Map<string, { entryLanes: number[]; exits: ReadonlySet<number> }>;
  /** Seconds each finished trip took from entering the board to leaving it. */
  travelTimes: number[] = [];
  private readonly enteredAt = new Map<number, number>();
  /** Rear bumpers by lane, rebuilt each step. */
  private rearsByLane = new Map<number, Rear[]>();
  /**
   * Crossing points currently held, keyed by the pair of lanes that cross. A vehicle
   * reserves every crossing on its path through a junction before committing, and
   * releases each one once its rear has passed it: two vehicles never cross at once.
   */
  private readonly crossings = new Map<string, { vehicle: VehicleState; lane: number; at: number }>();

  constructor(
    private readonly graph: LaneGraph,
    options: SimulationOptions,
  ) {
    this.random = new Random(options.seed);
    this.laneLength = graph.lanes.map((l) => l.length * METRES_PER_TILE);
    const controls: ApproachControl[] = [...(options.controls ?? []), ...(options.signals ?? []).map((s) => ({ type: 'signal' as const, lanes: s.lanes, timing: s.timing }))];
    for (const control of controls) for (const lane of control.lanes) this.controlOnLane.set(lane, control);
    this.controls = controls;
    this.conflicts = findConflicts(graph);
    this.turns = graph.lanes.map(turnOf);
    this.junctionOf = junctionClusters(graph, this.conflicts);
    this.curveSpeed = graph.lanes.map((lane) => Math.sqrt(CURVE_ACCELERATION * tightestRadius(lane.points) * METRES_PER_TILE));
    this.router = new Router(graph, graph.lanes.map((lane) => this.freeFlowTime(lane.id)));
    this.queueDelay = graph.lanes.map(() => 0);
    this.exitLanes = new Set(graph.gateways.flatMap((g) => g.exitLanes));
    this.gateways = new Map(graph.gateways.map((g) => [g.label, { entryLanes: g.entryLanes, exits: new Set(g.exitLanes) }]));
    this.mergesWith = new Map(graph.lanes.map((l) => [l.id, this.conflicts.get(l.id)!.filter((c) => c.kind === 'merge').map((c) => c.lane)]));
    this.demand = options.demand;
    this.entries = Object.entries(options.demand?.entries ?? {})
      .filter(([, weight]) => weight > 0)
      .map(([label, weight], i) => {
        const arrivals = this.random.fork('entries', i);
        const ratePerSecond = (options.demand!.tripsPerMinute * weight) / 60 || 0;
        return { label, ratePerSecond, arrivals, nextArrival: ratePerSecond > 0 ? arrivals.exponential(ratePerSecond) : Infinity, waiting: [] };
      });
  }

  get counts(): TripCounts {
    const waiting = this.entries.reduce((n, e) => n + e.waiting.filter((t) => t.counted).length, 0);
    return { due: this.due, entered: this.entered, finished: this.finished, waiting, blocked: this.blocked };
  }

  /**
   * Start counting afresh, e.g. after the warm-up. Trips already on the board or
   * waiting outside carry on as before but aren't counted in the new totals.
   */
  resetCounts() {
    this.due = this.entered = this.finished = this.blocked = 0;
    this.blockedAt = {};
    this.travelTimes = [];
    this.enteredAt.clear();
    for (const entry of this.entries) for (const trip of entry.waiting) trip.counted = false;
  }

  allVehicles(): VehicleState[] {
    return [...this.vehicles.values()];
  }

  /** Distance travelled along the route so far, front bumper, metres. */
  routeProgress(id: number): number {
    const v = this.vehicle(id);
    return this.lengthOf(v.route, 0, v.routeIndex) + v.position;
  }

  /** Whether the vehicle is still on the board (it leaves at its exit). */
  has(id: number) {
    return this.vehicles.has(id);
  }

  vehicle(id: number): VehicleState {
    const v = this.vehicles.get(id);
    if (!v) throw new Error(`No vehicle ${id}`);
    return v;
  }

  /** Place a vehicle directly (tests and set-ups); demand-driven trips enter through `step`. */
  addVehicle({ type, profile, from, to, position, speed = 0 }: NewVehicle): number {
    const route = this.router.path(this.gateway(from).entryLanes, this.gateway(to).exits)?.lanes;
    if (!route) throw new Error(`No route from ${from} to ${to}`);
    const driver = sampleDriver(profile, this.random.fork('vehicles', this.nextId));
    return this.place(VEHICLE_TYPES[type], driver, to, route, position ?? VEHICLE_TYPES[type].length, speed);
  }

  /**
   * Distance from `from`'s front bumper forward to `to`'s front bumper, following
   * `from`'s route; Infinity when `to` isn't ahead on that route.
   */
  distanceAlongRoute(from: number, to: number): number {
    const a = this.vehicle(from);
    const b = this.vehicle(to);
    const lane = b.route[b.routeIndex];
    let distance = -a.position;
    for (let i = a.routeIndex; i < a.route.length; i++) {
      if (a.route[i] === lane && (i > a.routeIndex || b.position > a.position)) return distance + b.position;
      distance += this.laneLength[a.route[i]];
    }
    return Infinity;
  }

  /**
   * Distance from the vehicle's front bumper to the next signal stop line on its route,
   * metres; Infinity once it has passed the last one.
   */
  stopLineDistance(id: number): number {
    return this.nextStopLine(this.vehicle(id))?.distance ?? Infinity;
  }

  step(dt: number) {
    this.releaseCrossings();
    this.indexRears();
    this.arriveAndEnter();
    const all = [...this.vehicles.values()];
    // Decide every vehicle's acceleration from the same snapshot, then move them all.
    const leaders = new Map<VehicleState, Obstacle | null>();
    const controls = new Map<VehicleState, Obstacle | null>();
    for (const v of all) {
      v.heldUp = v.speed < HELD_UP ? v.heldUp + dt : Math.max(0, v.heldUp - CALMING_RATE * dt);
      v.speedCap = Infinity;
      v.courtesyBraking = 0;
      this.updateWaiting(v);
    }
    for (const v of all) v.speedCap = Math.min(v.speedCap, this.curveLimit(v));
    for (const v of all) if (v.heldUp >= REROUTE_AFTER && this.time >= v.routeCheckAt) this.considerAnotherRoute(v);
    // Courtesy first: a driver letting someone out must not claim the junction this step.
    this.letWaitingDriversOut(all);
    for (const v of all) controls.set(v, v.stranded ? this.closureAhead(v) : this.controlAhead(v));
    for (const v of all) {
      const car = this.leaderAhead(v.route, v.routeIndex, v.position, v);
      leaders.set(v, car);
      const signal = controls.get(v) ?? null;
      const carAccel = this.idmAcceleration(v, car);
      const signalAccel = signal ? this.idmAcceleration(v, signal) : Infinity;
      v.acceleration = Math.min(carAccel, signalAccel, v.courtesyBraking > 0 ? -v.courtesyBraking : Infinity);
      v.reason = describe(v, signalAccel < carAccel ? signal : car);
    }
    this.time += dt;
    const moves = new Map<VehicleState, number>();
    for (const v of all) {
      v.speed = Math.max(0, v.speed + v.acceleration * dt);
      moves.set(v, v.speed * dt);
    }
    // Safety net: no vehicle may move further than the room the vehicle ahead leaves it.
    for (const v of all) {
      const leader = leaders.get(v);
      if (!leader?.vehicle) continue;
      const room = leader.gap + (moves.get(leader.vehicle) ?? 0) - CONTACT_MARGIN;
      if (moves.get(v)! > room) {
        moves.set(v, Math.max(0, room));
        v.speed = Math.min(v.speed, leader.vehicle.speed);
      }
    }
    for (const v of all) {
      v.position += moves.get(v)!;
      this.advanceAlongRoute(v);
      if (!v.stranded && v.routeIndex === v.route.length - 1 && v.position >= this.laneLength[v.route[v.routeIndex]]) this.finish(v);
    }
  }

  private place(type: VehicleType, driver: Driver, destination: string, route: number[], position: number, speed: number) {
    const id = this.nextId++;
    const v: VehicleState = {
      id,
      type,
      driver,
      destination,
      route,
      routeIndex: 0,
      position,
      speed,
      acceleration: 0,
      preferredSpeed: 0,
      reason: speed > 0 ? 'Cruising' : 'Pulling away',
      committedThrough: null,
      committedJunction: null,
      stoppedAt: null,
      waitingSince: Infinity,
      courtesyBraking: 0,
      heldUp: 0,
      speedCap: Infinity,
      decisions: new Map(),
      random: this.random.fork('decisions', id),
      blockedBy: '',
      stretch: 0,
      routeCheckAt: 0,
      stranded: false,
      blocked: false,
    };
    this.setPreferredSpeed(v);
    this.advanceAlongRoute(v);
    this.vehicles.set(id, v);
    this.indexRear(v);
    return id;
  }

  private finish(v: VehicleState) {
    this.vehicles.delete(v.id);
    if (this.enteredAt.has(v.id)) {
      if (!v.blocked) {
        this.finished++;
        this.travelTimes.push(this.time - this.enteredAt.get(v.id)!);
      }
      this.enteredAt.delete(v.id);
    }
  }

  /**
   * New trips arrive at each entry on their seeded schedule. The first waiting trip
   * enters once its driver's minimum gap fits behind whatever is ahead, at a speed
   * that keeps their preferred following distance.
   */
  private arriveAndEnter() {
    for (const entry of this.entries) {
      while (this.time >= entry.nextArrival) {
        const trip = this.newTrip(entry.label);
        if (trip) {
          this.due++;
          entry.waiting.push(trip);
        }
        entry.nextArrival += entry.arrivals.exponential(entry.ratePerSecond);
      }
      const trip = entry.waiting[0];
      if (!trip) continue;
      const route = this.routeForTrip(entry.label, trip);
      if (!route) {
        // No way through from here: the trip is turned away and counted as blocked.
        entry.waiting.shift();
        if (trip.counted) {
          this.blocked++;
          this.blockedAt[entry.label] = (this.blockedAt[entry.label] ?? 0) + 1;
        }
        continue;
      }
      const type = VEHICLE_TYPES[trip.type];
      // Look from where the new vehicle's rear would be (the board edge), so anything
      // overlapping its footprint counts; then measure from its front.
      const fromEdge = this.leaderAhead(route, 0, 0, null);
      const ahead = fromEdge && { ...fromEdge, gap: fromEdge.gap - type.length };
      const preferred = Math.min(type.maxSpeed, DEFAULT_SPEED_LIMIT * trip.driver.speedFactor);
      let speed = preferred * 0.7;
      if (ahead) {
        if (ahead.gap < trip.driver.minGap + 0.5) continue; // entrance full: the trip keeps waiting
        speed = Math.min(speed, (ahead.gap - trip.driver.minGap) / trip.driver.headway, ahead.speed + 1);
      }
      entry.waiting.shift();
      const id = this.place(type, trip.driver, trip.to, route, type.length, Math.max(0, speed));
      if (trip.counted) {
        this.enteredAt.set(id, this.time);
        this.entered++;
      }
    }
  }

  /** Draw a trip's destination, vehicle and driver from its own seeded generator. */
  private newTrip(from: string): PendingTrip | null {
    const random = this.random.fork('trips', this.tripCount++);
    const destinations = this.demand?.destinations ?? Object.fromEntries(this.graph.gateways.filter((g) => g.label !== from).map((g) => [g.label, 1]));
    const reachable = Object.fromEntries(Object.entries(destinations).filter(([to, w]) => w > 0 && !this.sameRoad(from, to) && this.designedRoute(from, to)));
    if (!Object.keys(reachable).length) return null;
    const to = random.weighted(reachable);
    const type = random.weighted({ ...DEFAULT_VEHICLE_MIX, ...this.demand?.vehicleMix } as Record<VehicleTypeId, number>);
    const profile = random.weighted({ ...DEFAULT_PROFILE_MIX, ...this.demand?.profileMix } as Record<ProfileId, number>);
    return { to, type, driver: sampleDriver(profile, random), counted: true };
  }

  /** A waiting trip's route, chosen with the queues its driver can see right now. */
  private routeForTrip(from: string, trip: PendingTrip) {
    if (!trip.routed || this.time - trip.routed.at >= ENTRY_ROUTE_REFRESH) {
      const lanes = this.router.path(this.gateway(from).entryLanes, this.gateway(trip.to).exits, this.queueCost(trip.driver.routeAwareness))?.lanes ?? null;
      trip.routed = { lanes, at: this.time };
    }
    return trip.routed.lanes;
  }

  /** Whether two gateways are the same road (one label, or the two carriageways of a divided road): no trip turns back the way it came. */
  private sameRoad(a: string, b: string) {
    const [ga, gb] = [this.graph.gateways.find((g) => g.label === a)!, this.graph.gateways.find((g) => g.label === b)!];
    return Math.hypot(ga.at[0] - gb.at[0], ga.at[1] - gb.at[1]) < SAME_ROAD;
  }

  /** Extra cost of each lane's queue to a driver with this route sensitivity, seconds. */
  private queueCost(sensitivity: number) {
    const delay = this.queueDelays();
    return (lane: number) => sensitivity * delay[lane];
  }

  /**
   * Vehicles queued at each controlled approach right now, in the order the controls were
   * given: everyone held up (below walking pace) whose next control is that approach.
   */
  queueLengths(): number[] {
    const queues = this.controls.map(() => 0);
    const index = new Map(this.controls.map((c, i) => [c, i]));
    for (const v of this.vehicles.values()) {
      if (v.speed >= HELD_UP) continue;
      const next = this.nextStopLine(v);
      if (next) queues[index.get(next.control)!]++;
    }
    return queues;
  }

  /** Trips turned away at each entry since counting started because there was no way through, by gateway label. */
  blockedAtEntries(): Readonly<Record<string, number>> {
    return { ...this.blockedAt };
  }

  /**
   * Close lanes (a connection removed by an edit) or reopen them; the set replaces the
   * previous one. Vehicles that can no longer avoid a closed lane clear it; the rest
   * reroute, and trips with no way through are blocked.
   */
  setClosed(lanes: Iterable<number>) {
    this.router.close(lanes);
    for (const entry of this.entries) for (const trip of entry.waiting) trip.routed = undefined;
    for (const v of this.vehicles.values()) this.rerouteAfterEdit(v);
  }

  private rerouteAfterEdit(v: VehicleState) {
    const closed = this.router.closed;
    let fixed = this.unavoidableIndex(v);
    // Too late to avoid a closed lane: carry on and clear it, deciding again once past it.
    if (v.route.slice(v.routeIndex, fixed + 1).some((lane) => closed.has(lane)))
      while (fixed + 1 < v.route.length && closed.has(v.route[fixed + 1])) fixed++;
    const affected = v.stranded || v.blocked || v.route.slice(fixed + 1).some((lane) => closed.has(lane));
    if (!affected) {
      this.considerAnotherRoute(v); // unaffected, but the network changed: maybe there's a quicker way now
      return;
    }
    const prefix = v.route.slice(0, fixed + 1);
    const extra = this.queueCost(this.routeSensitivityOf(v));
    const starts = this.graph.lanes[v.route[fixed]].next;
    const targets = this.gateway(v.destination).exits;
    const onward = targets.has(v.route[fixed]) ? { lanes: [] } : this.router.path(starts, targets, extra);
    if (onward) {
      v.route = [...prefix, ...onward.lanes];
      v.stranded = false;
      this.unmarkBlocked(v); // a way through again (e.g. reopened)
      return;
    }
    this.markBlocked(v);
    // No way to its destination: leave by another exit if there is one.
    const elsewhere = this.exitLanes.has(v.route[fixed]) ? { lanes: [] } : this.router.path(starts, this.exitLanes, extra);
    if (elsewhere) {
      v.route = [...prefix, ...elsewhere.lanes];
      v.stranded = false;
      return;
    }
    // Nowhere to go: pull up short of the closure, without entering a junction, and wait.
    let end = fixed;
    for (let i = fixed + 1; i < v.route.length; i++) {
      const enteringJunction = this.isJunctionLane(v.route[i]) && this.junctionOf[v.route[i]] !== this.junctionOf[v.route[i - 1]];
      if (closed.has(v.route[i]) || enteringJunction) break;
      end = i;
    }
    v.route = v.route.slice(0, end + 1);
    v.stranded = true;
  }

  private markBlocked(v: VehicleState) {
    if (v.blocked) return;
    v.blocked = true;
    if (this.enteredAt.has(v.id)) this.blocked++;
  }

  private unmarkBlocked(v: VehicleState) {
    if (!v.blocked) return;
    v.blocked = false;
    if (this.enteredAt.has(v.id)) this.blocked--;
  }

  /**
   * The last route index the vehicle can no longer avoid: what it has committed to, plus
   * any lane that starts within its emergency stopping distance, and never stopping
   * inside a junction.
   */
  private unavoidableIndex(v: VehicleState) {
    let index = this.lockedIndex(v);
    const stopping = (v.speed * v.speed) / (2 * v.type.maxBraking);
    let distance = this.lengthOf(v.route, v.routeIndex, index + 1) - v.position;
    while (index + 1 < v.route.length && (distance < stopping || this.isJunctionLane(v.route[index]))) {
      index++;
      distance += this.laneLength[v.route[index]];
    }
    return index;
  }

  /** A stranded vehicle stops at the end of its cut-short route. */
  private closureAhead(v: VehicleState): Obstacle {
    const distance = this.lengthOf(v.route, v.routeIndex, v.route.length) - v.position;
    return { gap: distance - STOP_LINE_MARGIN + v.driver.minGap, speed: 0, kind: 'closed' };
  }

  /**
   * How much the queues a driver can see weigh in their choice of route right now: their
   * usual awareness, growing as they get frustrated and easing once they move again.
   * Public as a test seam (like `acceptedGap`).
   */
  routeSensitivity(id: number) {
    return this.routeSensitivityOf(this.vehicle(id));
  }

  private routeSensitivityOf(v: VehicleState) {
    return v.driver.routeAwareness * (1 + FRUSTRATED_ROUTE_WEIGHT * this.impatience(v));
  }

  /** A held-up driver switches to another route if it now looks clearly quicker. */
  private considerAnotherRoute(v: VehicleState) {
    v.routeCheckAt = this.time + REROUTE_EVERY;
    // Cut off from its destination: only an edit can change that (see `rerouteAfterEdit`).
    if (v.stranded || v.blocked) return;
    const locked = this.lockedIndex(v);
    const targets = this.gateway(v.destination).exits;
    if (targets.has(v.route[locked])) return;
    const extra = this.queueCost(this.routeSensitivityOf(v));
    const better = this.router.path(this.graph.lanes[v.route[locked]].next, targets, extra);
    if (!better) return;
    const current = this.router.costOf(v.route.slice(locked + 1), extra);
    if (current - better.cost > Math.max(REROUTE_SAVING, REROUTE_SHARE * current)) v.route = [...v.route.slice(0, locked + 1), ...better.lanes];
  }

  /**
   * The last route index the vehicle can no longer change: its current lane, or the end of
   * a junction (or amber light) it has committed to.
   */
  private lockedIndex(v: VehicleState) {
    let locked = v.routeIndex;
    for (const lane of [v.committedJunction, v.committedThrough]) {
      if (lane === null) continue;
      const index = v.route.indexOf(lane, v.routeIndex);
      if (index >= 0) locked = Math.max(locked, this.junctionSpan(v.route, index).at(-1)!);
    }
    return locked;
  }

  /** Extra time the queue on each lane adds, seconds, from the vehicles held up on it this step. */
  private queueDelays() {
    if (this.queueDelayAt === this.time) return this.queueDelay;
    this.queueDelay.fill(0);
    for (const v of this.vehicles.values()) if (v.speed < HELD_UP) this.queueDelay[v.route[v.routeIndex]] += QUEUE_DISCHARGE;
    this.queueDelayAt = this.time;
    return this.queueDelay;
  }

  /** The route the network was built to give this trip (cached), ignoring traffic and closures; null if none. */
  private designedRoute(from: string, to: string): number[] | null {
    const key = `${from}>${to}`;
    if (!this.designedRoutes.has(key)) this.designedRoutes.set(key, this.router.path(this.gateway(from).entryLanes, this.gateway(to).exits, undefined, new Set())?.lanes ?? null);
    return this.designedRoutes.get(key)!;
  }

  private lengthOf(route: number[], from: number, to: number) {
    let total = 0;
    for (let i = from; i < to; i++) total += this.laneLength[route[i]];
    return total;
  }

  private advanceAlongRoute(v: VehicleState) {
    while (v.position > this.laneLength[v.route[v.routeIndex]] && v.routeIndex < v.route.length - 1) {
      const leaving = v.route[v.routeIndex];
      v.position -= this.laneLength[leaving];
      v.routeIndex++;
      const entering = v.route[v.routeIndex];
      if (this.graph.lanes[entering].piece !== this.graph.lanes[leaving].piece) {
        // Into a new piece: any stop at the previous line is done with.
        v.stoppedAt = null;
        v.waitingSince = Infinity;
        // Out of a junction onto a new stretch of road: commitment done, a fresh decision about speed.
        if (this.isJunctionLane(leaving) && this.junctionOf[entering] !== this.junctionOf[leaving]) {
          v.committedJunction = null;
          v.stretch++;
          this.setPreferredSpeed(v);
        }
      }
    }
  }

  /** Index every vehicle by the lane its rear bumper is on, so leaders are found per lane. */
  private indexRears() {
    this.rearsByLane = new Map();
    for (const v of this.vehicles.values()) this.indexRear(v);
  }

  private indexRear(v: VehicleState) {
    let index = v.routeIndex;
    let position = v.position - v.type.length;
    while (position < 0 && index > 0) {
      index--;
      position += this.laneLength[v.route[index]];
    }
    const rear = { vehicle: v, lane: v.route[index], position };
    const list = this.rearsByLane.get(rear.lane);
    if (list) list.push(rear);
    else this.rearsByLane.set(rear.lane, [rear]);
  }

  /**
   * The nearest vehicle whose rear bumper is ahead on this route, from a front-bumper
   * position on `route[index]`. Rear-based, so a vehicle that has turned onto another
   * lane still counts while its rear is on this route. `self` is skipped.
   */
  private leaderAhead(route: number[], index: number, position: number, self: VehicleState | null): Obstacle | null {
    let travelled = -position;
    let best: Obstacle | null = null;
    for (let i = index; i < route.length && travelled <= LOOKAHEAD; i++) {
      for (const rear of this.rearsByLane.get(route[i]) ?? []) {
        if (rear.vehicle === self) continue;
        // On the starting lane, vehicles whose front is behind ours don't count; one level with us does.
        if (i === index && rear.position + rear.vehicle.type.length < position) continue;
        const gap = travelled + rear.position;
        if (!best || gap < best.gap) best = { gap, speed: rear.vehicle.speed, kind: 'car', vehicle: rear.vehicle };
      }
      // Where lanes split: someone who took the other branch is still in the way until
      // their rear is clear of the split.
      if (i > index || position <= 0) {
        const split = i > 0 ? this.graph.lanes[route[i - 1]].next : [];
        for (const sibling of split) {
          if (sibling === route[i]) continue;
          for (const rear of this.rearsByLane.get(sibling) ?? []) {
            if (rear.vehicle === self || rear.position >= DIVERGE_CLEARANCE) continue;
            const gap = travelled + Math.max(0, rear.position);
            if (!best || gap < best.gap) best = { gap, speed: rear.vehicle.speed, kind: 'car', vehicle: rear.vehicle };
          }
        }
      }
      if (best) return best;
      // Approaching a merge: whoever is closer to the merge point on the other lane goes first; follow them.
      if (self) {
        const toMerge = travelled + this.laneLength[route[i]];
        for (const otherLane of this.mergesWith.get(route[i]) ?? []) {
          for (const other of this.vehicles.values()) {
            if (other === self) continue;
            // Only drivers already in the junction (or committed to it) take their turn at the merge.
            const inJunction = this.junctionOf[other.route[other.routeIndex]] === this.junctionOf[otherLane];
            if (!inJunction && other.committedJunction === null) continue;
            const theirs = this.distanceToPoint(other, otherLane, this.laneLength[otherLane]);
            // Still counts until its rear has cleared the merge point (long vehicles curve in for a while).
            if (theirs === null || theirs + other.type.length < 0) continue;
            const ahead = theirs < toMerge || (theirs === toMerge && other.id < self.id);
            if (!ahead) continue;
            const gap = toMerge - theirs - other.type.length;
            if (!best || gap < best.gap) best = { gap, speed: other.speed, kind: 'car', vehicle: other };
          }
        }
        if (best) return best;
      }
      travelled += this.laneLength[route[i]];
    }
    return null;
  }

  /** Highest speed now that still lets the driver slow comfortably to each curve's speed ahead. */
  private curveLimit(v: VehicleState) {
    let limit = this.curveSpeed[v.route[v.routeIndex]];
    let distance = this.laneLength[v.route[v.routeIndex]] - v.position;
    for (let i = v.routeIndex + 1; i < v.route.length && distance <= 120; i++) {
      const lane = v.route[i];
      limit = Math.min(limit, Math.sqrt(this.curveSpeed[lane] ** 2 + 2 * v.driver.comfortBraking * distance));
      distance += this.laneLength[lane];
    }
    return limit;
  }

  /** The next controlled approach on the route ahead, and how far away its stop line is. */
  private nextStopLine(v: VehicleState): { control: ApproachControl; lane: number; distance: number } | null {
    let distance = this.laneLength[v.route[v.routeIndex]] - v.position;
    for (let i = v.routeIndex + 1; i < v.route.length && distance <= LOOKAHEAD; i++) {
      const control = this.controlOnLane.get(v.route[i]);
      if (control) return { control, lane: v.route[i], distance };
      distance += this.laneLength[v.route[i]];
    }
    return null;
  }

  /** The next point where the route enters a junction (a lane with conflicts), within the approach distance. */
  private nextJunction(v: VehicleState): { index: number; lane: number; distance: number } | null {
    let distance = this.laneLength[v.route[v.routeIndex]] - v.position;
    for (let i = v.routeIndex + 1; i < v.route.length && distance <= JUNCTION_APPROACH; i++) {
      const lane = v.route[i];
      const enters = this.isJunctionLane(lane) && this.junctionOf[lane] !== this.junctionOf[v.route[i - 1]];
      if (enters && this.junctionSpan(v.route, i).some((j) => this.conflicts.get(v.route[j])!.length)) return { index: i, lane, distance };
      distance += this.laneLength[lane];
    }
    return null;
  }

  private isJunctionLane(lane: number) {
    return this.junctionOf[lane] >= 0;
  }

  /** Route indices of the lanes inside the junction piece entered at `index`. */
  private junctionSpan(route: number[], index: number) {
    const junction = this.junctionOf[route[index]];
    const span: number[] = [];
    for (let i = index; i < route.length && this.junctionOf[route[i]] === junction; i++) span.push(i);
    return span;
  }

  /** Note when a driver comes to a stop at the line of the junction ahead (any control), for first come, first served. */
  private updateWaiting(v: VehicleState) {
    const junction = this.nextJunction(v);
    const atLine = junction !== null && junction.distance < STOP_LINE_MARGIN + 3 && v.speed < STOPPED;
    if (atLine && v.waitingSince === Infinity) v.waitingSince = this.time;
    if (!atLine && v.speed > HELD_UP) v.waitingSince = Infinity;
  }

  /**
   * At a junction: never enter while anything is in a conflict area on the path; come
   * to a full stop at a stop sign; wait for a safe gap in traffic that has priority;
   * don't enter when the exit has no room. Once a driver is too close to stop
   * comfortably and has decided to go, the priority decision is final.
   */
  private junctionAhead(v: VehicleState): Obstacle | null {
    const junction = this.nextJunction(v);
    if (!junction) {
      v.committedJunction = null;
      return null;
    }
    const atLine = (kind: Obstacle['kind']): Obstacle => ({ gap: junction.distance - STOP_LINE_MARGIN + v.driver.minGap, speed: 0, kind });
    if (v.courtesyBraking > 0 && v.committedJunction === null) {
      // Letting someone out: hang back at the line without claiming the junction.
      return atLine('gap');
    }
    if (v.committedJunction === junction.lane) {
      // Held up short of the line after committing (stuck behind someone): hand the
      // crossings back so others can use them, and decide again later.
      if (v.speed < STOPPED && junction.distance > STOP_LINE_MARGIN + 3) this.uncommit(v);
      // Otherwise only the vehicle ahead can hold a committed driver back; re-checking
      // here could leave two committed drivers each waiting for the other.
      else return null;
    }
    if (this.conflictAreaOccupied(v, junction)) return atLine('gap');
    if (this.exitFull(v, junction.index)) return atLine('exit');

    const control = this.controlOnLane.get(junction.lane);
    if (control?.type === 'stop' && v.stoppedAt !== junction.lane) {
      const rolling = this.decide(v, `stop:${junction.lane}`) && this.safeToEnter(v, junction);
      if (rolling) {
        // Rolling through: the junction looks clear, so slow right down but don't stop.
        v.speedCap = Math.sqrt(ROLLING_SPEED ** 2 + 2 * v.driver.comfortBraking * Math.max(0, junction.distance - STOP_LINE_MARGIN));
      } else if (junction.distance < STOP_LINE_MARGIN + 2.5 && v.speed < STOPPED) {
        v.stoppedAt = junction.lane;
      } else return atLine('stop');
    }
    if (!this.safeToEnter(v, junction)) return atLine('gap');
    const stoppingDistance = (v.speed * v.speed) / (2 * v.driver.comfortBraking);
    if (junction.distance <= stoppingDistance + 1) {
      // Commit only when nobody is still ahead of us before the line: otherwise we'd hold
      // the junction's crossings while stuck in the queue.
      const ahead = this.leaderAhead(v.route, v.routeIndex, v.position, v);
      if (ahead && ahead.gap < junction.distance + 1) return null;
      // The point of commitment: only go if every crossing on the path can be reserved.
      if (!this.reserveCrossings(v, junction.index)) return atLine('gap');
      v.committedJunction = junction.lane;
    }
    return null;
  }

  private uncommit(v: VehicleState) {
    v.committedJunction = null;
    for (const [key, held] of this.crossings) if (held.vehicle === v) this.crossings.delete(key);
  }

  private crossingKey(a: number, b: number) {
    return a < b ? `${a}x${b}` : `${b}x${a}`;
  }

  /** Reserve every crossing on the path through the junction entered at `index`, all or nothing. */
  private reserveCrossings(v: VehicleState, index: number): boolean {
    const wanted: { key: string; lane: number; at: number }[] = [];
    for (const i of this.junctionSpan(v.route, index)) {
      const lane = v.route[i];
      for (const c of this.conflicts.get(lane)!) {
        if (c.kind !== 'cross') continue;
        const key = this.crossingKey(lane, c.lane);
        const holder = this.crossings.get(key);
        if (holder && holder.vehicle !== v) return false;
        wanted.push({ key, lane, at: c.at * METRES_PER_TILE });
      }
    }
    for (const { key, lane, at } of wanted) this.crossings.set(key, { vehicle: v, lane, at });
    return true;
  }

  /** Release crossings whose holder has left, or whose rear has passed the crossing point. */
  private releaseCrossings() {
    for (const [key, { vehicle, lane, at }] of this.crossings) {
      if (!this.vehicles.has(vehicle.id)) {
        this.crossings.delete(key);
        continue;
      }
      const toPoint = this.distanceToPoint(vehicle, lane, at);
      if (toPoint === null || toPoint + vehicle.type.length < 0) this.crossings.delete(key);
    }
  }

  /**
   * Whether any vehicle's body is over a point where this vehicle's path through the
   * junction meets another lane. Safety comes before priority: green or not, committed
   * or not, nobody drives into a vehicle still crossing.
   */
  private conflictAreaOccupied(v: VehicleState, junction: { index: number }): boolean {
    for (const i of this.junctionSpan(v.route, junction.index)) {
      for (const conflict of this.conflicts.get(v.route[i])!) {
        const at = conflict.otherAt * METRES_PER_TILE;
        for (const other of this.vehicles.values()) {
          if (other === v) continue;
          const toConflict = this.distanceToPoint(other, conflict.lane, at);
          if (toConflict !== null && toConflict < 1 && toConflict + other.type.length > -1) return true;
        }
      }
    }
    return false;
  }

  /**
   * Whether every vehicle this driver must give way to is far enough from the conflict
   * points: its time to arrive must exceed this driver's time to clear plus the gap they
   * accept. Priority only applies at the entry: once inside (e.g. on a roundabout ring),
   * a driver doesn't give way to drivers still waiting to get in. Drivers who would each
   * give way to the other, both waiting at their lines, go in order of arrival.
   */
  private safeToEnter(v: VehicleState, junction: { index: number; lane: number; distance: number }): boolean {
    const span = this.junctionSpan(v.route, junction.index);
    const effort = v.type.maxAcceleration * v.driver.acceleration;
    const myMovement = this.movement(v.route, junction.index);
    // Giving way at a merge (e.g. onto a roundabout): don't pull in without room beyond
    // the merge point, or the merging traffic locks up.
    for (const i of span) {
      const lane = v.route[i];
      for (const conflict of this.conflicts.get(lane)!) {
        if (conflict.kind !== 'merge' || i + 1 >= v.route.length || this.priority(lane, myMovement, conflict.lane, null) !== 'yield') continue;
        const beyond = this.leaderAhead(v.route, i + 1, 0, v);
        if (beyond && beyond.gap < v.type.length + v.driver.minGap) return this.block(v, `no room beyond merge (vehicle ${beyond.vehicle?.id})`);
      }
    }
    // The conflicts where the path enters each tile of the junction (both tiles of a
    // divided-road crossing); within one piece, such as round a ring, only where it enters.
    let before = junction.distance;
    for (const i of span) {
      const mine = v.route[i];
      const entersTile = i === span[0] || this.graph.lanes[mine].piece !== this.graph.lanes[v.route[i - 1]].piece;
      for (const conflict of entersTile ? this.conflicts.get(mine)! : []) {
        const toMine = before + conflict.at * METRES_PER_TILE;
        const myArrival = timeToCover(toMine, v.speed, effort);
        const myClear = timeToCover(toMine + v.type.length, v.speed, effort);
        for (const other of this.vehicles.values()) {
          if (other === v) continue;
          const toConflict = this.distanceToPoint(other, conflict.lane, conflict.otherAt * METRES_PER_TILE);
          if (toConflict === null || toConflict + other.type.length < 0 || toConflict > LOOKAHEAD) continue;
          if (this.heldByLight(other, toConflict)) continue;
          const relation = this.priority(mine, myMovement, conflict.lane, this.movement(other.route, other.route.indexOf(conflict.lane, other.routeIndex > 0 ? other.routeIndex - 1 : 0)));
          if (relation === 'go' && other.committedJunction === null && this.junctionOf[other.route[other.routeIndex]] !== this.junctionOf[conflict.lane]) continue;
          // They're hanging back to let us out.
          if (other.decisions.get(`courtesy:${v.id}`) === true && other.committedJunction === null) continue;
          // Queued right by the merge with priority: no space to pull in ahead of it.
          if (other.speed < STOPPED && relation === 'yield' && conflict.kind === 'merge' && toConflict < 8 && toConflict > -other.type.length) return this.block(v, `queued at merge: ${other.id}`);
          if (other.speed < STOPPED) {
            // Not coming yet. Waiting at its own line with neither of us having priority:
            // whoever arrived first goes (ties by order).
            if (relation !== 'mutual' || other.waitingSince === Infinity) continue;
            // Only drivers taking turns count: not someone held by a red light or a full exit.
            if (other.reason !== 'Waiting for a gap' && other.reason !== 'Stop sign') continue;
            // Only drivers waiting at this same junction take turns with us.
            const theirJunction = this.nextJunction(other);
            if (!theirJunction || this.junctionOf[theirJunction.lane] !== this.junctionOf[junction.lane]) continue;
            if (other.waitingSince < v.waitingSince || (other.waitingSince === v.waitingSince && other.id < v.id)) return this.block(v, `arrived first: ${other.id} (lane ${conflict.lane}, ${relation})`);
            continue;
          }
          const theirArrival = toConflict / other.speed;
          // Someone already in the junction (or committed to it) is crossing: whatever the
          // priority, don't cut across them if they'll still be in the way.
          const alreadyIn = other.committedJunction !== null || this.junctionOf[other.route[other.routeIndex]] === this.junctionOf[conflict.lane];
          if (alreadyIn && theirArrival < myClear + 0.5) return this.block(v, `already in: ${other.id}`);
          if (relation === 'yield' && theirArrival < myClear + this.acceptedGapOf(v)) return this.block(v, `giving way to ${other.id} (lane ${conflict.lane})`);
          // Neither has priority: whoever gets there first goes; the other waits for a safe gap.
          if (relation === 'mutual' && (theirArrival < myArrival || (theirArrival === myArrival && other.id < v.id)) && theirArrival < myClear + this.acceptedGapOf(v)) return this.block(v, `they get there first: ${other.id} (lane ${conflict.lane})`);
        }
      }
      before += this.laneLength[mine];
    }
    return true;
  }

  /** Whether a red light (or an amber they can stop for) will hold this vehicle before it gets `distance` metres further. */
  private heldByLight(v: VehicleState, distance: number) {
    const next = this.nextStopLine(v);
    if (!next || next.control.type !== 'signal' || next.distance > distance || v.committedThrough === next.lane) return false;
    const aspect = aspectAt(next.control.timing!, this.time);
    if (aspect === 'red') return true;
    return aspect === 'amber' && next.distance > (v.speed * v.speed) / (2 * v.driver.comfortBraking);
  }

  /**
   * A movement through a whole junction: the lane it enters by and which way it turns
   * overall (a left turn across a divided road is straight on each tile but left overall).
   * Null if `index` isn't on the route.
   */
  private movement(route: number[], index: number): { entry: number; turn: Turn } | null {
    if (index < 0) return null;
    const junction = this.junctionOf[route[index]];
    let [start, end] = [index, index];
    while (start > 0 && this.junctionOf[route[start - 1]] === junction) start--;
    while (end + 1 < route.length && this.junctionOf[route[end + 1]] === junction) end++;
    return { entry: route[start], turn: turnBetween(this.graph.lanes[route[start]], this.graph.lanes[route[end]]) };
  }

  private block(v: VehicleState, why: string): false {
    v.blockedBy = why;
    return false;
  }

  /**
   * Distance from a vehicle's front to a point `at` metres along `lane`, following its
   * route (negative once the front has passed it); null if the lane isn't on its route
   * from its rear bumper onwards.
   */
  private distanceToPoint(v: VehicleState, lane: number, at: number): number | null {
    const index = v.route.indexOf(lane);
    if (index < 0) return null;
    const pointProgress = this.lengthOf(v.route, 0, index) + at;
    const frontProgress = this.lengthOf(v.route, 0, v.routeIndex) + v.position;
    if (pointProgress < frontProgress - v.type.length - 1) return null; // already behind it
    return pointProgress - frontProgress;
  }

  /**
   * Whether slow traffic leaves no room for this vehicle beyond the junction, so it would
   * stop inside it. A queue whose last vehicle still has its rear in the junction's final
   * lane counts; traffic moving slowly further back in a long junction (round a ring) doesn't.
   */
  private exitFull(v: VehicleState, index: number): boolean {
    const span = this.junctionSpan(v.route, index);
    const lastIndex = span[span.length - 1];
    if (lastIndex + 1 >= v.route.length) return false;
    const ahead = this.leaderAhead(v.route, index, 0, v);
    if (!ahead || ahead.speed >= 3) return false;
    const toLastLane = this.lengthOf(v.route, index, lastIndex);
    const through = toLastLane + this.laneLength[v.route[lastIndex]];
    return ahead.gap >= toLastLane && ahead.gap < through + v.type.length + v.driver.minGap;
  }

  /** How frustrated a driver is right now, from 0 (calm) towards 1, given how long they've been held up. */
  private impatience(v: VehicleState) {
    return v.heldUp / (v.heldUp + v.driver.patience);
  }

  /** The gap this driver will accept right now, seconds: smaller the longer they've been held up. */
  acceptedGap(id: number) {
    return this.acceptedGapOf(this.vehicle(id));
  }

  private acceptedGapOf(v: VehicleState) {
    return v.driver.acceptedGap * (1 - 0.45 * this.impatience(v));
  }

  /**
   * Whether the driver breaks a rule at this encounter. Decided once per encounter (keyed)
   * from the vehicle's own seeded generator; frustration makes it more likely.
   */
  private decide(v: VehicleState, key: string): boolean {
    let breaks = v.decisions.get(key);
    if (breaks === undefined) {
      const compliance = v.driver.compliance * (1 - 0.3 * this.impatience(v));
      breaks = v.random.next() >= compliance;
      v.decisions.set(key, breaks);
    }
    return breaks;
  }

  /** Preferred speed on the current stretch: up to the limit, or modestly over it if the driver decides to speed here. */
  private setPreferredSpeed(v: VehicleState) {
    const speeding = v.driver.speedFactor > 1 && this.decide(v, `speed:${v.stretch}`);
    const factor = speeding ? Math.min(v.driver.speedFactor, 1.15) : Math.min(v.driver.speedFactor, 1);
    v.preferredSpeed = Math.min(v.type.maxSpeed, DEFAULT_SPEED_LIMIT * factor);
  }

  /**
   * Courtesy: a driver approaching (not yet in) a junction where someone is waiting to
   * pull out across or into their path may decide, once per waiting driver, to ease off
   * at a comfortable rate and let them out.
   */
  private letWaitingDriversOut(all: VehicleState[]) {
    const waiting = all
      .filter((w) => w.reason === 'Waiting for a gap' && w.speed < HELD_UP)
      .map((w) => ({ w, junction: this.nextJunction(w) }))
      .filter((x): x is { w: VehicleState; junction: NonNullable<ReturnType<TrafficSimulation['nextJunction']>> } => x.junction !== null);
    if (!waiting.length) return;
    for (const v of all) {
      // Too late once committed (too close to stop comfortably) or already in a junction.
      if (v.driver.courtesy <= 0 || v.committedJunction !== null || this.conflicts.get(v.route[v.routeIndex])!.length) continue;
      for (const { w, junction } of waiting) {
        if (w === v) continue;
        let distance = Infinity;
        for (const i of this.junctionSpan(w.route, junction.index))
          for (const c of this.conflicts.get(w.route[i])!) {
            const d = this.distanceToPoint(v, c.lane, c.otherAt * METRES_PER_TILE);
            if (d !== null && d > 0 && d < COURTESY_RANGE) distance = Math.min(distance, d);
          }
        if (distance === Infinity) continue;
        const key = `courtesy:${w.id}`;
        if (!v.decisions.has(key)) v.decisions.set(key, v.random.next() < v.driver.courtesy);
        if (!v.decisions.get(key)) continue;
        // Slow to walking pace by the conflict point, never harder than comfortable braking.
        const needed = (v.speed * v.speed - COURTESY_SPEED * COURTESY_SPEED) / (2 * Math.max(distance - 5, 1));
        v.courtesyBraking = Math.max(v.courtesyBraking, Math.min(Math.max(needed, 0), v.driver.comfortBraking));
      }
    }
  }

  /**
   * Priority between this driver's movement through `mine` (entering through
   * `entryLane`) and traffic on `other`: `yield` (I give way), `go` (they give way), or
   * `mutual` (neither has priority: whoever reaches the conflict first goes).
   */
  private priority(mine: number, myMovement: { entry: number; turn: Turn } | null, other: number, theirMovement: { entry: number; turn: Turn } | null): 'yield' | 'go' | 'mutual' {
    const entryLane = myMovement?.entry ?? mine;
    const myTurn = myMovement?.turn ?? this.turns[mine];
    // By the time I reach a lane that continues within its piece (round a ring) I'm circulating: no approach control.
    const myControl = this.entryLaneOf(mine) === null ? undefined : this.controlOnLane.get(entryLane);
    // Traffic already circulating (a lane that continues within its piece, like a ring) has
    // no approach control; otherwise judge them by where they entered the junction.
    const otherEntry = this.entryLaneOf(other) === null ? null : (theirMovement?.entry ?? other);
    const theirTurn = theirMovement?.turn ?? this.turns[other];
    const otherControl = otherEntry === null ? undefined : this.controlOnLane.get(otherEntry);
    const minor = (c?: ApproachControl) => c?.type === 'stop' || c?.type === 'yield';
    if (minor(myControl) && minor(otherControl)) return 'mutual';
    if (minor(myControl)) return 'yield';
    if (minor(otherControl)) return 'go';
    const turnsAcross = (turn: Turn) => turn === 'left' || turn === 'u-turn';
    const goesWith = (turn: Turn) => turn === 'straight' || turn === 'right';
    // Turning across oncoming traffic gives way to it (permissive turns on green, and at uncontrolled junctions).
    const oncomingRule = (): 'yield' | 'go' | 'mutual' => {
      if (turnsAcross(myTurn) && goesWith(theirTurn)) return 'yield';
      if (goesWith(myTurn) && turnsAcross(theirTurn)) return 'go';
      return 'mutual';
    };
    if (myControl?.type === 'signal' || otherControl?.type === 'signal') return oncomingRule();
    // Uncontrolled: give way to traffic from the right.
    const [h1, h2] = [this.entryHeading(entryLane), this.entryHeading(otherEntry ?? other)];
    const cross = h1[0] * h2[1] - h1[1] * h2[0];
    if (cross < -0.5) return 'yield';
    if (cross > 0.5) return 'go';
    return oncomingRule();
  }

  /**
   * The approach lane for traffic on `lane`: the lane itself if it starts at the edge of
   * its piece (entering from another piece, or from the board edge); null for lanes that
   * continue inside a piece, such as a roundabout ring, which carry circulating traffic.
   */
  private entryLaneOf(lane: number): number | null {
    const { piece, previous } = this.graph.lanes[lane];
    return previous.length === 0 || previous.some((p) => this.graph.lanes[p].piece !== piece) ? lane : null;
  }

  private entryHeading(lane: number): [number, number] {
    const [a, b] = this.graph.lanes[lane].points;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / length, (b[2] - a[2]) / length];
  }

  /**
   * The nearer of a light that holds the driver and the junction ahead. A junction whose
   * own light is red isn't weighed up (the light decides), but a junction before a red
   * light further on still is.
   */
  private controlAhead(v: VehicleState): Obstacle | null {
    const signal = this.signalAhead(v);
    const stopLine = signal && this.nextStopLine(v)!;
    if (stopLine && stopLine.distance <= (this.nextJunction(v)?.distance ?? Infinity)) {
      // Stopping for the light of the junction we'd committed to after all: give up the claim on it.
      if (v.committedJunction !== null && this.junctionOf[v.committedJunction] === this.junctionOf[stopLine.lane]) this.uncommit(v);
      return signal;
    }
    const junction = this.junctionAhead(v);
    if (!signal || !junction) return signal ?? junction;
    return junction.gap <= signal.gap ? junction : signal;
  }

  /**
   * A red light, or an amber the driver can stop for comfortably, is a standing
   * obstacle just short of the stop line. A driver who chose to go on amber is
   * committed and keeps going.
   */
  private signalAhead(v: VehicleState): Obstacle | null {
    const next = this.nextStopLine(v);
    if (!next || next.control.type !== 'signal') {
      v.committedThrough = null;
      return null;
    }
    if (v.committedThrough === next.lane) return null;
    const aspect = aspectAt(next.control.timing!, this.time);
    if (aspect === 'green') return null;
    const canStop = next.distance > (v.speed * v.speed) / (2 * v.driver.comfortBraking);
    // Waiting at the line to turn across oncoming traffic: on amber the oncoming stream
    // stops, so finish the turn (the junction's conflict checks still apply).
    const turningOnAmber = aspect === 'amber' && v.reason === 'Waiting for a gap' && next.distance < STOP_LINE_MARGIN + 1.5;
    if (aspect === 'amber' && (!canStop || turningOnAmber)) {
      v.committedThrough = next.lane;
      return null;
    }
    // The model keeps the driver's minimum gap to an obstacle; drivers pull up to the line itself.
    return { gap: next.distance - STOP_LINE_MARGIN + v.driver.minGap, speed: 0, kind: aspect === 'amber' ? 'amber' : 'red' };
  }

  /**
   * Intelligent Driver Model: accelerate towards the preferred speed, and brake to
   * keep the driver's minimum gap plus their preferred time gap to whatever is ahead.
   * Limited by what the vehicle can physically do.
   */
  private idmAcceleration(v: VehicleState, ahead: Obstacle | null) {
    const a = v.type.maxAcceleration * v.driver.acceleration;
    const b = v.driver.comfortBraking;
    const target = Math.max(0.1, Math.min(v.preferredSpeed, v.speedCap));
    let accel = a * (1 - (v.speed / target) ** DELTA);
    if (ahead) {
      const approach = v.speed - ahead.speed;
      const desiredGap = v.driver.minGap + Math.max(0, v.speed * v.driver.headway + (v.speed * approach) / (2 * Math.sqrt(a * b)));
      accel -= a * (desiredGap / Math.max(ahead.gap, 0.01)) ** 2;
    }
    return Math.max(-v.type.maxBraking, Math.min(v.type.maxAcceleration, accel));
  }

  private gateway(label: string) {
    const gateway = this.gateways.get(label);
    if (!gateway) throw new Error(`Unknown gateway ${label}`);
    return gateway;
  }

  /**
   * Seconds to drive a lane with no traffic: at the speed limit or the lane's curve
   * speed, plus the usual wait at its control (half the red time on average for a signal).
   */
  private freeFlowTime(lane: number) {
    const time = this.laneLength[lane] / Math.min(DEFAULT_SPEED_LIMIT, this.curveSpeed[lane]);
    const control = this.controlOnLane.get(lane);
    if (!control) return time;
    if (control.type === 'signal') {
      const { green, amber, red } = control.timing!;
      return time + (red * red) / (2 * (green + amber + red));
    }
    return time + (control.type === 'stop' ? STOP_DELAY : YIELD_DELAY);
  }
}

/** Why the vehicle is doing what it's doing, in the words shown on hover. */
const OBSTACLE_REASONS: Record<Exclude<Obstacle['kind'], 'car'>, Reason> = {
  red: 'Red light',
  amber: 'Amber light',
  stop: 'Stop sign',
  gap: 'Waiting for a gap',
  exit: 'Exit lane full',
  closed: 'Road closed ahead',
};

/** Group junction pieces (pieces with conflicting lanes) that join directly into one junction; -1 per lane elsewhere. */
function junctionClusters(graph: LaneGraph, conflicts: Map<number, Conflict[]>): number[] {
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

/** Tightest turning radius along a polyline (from each three consecutive points), tiles; Infinity if straight. */
function tightestRadius(points: [number, number, number][]): number {
  let tightest = Infinity;
  for (let i = 2; i < points.length; i++) {
    const [a, b, c] = [points[i - 2], points[i - 1], points[i]];
    const [ab, bc, ca] = [Math.hypot(b[0] - a[0], b[2] - a[2]), Math.hypot(c[0] - b[0], c[2] - b[2]), Math.hypot(a[0] - c[0], a[2] - c[2])];
    const area2 = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]));
    if (area2 > 1e-9) tightest = Math.min(tightest, (ab * bc * ca) / (2 * area2));
  }
  return tightest;
}

/** Time to cover `distance` metres starting at `speed` and accelerating at `acceleration`. */
function timeToCover(distance: number, speed: number, acceleration: number) {
  if (distance <= 0) return 0;
  return (-speed + Math.sqrt(speed * speed + 2 * acceleration * distance)) / acceleration;
}

function describe(v: VehicleState, ahead: Obstacle | null): Reason {
  if (ahead && ahead.kind !== 'car' && (v.acceleration < 0 || v.speed < 0.3)) return OBSTACLE_REASONS[ahead.kind];
  const close = ahead !== null && ahead.gap < v.driver.minGap + FOLLOWING_RANGE * v.driver.headway * Math.max(v.speed, 1);
  if (close && v.speed < 0.3 && ahead.speed < 0.3) return 'Queued behind the car ahead';
  if (close && v.acceleration < -1) return 'Braking for the car ahead';
  if (close) return 'Following the car ahead';
  if (v.speed < v.preferredSpeed * 0.6 && v.acceleration > 0.1) return 'Pulling away';
  return 'Cruising';
}
