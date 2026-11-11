import { Box3, Group, type Mesh, type Object3D, Vector3 } from 'three';
import { boardToWorld, TILE_SIZE } from '../../scenes/board';
import type { LaneGraph } from '../../simulation/network/buildLaneGraph';
import { pointAlongLane } from '../../simulation/network/laneGeometry';
import { METRES_PER_TILE, type TrafficSimulation, type VehicleState } from '../../simulation/traffic/trafficSimulation';
import { VEHICLE_TYPES } from '../../simulation/traffic/vehicleTypes';

/** Road surface height above a piece's base, in tiles (matches the scene view). */
const ROAD_SURFACE = 0.02;
/** Widest a vehicle may be drawn, as a share of a 3.5 m lane: Kenney models are chunky. */
const MAX_WIDTH_OF_LANE = 0.75;
const LANE_WIDTH_WORLD = 0.4 * TILE_SIZE;

/** Every Car Kit model used by a vehicle type, by name. */
export const VEHICLE_MODEL_NAMES = [...new Set(Object.values(VEHICLE_TYPES).flatMap((t) => t.models))];

/**
 * Draws the simulation's vehicles: one Car Kit model per vehicle, chosen from its
 * type and scaled to the type's real length, placed along its lane each frame.
 */
export function createTrafficLayer(graph: LaneGraph, models: Map<string, Object3D>) {
  const group = new Group();
  group.name = 'traffic';
  const drawn = new Map<number, Object3D>();
  const modelSize = new Map([...models].map(([name, model]) => [name, new Box3().setFromObject(model).getSize(new Vector3())]));

  function create(v: VehicleState) {
    const name = v.type.models[v.id % v.type.models.length];
    const object = models.get(name)!.clone();
    // Real length; width (and height with it) capped so wide models stay inside their lane.
    const size = modelSize.get(name)!;
    const lengthScale = ((v.type.length / METRES_PER_TILE) * TILE_SIZE) / size.z;
    const widthScale = Math.min(lengthScale, (MAX_WIDTH_OF_LANE * LANE_WIDTH_WORLD) / size.x);
    // Height halfway between the two, so narrowed models don't look flattened.
    object.scale.set(widthScale, (widthScale + lengthScale) / 2, lengthScale);
    object.userData.vehicleId = v.id;
    object.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.userData.vehicleId = v.id;
      }
    });
    group.add(object);
    drawn.set(v.id, object);
    return object;
  }

  /** The vehicle's centre: half its length behind the front bumper, on the previous lane if need be. */
  function centre(v: VehicleState) {
    let laneIndex = v.routeIndex;
    let distance = (v.position - v.type.length / 2) / METRES_PER_TILE;
    while (distance < 0 && laneIndex > 0) {
      laneIndex--;
      distance += graph.lanes[v.route[laneIndex]].length;
    }
    return pointAlongLane(graph.lanes[v.route[laneIndex]], distance);
  }

  let shown: TrafficSimulation | null = null;

  function sync(simulation: TrafficSimulation) {
    // A rebuilt simulation (Restart, new intensity) reuses vehicle ids: start drawing afresh.
    if (simulation !== shown) {
      for (const object of drawn.values()) group.remove(object);
      drawn.clear();
      shown = simulation;
    }
    const present = new Set<number>();
    for (const v of simulation.allVehicles()) {
      present.add(v.id);
      const object = drawn.get(v.id) ?? create(v);
      const { point, heading } = centre(v);
      object.position.set(...boardToWorld([point[0], point[1] + ROAD_SURFACE, point[2]]));
      object.rotation.y = Math.atan2(heading[0], heading[1]); // models face +z
    }
    for (const [id, object] of drawn) {
      if (!present.has(id)) {
        group.remove(object);
        drawn.delete(id);
      }
    }
  }

  return { group, sync };
}
