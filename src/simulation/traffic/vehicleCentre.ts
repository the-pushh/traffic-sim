import type { LaneGraph } from '../network/buildLaneGraph';
import { pointAlongLane } from '../network/laneGeometry';
import { METRES_PER_TILE, type VehicleState } from './trafficSimulation';

/**
 * A vehicle's centre: half its length behind the front bumper (its `position`), on the
 * previous lane if need be. Where the map draws it, and where its route ring sits.
 */
export function vehicleCentre(v: Pick<VehicleState, 'route' | 'routeIndex' | 'position' | 'type'>, graph: LaneGraph) {
  let laneIndex = v.routeIndex;
  let distance = (v.position - v.type.length / 2) / METRES_PER_TILE;
  while (distance < 0 && laneIndex > 0) {
    laneIndex--;
    distance += graph.lanes[v.route[laneIndex]].length;
  }
  return pointAlongLane(graph.lanes[v.route[laneIndex]], distance);
}
