import type { Intensity } from '../runController';

/** Trips due per minute at each entry with demand weight 1, for each intensity tick. */
export const TRIPS_PER_MINUTE: Record<Intensity, number> = {
  'almost-empty': 2,
  low: 5,
  medium: 10,
  high: 16,
  congested: 24,
};
