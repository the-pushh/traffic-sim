import type { LaneGraph } from '../network/buildLaneGraph';
import { type Conflict, findConflicts, type Turn, turnOf } from '../network/conflicts';
import { type Driver, type ProfileId, sampleDriver } from './drivers';
import { Random } from './random';
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
/** Courteous drivers notice someone waiting to pull out this far ahead, metres. */
const COURTESY_RANGE = 45;
/** Speed a courteous driver slows to while letting someone out, m/s. */
const COURTESY_SPEED = 3;

/** Why a vehicle is doing what it does, as shown on hover. */
export type Reason =
  | 'Red light'
  | 'Amber light'
  | 'Stop sign'
  | 'Waiting for a gap'
  | 'Exit lane full'
  | 'Queued behind the car ahead'
  | 'Braking for the car ahead'
  | 'Following the car ahead'
  | 'Pulling away'
  | 'Cruising';

export interface VehicleState {
  id: number;
  type: VehicleType;
  driver: Driver;
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
  /** Stop-sign lane where the driver has already come to a full stop, and when. */
  stoppedAt: number | null;
  stoppedSince: number;
  /** Seconds spent held up recently; drives impatience. */
  heldUp: number;
  /** Highest speed allowed this step by a decision (rolling a stop, letting someone out), m/s. */
  speedCap: number;
  /** Rule and courtesy decisions already made, so each is made once per encounter. */
  decisions: Map<string, boolean>;
  /** This vehicle's own seeded generator for those decisions. */
  random: Random;
  /** Count of junctions passed: identifies the stretch of road the vehicle is on. */
  stretch: number;
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
  kind: 'car' | 'red' | 'amber' | 'stop' | 'gap' | 'exit';
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
  private readonly conflicts: Map<number, Conflict[]>;
  private readonly turns: Turn[];
  /** Simulated seconds since the simulation started. */
  time = 0;
  private readonly entries: Entry[];
  private readonly demand?: Demand;
  private readonly routes = new Map<string, number[] | null>();
  private tripCount = 0;
  private entered = 0;
  private finished = 0;
  private due = 0;
  /** Seconds each finished trip took from entering the board to leaving it. */
  travelTimes: number[] = [];
  private readonly enteredAt = new Map<number, number>();
  /** Rear bumpers by lane, rebuilt each step. */
  private rearsByLane = new Map<number, Rear[]>();

  constructor(
    private readonly graph: LaneGraph,
    options: SimulationOptions,
  ) {
    this.random = new Random(options.seed);
    this.laneLength = graph.lanes.map((l) => l.length * METRES_PER_TILE);
    const controls: ApproachControl[] = [...(options.controls ?? []), ...(options.signals ?? []).map((s) => ({ type: 'signal' as const, lanes: s.lanes, timing: s.timing }))];
    for (const control of controls) for (const lane of control.lanes) this.controlOnLane.set(lane, control);
    this.conflicts = findConflicts(graph);
    this.turns = graph.lanes.map(turnOf);
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
    return { due: this.due, entered: this.entered, finished: this.finished, waiting };
  }

  /**
   * Start counting afresh, e.g. after the warm-up. Trips already on the board or
   * waiting outside carry on as before but aren't counted in the new totals.
   */
  resetCounts() {
    this.due = this.entered = this.finished = 0;
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
    const route = this.cachedRoute(from, to);
    if (!route) throw new Error(`No route from ${from} to ${to}`);
    const driver = sampleDriver(profile, this.random.fork('vehicles', this.nextId));
    return this.place(VEHICLE_TYPES[type], driver, route, position ?? VEHICLE_TYPES[type].length, speed);
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
    this.indexRears();
    this.arriveAndEnter();
    const all = [...this.vehicles.values()];
    // Decide every vehicle's acceleration from the same snapshot, then move them all.
    const leaders = new Map<VehicleState, Obstacle | null>();
    const controls = new Map<VehicleState, Obstacle | null>();
    for (const v of all) {
      v.heldUp = v.speed < HELD_UP ? v.heldUp + dt : Math.max(0, v.heldUp - CALMING_RATE * dt);
      v.speedCap = Infinity;
    }
    for (const v of all) controls.set(v, this.signalAhead(v) ?? this.junctionAhead(v));
    this.letWaitingDriversOut(all);
    for (const v of all) {
      const car = this.leaderAhead(v.route, v.routeIndex, v.position, v);
      leaders.set(v, car);
      const signal = controls.get(v) ?? null;
      const carAccel = this.idmAcceleration(v, car);
      const signalAccel = signal ? this.idmAcceleration(v, signal) : Infinity;
      v.acceleration = Math.min(carAccel, signalAccel);
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
      if (v.routeIndex === v.route.length - 1 && v.position >= this.laneLength[v.route[v.routeIndex]]) this.finish(v);
    }
  }

  private place(type: VehicleType, driver: Driver, route: number[], position: number, speed: number) {
    const id = this.nextId++;
    const v: VehicleState = {
      id,
      type,
      driver,
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
      stoppedSince: Infinity,
      heldUp: 0,
      speedCap: Infinity,
      decisions: new Map(),
      random: this.random.fork('decisions', id),
      stretch: 0,
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
      this.finished++;
      this.travelTimes.push(this.time - this.enteredAt.get(v.id)!);
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
      const route = this.cachedRoute(entry.label, trip.to)!;
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
      const id = this.place(type, trip.driver, route, type.length, Math.max(0, speed));
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
    const reachable = Object.fromEntries(Object.entries(destinations).filter(([to, w]) => w > 0 && this.cachedRoute(from, to)));
    if (!Object.keys(reachable).length) return null;
    const to = random.weighted(reachable);
    const type = random.weighted({ ...DEFAULT_VEHICLE_MIX, ...this.demand?.vehicleMix } as Record<VehicleTypeId, number>);
    const profile = random.weighted({ ...DEFAULT_PROFILE_MIX, ...this.demand?.profileMix } as Record<ProfileId, number>);
    return { to, type, driver: sampleDriver(profile, random), counted: true };
  }

  private cachedRoute(from: string, to: string): number[] | null {
    const key = `${from}>${to}`;
    if (!this.routes.has(key)) this.routes.set(key, this.findRoute(from, to));
    return this.routes.get(key)!;
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
      // Out of a junction onto a new stretch of road: a fresh decision about speed.
      const entering = v.route[v.routeIndex];
      if (this.conflicts?.get(leaving)?.length && !this.conflicts.get(entering)!.length) {
        v.stretch++;
        this.setPreferredSpeed(v);
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
    for (let i = index; i < route.length && travelled <= LOOKAHEAD; i++) {
      let best: Obstacle | null = null;
      for (const rear of this.rearsByLane.get(route[i]) ?? []) {
        if (rear.vehicle === self) continue;
        // On the starting lane, vehicles whose front is behind ours don't count; one level with us does.
        if (i === index && rear.position + rear.vehicle.type.length < position) continue;
        const gap = travelled + rear.position;
        if (!best || gap < best.gap) best = { gap, speed: rear.vehicle.speed, kind: 'car', vehicle: rear.vehicle };
      }
      if (best) return best;
      travelled += this.laneLength[route[i]];
    }
    return null;
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
      const enters = this.graph.lanes[lane].piece !== this.graph.lanes[v.route[i - 1]].piece;
      if (enters && this.junctionSpan(v.route, i).some((j) => this.conflicts.get(v.route[j])!.length)) return { index: i, lane, distance };
      distance += this.laneLength[lane];
    }
    return null;
  }

  /** Route indices of the lanes inside the junction piece entered at `index`. */
  private junctionSpan(route: number[], index: number) {
    const piece = this.graph.lanes[route[index]].piece;
    const span: number[] = [];
    for (let i = index; i < route.length && this.graph.lanes[route[i]].piece === piece; i++) span.push(i);
    return span;
  }

  /**
   * At a junction: come to a full stop at a stop sign, wait for a safe gap in traffic
   * that has priority, and don't enter when the exit has no room. Once a driver is
   * too close to stop comfortably and has decided to go, they're committed.
   */
  private junctionAhead(v: VehicleState): Obstacle | null {
    const junction = this.nextJunction(v);
    if (!junction) {
      v.committedJunction = null;
      return null;
    }
    if (v.committedJunction === junction.lane) return null;
    const control = this.controlOnLane.get(junction.lane);
    const atLine = (kind: Obstacle['kind']): Obstacle => ({ gap: junction.distance - STOP_LINE_MARGIN + v.driver.minGap, speed: 0, kind });

    if (control?.type === 'stop' && v.stoppedAt !== junction.lane && this.decide(v, `stop:${junction.lane}`) && this.safeToEnter(v, junction)) {
      // Rolling through: the junction looks clear, so slow right down but don't stop.
      v.speedCap = Math.sqrt(ROLLING_SPEED ** 2 + 2 * v.driver.comfortBraking * Math.max(0, junction.distance - STOP_LINE_MARGIN));
    } else if (control?.type === 'stop' && v.stoppedAt !== junction.lane) {
      if (junction.distance < STOP_LINE_MARGIN + 2.5 && v.speed < STOPPED) {
        v.stoppedAt = junction.lane;
        v.stoppedSince = this.time;
      } else return atLine('stop');
    }
    if (!this.safeToEnter(v, junction)) return atLine('gap');
    if (this.exitFull(v, junction.index)) return atLine('exit');
    const stoppingDistance = (v.speed * v.speed) / (2 * v.driver.comfortBraking);
    if (junction.distance <= stoppingDistance + 1) v.committedJunction = junction.lane;
    return null;
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
   * Courtesy: a driver approaching a junction where someone is waiting to pull out across
   * or into their path may decide (once per waiting driver) to slow right down and let them out.
   */
  private letWaitingDriversOut(all: VehicleState[]) {
    const waiting = all.filter((w) => w.reason === 'Waiting for a gap' && w.speed < HELD_UP);
    if (!waiting.length) return;
    for (const v of all) {
      if (v.driver.courtesy <= 0) continue;
      for (const w of waiting) {
        if (w === v) continue;
        const junction = this.nextJunction(w);
        if (!junction) continue;
        const crossesMyPath = this.junctionSpan(w.route, junction.index).some((i) =>
          this.conflicts.get(w.route[i])!.some((c) => {
            const d = this.distanceToPoint(v, c.lane, c.otherAt * METRES_PER_TILE);
            return d !== null && d > 0 && d < COURTESY_RANGE;
          }),
        );
        if (!crossesMyPath) continue;
        const key = `courtesy:${w.id}`;
        if (!v.decisions.has(key)) v.decisions.set(key, v.random.next() < v.driver.courtesy);
        if (v.decisions.get(key)) v.speedCap = Math.min(v.speedCap, COURTESY_SPEED);
      }
    }
  }

  /** Whether this driver must give way to traffic on `other` when entering through `mine`. */
  private mustYield(mine: number, entryLane: number, other: number): boolean {
    const myControl = this.controlOnLane.get(entryLane);
    const otherEntry = this.entryLaneOf(other);
    const otherControl = otherEntry === null ? undefined : this.controlOnLane.get(otherEntry);
    const minor = (c?: ApproachControl) => c?.type === 'stop' || c?.type === 'yield';
    // Minor approaches give way to everyone; between two minor approaches, first come first served (see safeToEnter).
    if (minor(myControl)) return true;
    if (minor(otherControl)) return false;
    if (myControl?.type === 'signal' && otherControl?.type === 'signal') {
      // Permissive turns on green: turning across oncoming traffic gives way to it.
      return (this.turns[mine] === 'left' || this.turns[mine] === 'u-turn') && (this.turns[other] === 'straight' || this.turns[other] === 'right');
    }
    if (myControl?.type === 'signal' || otherControl?.type === 'signal') return false;
    // Uncontrolled: give way to traffic from the right; a left turn gives way to oncoming traffic.
    const [h1, h2] = [this.entryHeading(mine), this.entryHeading(other)];
    const cross = h1[0] * h2[1] - h1[1] * h2[0];
    if (cross < -0.5) return true;
    if (cross > 0.5) return false;
    return this.turns[mine] === 'left' || this.turns[mine] === 'u-turn';
  }

  /** The lane through which traffic on `lane` entered its piece (itself if it starts at an approach). */
  private entryLaneOf(lane: number): number | null {
    let current = lane;
    for (let guard = 0; guard < 8; guard++) {
      const previous = this.graph.lanes[current].previous.find((p) => this.graph.lanes[p].piece === this.graph.lanes[lane].piece);
      if (previous === undefined) return current;
      current = previous;
    }
    return null;
  }

  private entryHeading(lane: number): [number, number] {
    const [a, b] = this.graph.lanes[lane].points;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / length, (b[2] - a[2]) / length];
  }

  /**
   * Whether every conflicting vehicle this driver must give way to is far enough away:
   * its time to the conflict point must exceed the time this driver needs to clear it
   * plus the gap this driver accepts.
   */
  private safeToEnter(v: VehicleState, junction: { index: number; lane: number; distance: number }): boolean {
    const span = this.junctionSpan(v.route, junction.index);
    let offset = junction.distance;
    const effort = v.type.maxAcceleration * v.driver.acceleration;
    for (const i of span) {
      const mine = v.route[i];
      for (const conflict of this.conflicts.get(mine)!) {
        if (!this.mustYield(mine, junction.lane, conflict.lane)) continue;
        const clearDistance = offset + conflict.at * METRES_PER_TILE + v.type.length;
        const myTime = timeToCover(clearDistance, v.speed, effort);
        for (const other of this.vehicles.values()) {
          if (other === v) continue;
          const toConflict = this.distanceToPoint(other, conflict.lane, conflict.otherAt * METRES_PER_TILE);
          if (toConflict === null) continue;
          if (toConflict < 0) {
            if (toConflict + other.type.length > 0) return false; // in the conflict area now
            continue;
          }
          if (toConflict > LOOKAHEAD) continue;
          // A vehicle stopped at its own line further back isn't coming yet, unless it got
          // there first at a stop sign (first come, first served).
          if (other.speed < STOPPED && toConflict > 3) {
            const arrivedFirst = other.stoppedAt !== null && other.stoppedSince < v.stoppedSince && other.committedJunction === null;
            if (!arrivedFirst || other.stoppedAt !== this.entryLaneOf(conflict.lane)) continue;
            return false;
          }
          if (toConflict / Math.max(other.speed, 0.5) < myTime + this.acceptedGapOf(v)) return false;
        }
      }
      offset += this.laneLength[mine];
    }
    return true;
  }

  /** Distance from a vehicle's front to a point `at` metres along `lane`, if `lane` is ahead on its route. */
  private distanceToPoint(v: VehicleState, lane: number, at: number): number | null {
    let distance = -v.position;
    for (let i = v.routeIndex; i < v.route.length; i++) {
      if (v.route[i] === lane) return distance + at;
      distance += this.laneLength[v.route[i]];
      if (distance > LOOKAHEAD) return null;
    }
    return null;
  }

  /** Whether the lane after the junction has no room for this vehicle behind slow traffic. */
  private exitFull(v: VehicleState, index: number): boolean {
    const span = this.junctionSpan(v.route, index);
    const exitIndex = span[span.length - 1] + 1;
    if (exitIndex >= v.route.length) return false;
    const ahead = this.leaderAhead(v.route, exitIndex, 0, v);
    return ahead !== null && ahead.speed < 3 && ahead.gap < v.type.length + v.driver.minGap;
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
    if (aspect === 'amber' && !canStop) {
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

  /** Shortest route by lane count from a gateway's entry lanes to another gateway's exit lanes, or null. */
  private findRoute(fromLabel: string, toLabel: string): number[] | null {
    const from = this.graph.gateways.find((g) => g.label === fromLabel);
    const to = this.graph.gateways.find((g) => g.label === toLabel);
    if (!from || !to) throw new Error(`Unknown gateway ${!from ? fromLabel : toLabel}`);
    const targets = new Set(to.exitLanes);
    const cameFrom = new Map<number, number>();
    const queue = [...from.entryLanes];
    for (const lane of queue) cameFrom.set(lane, -1);
    while (queue.length) {
      const lane = queue.shift()!;
      if (targets.has(lane)) {
        const path = [lane];
        while (cameFrom.get(path[0])! >= 0) path.unshift(cameFrom.get(path[0])!);
        return path;
      }
      for (const next of this.graph.lanes[lane].next) {
        if (!cameFrom.has(next)) {
          cameFrom.set(next, lane);
          queue.push(next);
        }
      }
    }
    return null;
  }
}

/** Why the vehicle is doing what it's doing, in the words shown on hover. */
const OBSTACLE_REASONS: Record<Exclude<Obstacle['kind'], 'car'>, Reason> = {
  red: 'Red light',
  amber: 'Amber light',
  stop: 'Stop sign',
  gap: 'Waiting for a gap',
  exit: 'Exit lane full',
};

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
