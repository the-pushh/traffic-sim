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
  reason: string;
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

interface PendingTrip {
  type: VehicleTypeId;
  profile: ProfileId;
  to: string;
  random: Random;
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
  reason: 'car' | 'signal';
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
  private readonly signals: SignalControl[];
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
  readonly travelTimes: number[] = [];
  private readonly enteredAt = new Map<number, number>();

  constructor(
    private readonly graph: LaneGraph,
    options: SimulationOptions,
  ) {
    this.random = new Random(options.seed);
    this.laneLength = graph.lanes.map((l) => l.length * METRES_PER_TILE);
    this.signals = options.signals ?? [];
    this.demand = options.demand;
    this.entries = Object.entries(options.demand?.entries ?? {})
      .filter(([, weight]) => weight > 0)
      .map(([label, weight], i) => {
        const arrivals = this.random.fork(1000 + i);
        const ratePerSecond = ((options.demand!.tripsPerMinute * weight) / 60) || 0;
        return { label, ratePerSecond, arrivals, nextArrival: ratePerSecond > 0 ? arrivals.exponential(ratePerSecond) : Infinity, waiting: [] };
      });
  }

  get counts(): TripCounts {
    const waiting = this.entries.reduce((n, e) => n + e.waiting.length, 0);
    return { due: this.due, entered: this.entered, finished: this.finished, waiting };
  }

  allVehicles(): VehicleState[] {
    return [...this.vehicles.values()];
  }

  /** Distance travelled along the route so far, front bumper, metres. */
  routeProgress(id: number): number {
    const v = this.vehicle(id);
    let distance = v.position;
    for (let i = 0; i < v.routeIndex; i++) distance += this.laneLength[v.route[i]];
    return distance;
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

  addVehicle({ type, profile, from, to, position, speed = 0 }: NewVehicle, random = this.random.fork(this.nextId)): number {
    const route = this.route(from, to);
    const driver = sampleDriver(profile, random);
    const vehicleType = VEHICLE_TYPES[type];
    const id = this.nextId++;
    const v: VehicleState = {
      id,
      type: vehicleType,
      driver,
      route,
      routeIndex: 0,
      position: position ?? vehicleType.length,
      speed,
      acceleration: 0,
      preferredSpeed: Math.min(vehicleType.maxSpeed, DEFAULT_SPEED_LIMIT * driver.speedFactor),
      reason: speed > 0 ? 'Cruising' : 'Pulling away',
    };
    this.advanceAlongRoute(v);
    this.vehicles.set(id, v);
    return id;
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
    this.arriveAndEnter();
    const all = [...this.vehicles.values()];
    // Decide every vehicle's acceleration from the same snapshot, then move them all.
    for (const v of all) {
      const car = this.nearestAhead(v, all);
      const signal = this.signalAhead(v);
      const [carAccel, signalAccel] = [this.idmAcceleration(v, car), signal ? this.idmAcceleration(v, signal) : Infinity];
      const binding = signalAccel < carAccel ? signal : car;
      v.acceleration = Math.min(carAccel, signalAccel);
      v.reason = describe(v, binding);
    }
    this.time += dt;
    for (const v of all) {
      v.speed = Math.max(0, v.speed + v.acceleration * dt);
      v.position += v.speed * dt;
      this.advanceAlongRoute(v);
      if (v.routeIndex === v.route.length - 1 && v.position >= this.laneLength[v.route[v.routeIndex]]) this.finish(v);
    }
  }

  private finish(v: VehicleState) {
    this.vehicles.delete(v.id);
    if (this.enteredAt.has(v.id)) {
      this.finished++;
      this.travelTimes.push(this.time - this.enteredAt.get(v.id)!);
      this.enteredAt.delete(v.id);
    }
  }

  /** New trips arrive at each entry on their seeded schedule; the first waiting trip enters when there's room. */
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
      if (trip && this.roomToEnter(entry.label, trip)) {
        entry.waiting.shift();
        const id = this.addVehicle({ type: trip.type, profile: trip.profile, from: entry.label, to: trip.to, speed: 0 }, trip.random);
        const v = this.vehicle(id);
        const ahead = this.nearestAhead(v, this.allVehicles());
        v.speed = Math.min(v.preferredSpeed, ahead && ahead.gap < 40 ? ahead.speed : v.preferredSpeed * 0.7);
        this.enteredAt.set(id, this.time);
        this.entered++;
      }
    }
  }

  /** Draw a trip's destination, vehicle and driver profile from its own seeded generator. */
  private newTrip(from: string): PendingTrip | null {
    const random = this.random.fork(100000 + this.tripCount++);
    const destinations =
      this.demand?.destinations ??
      Object.fromEntries(this.graph.gateways.filter((g) => g.label !== from).map((g) => [g.label, 1]));
    const reachable = Object.fromEntries(Object.entries(destinations).filter(([to, w]) => w > 0 && this.cachedRoute(from, to)));
    if (!Object.keys(reachable).length) return null;
    return {
      to: random.weighted(reachable),
      type: random.weighted({ ...DEFAULT_VEHICLE_MIX, ...this.demand?.vehicleMix } as Record<VehicleTypeId, number>),
      profile: random.weighted({ ...DEFAULT_PROFILE_MIX, ...this.demand?.profileMix } as Record<ProfileId, number>),
      random,
    };
  }

  /** Whether the entry lane has room for this vehicle plus a minimum gap behind whatever is ahead. */
  private roomToEnter(from: string, trip: PendingTrip): boolean {
    const route = this.cachedRoute(from, trip.to)!;
    const needed = VEHICLE_TYPES[trip.type].length + 3;
    for (const v of this.vehicles.values()) {
      const index = route.indexOf(v.route[v.routeIndex]);
      if (index < 0) continue;
      let front = v.position;
      for (let i = 0; i < index; i++) front += this.laneLength[route[i]];
      if (front - v.type.length < needed) return false;
    }
    return true;
  }

  private cachedRoute(from: string, to: string): number[] | null {
    const key = `${from}>${to}`;
    if (!this.routes.has(key)) {
      try {
        this.routes.set(key, this.route(from, to));
      } catch {
        this.routes.set(key, null);
      }
    }
    return this.routes.get(key)!;
  }

  private advanceAlongRoute(v: VehicleState) {
    while (v.position > this.laneLength[v.route[v.routeIndex]] && v.routeIndex < v.route.length - 1) {
      v.position -= this.laneLength[v.route[v.routeIndex]];
      v.routeIndex++;
    }
  }

  /** The next signal-controlled lane on the route ahead, and how far away its stop line is. */
  private nextStopLine(v: VehicleState): { signal: SignalControl; distance: number } | null {
    let distance = this.laneLength[v.route[v.routeIndex]] - v.position;
    for (let i = v.routeIndex + 1; i < v.route.length && distance <= LOOKAHEAD; i++) {
      const signal = this.signals.find((s) => s.lanes.has(v.route[i]));
      if (signal) return { signal, distance };
      distance += this.laneLength[v.route[i]];
    }
    return null;
  }

  /**
   * A red light, or an amber the driver can stop for comfortably, is a standing
   * obstacle just short of the stop line.
   */
  private signalAhead(v: VehicleState): Obstacle | null {
    const next = this.nextStopLine(v);
    if (!next) return null;
    const aspect = aspectAt(next.signal.timing, this.time);
    const canStop = next.distance > (v.speed * v.speed) / (2 * v.driver.comfortBraking);
    if (aspect === 'green' || (aspect === 'amber' && !canStop)) return null;
    // The model keeps the driver's minimum gap to an obstacle; drivers pull up to the line itself.
    return { gap: next.distance - STOP_LINE_MARGIN + v.driver.minGap, speed: 0, reason: 'signal' };
  }

  /** The closest vehicle ahead on this vehicle's route, within its lookahead. */
  private nearestAhead(v: VehicleState, all: VehicleState[]): Obstacle | null {
    let best: Obstacle | null = null;
    for (const other of all) {
      if (other === v) continue;
      const distance = this.distanceAlongRoute(v.id, other.id);
      if (distance > LOOKAHEAD) continue;
      const gap = distance - other.type.length;
      if (!best || gap < best.gap) best = { gap, speed: other.speed, reason: 'car' };
    }
    return best;
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

  /** Shortest route by lane count from a gateway's entry lanes to another gateway's exit lanes. */
  private route(fromLabel: string, toLabel: string): number[] {
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
    throw new Error(`No route from ${fromLabel} to ${toLabel}`);
  }
}

/** Why the vehicle is doing what it's doing, in the words shown on hover. */
function describe(v: VehicleState, ahead: Obstacle | null): string {
  if (ahead?.reason === 'signal' && (v.acceleration < 0 || v.speed < 0.3)) return 'Red light';
  const close = ahead !== null && ahead.gap < v.driver.minGap + FOLLOWING_RANGE * v.driver.headway * Math.max(v.speed, 1);
  if (close && v.speed < 0.3 && ahead.speed < 0.3) return 'Queued behind the car ahead';
  if (close && v.acceleration < -1) return 'Braking for the car ahead';
  if (close) return 'Following the car ahead';
  if (v.speed < v.preferredSpeed * 0.6 && v.acceleration > 0.1) return 'Pulling away';
  return 'Cruising';
}
