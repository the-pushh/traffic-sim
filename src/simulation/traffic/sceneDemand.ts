import type { DemandPattern } from '../network/scene';
import type { Demand } from './trafficSimulation';

/**
 * A scene's demand pattern as the simulation runs it: `tripsPerMinute` for the chosen
 * intensity, and peaks moved from run time to simulation time (the run starts at `runStart`).
 */
export function sceneDemand(pattern: DemandPattern, tripsPerMinute: number, runStart: number): Demand {
  return {
    tripsPerMinute,
    entries: pattern.gateways,
    destinations: pattern.destinations,
    peaks: pattern.peaks?.map((p) => ({ from: runStart + p.from, to: runStart + p.to, tripsPerMinute: tripsPerMinute * p.rate, entries: p.entries, destinations: p.destinations })),
  };
}
