/**
 * What each vehicle can physically do, separate from how its driver wants to drive.
 * Lengths and limits are typical real-world values in metres and seconds; Car Kit
 * models are scaled to these lengths when drawn (see `assets/3d/ASSETS.md`).
 */
export interface VehicleType {
  id: string;
  label: string;
  /** Bumper to bumper, metres. */
  length: number;
  /** Strongest acceleration from a standstill, m/s². */
  maxAcceleration: number;
  /** Hardest braking the vehicle can manage, m/s². */
  maxBraking: number;
  /** Top speed, m/s. */
  maxSpeed: number;
  /** Car Kit models drawn for this type. */
  models: string[];
}

export const VEHICLE_TYPES = {
  compact: { id: 'compact', label: 'Compact car', length: 4.0, maxAcceleration: 3.0, maxBraking: 8, maxSpeed: 45, models: ['hatchback-sports', 'sedan-sports'] },
  sedan: { id: 'sedan', label: 'Sedan', length: 4.7, maxAcceleration: 2.6, maxBraking: 8, maxSpeed: 45, models: ['sedan', 'taxi', 'police'] },
  suv: { id: 'suv', label: 'SUV', length: 4.9, maxAcceleration: 2.3, maxBraking: 7.5, maxSpeed: 42, models: ['suv', 'suv-luxury'] },
  pickup: { id: 'pickup', label: 'Pickup', length: 5.4, maxAcceleration: 2.2, maxBraking: 7.5, maxSpeed: 40, models: ['truck', 'truck-flat'] },
  van: { id: 'van', label: 'Van', length: 5.2, maxAcceleration: 1.9, maxBraking: 7, maxSpeed: 38, models: ['van', 'ambulance'] },
  boxTruck: { id: 'boxTruck', label: 'Box truck', length: 7.5, maxAcceleration: 1.3, maxBraking: 6, maxSpeed: 30, models: ['delivery', 'delivery-flat'] },
  heavyTruck: { id: 'heavyTruck', label: 'Heavy truck', length: 10, maxAcceleration: 0.9, maxBraking: 5.5, maxSpeed: 25, models: ['garbage-truck', 'firetruck'] },
  tractor: { id: 'tractor', label: 'Tractor', length: 4.2, maxAcceleration: 1.0, maxBraking: 5, maxSpeed: 8.3, models: ['tractor', 'tractor-police', 'tractor-shovel'] },
} satisfies Record<string, VehicleType>;

export type VehicleTypeId = keyof typeof VEHICLE_TYPES;

/** The Car Kit model drawn for a vehicle: its type's models taken in turn by id, so the map and its card agree. */
export function modelFor(v: { id: number; type: { models: readonly string[] } }): string {
  return v.type.models[v.id % v.type.models.length];
}
