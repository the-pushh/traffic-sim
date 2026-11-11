import type { LaneGraph } from '../network/buildLaneGraph';
import { type Driver, type ProfileId, sampleDriver } from './drivers';
import { Random } from './random';
import { aspectAt, type SignalControl } from './signals';
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

/** Why a vehicle is doing what it does, as shown on hover. */
export type Reason =
  | 'Red light'
  | 'Amber light'
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
  kind: 'car' | 'red' | 'amber';
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
  private readonly signalOnLane = new Map<number, SignalControl>();
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
    for (const signal of options.signals ?? []) for (const lane of signal.lanes) this.signalOnLane.set(lane, signal);
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
    for (const v of all) {
      const car = this.leaderAhead(v.route, v.routeIndex, v.position, v);
      leaders.set(v, car);
      const signal = this.signalAhead(v);
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
      preferredSpeed: Math.min(type.maxSpeed, DEFAULT_SPEED_LIMIT * driver.speedFactor),
      reason: speed > 0 ? 'Cruising' : 'Pulling away',
      committedThrough: null,
    };
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
      v.position -= this.laneLength[v.route[v.routeIndex]];
      v.routeIndex++;
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

  /** The next signal-controlled lane on the route ahead, and how far away its stop line is. */
  private nextStopLine(v: VehicleState): { signal: SignalControl; lane: number; distance: number } | null {
    let distance = this.laneLength[v.route[v.routeIndex]] - v.position;
    for (let i = v.routeIndex + 1; i < v.route.length && distance <= LOOKAHEAD; i++) {
      const signal = this.signalOnLane.get(v.route[i]);
      if (signal) return { signal, lane: v.route[i], distance };
      distance += this.laneLength[v.route[i]];
    }
    return null;
  }

  /**
   * A red light, or an amber the driver can stop for comfortably, is a standing
   * obstacle just short of the stop line. A driver who chose to go on amber is
   * committed and keeps going.
   */
  private signalAhead(v: VehicleState): Obstacle | null {
    const next = this.nextStopLine(v);
    if (!next) {
      v.committedThrough = null;
      return null;
    }
    if (v.committedThrough === next.lane) return null;
    const aspect = aspectAt(next.signal.timing, this.time);
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
    let accel = a * (1 - (v.speed / v.preferredSpeed) ** DELTA);
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
function describe(v: VehicleState, ahead: Obstacle | null): Reason {
  if (ahead && ahead.kind !== 'car' && (v.acceleration < 0 || v.speed < 0.3)) return ahead.kind === 'amber' ? 'Amber light' : 'Red light';
  const close = ahead !== null && ahead.gap < v.driver.minGap + FOLLOWING_RANGE * v.driver.headway * Math.max(v.speed, 1);
  if (close && v.speed < 0.3 && ahead.speed < 0.3) return 'Queued behind the car ahead';
  if (close && v.acceleration < -1) return 'Braking for the car ahead';
  if (close) return 'Following the car ahead';
  if (v.speed < v.preferredSpeed * 0.6 && v.acceleration > 0.1) return 'Pulling away';
  return 'Cruising';
}
