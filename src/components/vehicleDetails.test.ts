import { describe, expect, it } from 'vitest';
import { mainStreet } from '../scenes/mainStreet';
import { simulateScene, STEP } from '../scenes/sceneTesting';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { pointAlongLane } from '../simulation/network/laneGeometry';
import { METRES_PER_TILE } from '../simulation/traffic/trafficSimulation';
import { modelFor, VEHICLE_TYPES } from '../simulation/traffic/vehicleTypes';
import { describeVehicle } from './vehicleDetails';

/** Main Street after 20 s of Medium traffic, and one vehicle on it. */
function scenario() {
  const simulation = simulateScene(mainStreet, 'medium', 3);
  for (let i = 0; i < 20 / STEP; i++) simulation.step(STEP);
  const graph = buildLaneGraph(mainStreet.pieces);
  const vehicle = simulation.allVehicles()[0];
  return { simulation, graph, vehicle };
}
const rowsOf = (details: ReturnType<typeof describeVehicle>, heading: string) => Object.fromEntries(details.sections.find((s) => s.heading === heading)!.rows);

describe('a vehicle’s details card', () => {
  it('names the vehicle and lists every parameter set for it: its type’s and its driver’s', () => {
    const { simulation, graph, vehicle } = scenario();
    const details = describeVehicle(simulation.vehicle(vehicle.id), graph, mainStreet);
    expect(details.title).toBe(`${vehicle.type.label} · ${vehicle.driver.label} driver`);
    expect(rowsOf(details, 'Vehicle')).toEqual({
      Length: `${vehicle.type.length.toFixed(1)} m`,
      'Top speed': `${Math.round(vehicle.type.maxSpeed * 3.6)} km/h`,
      'Strongest acceleration': `${vehicle.type.maxAcceleration.toFixed(1)} m/s²`,
      'Hardest braking': `${vehicle.type.maxBraking.toFixed(1)} m/s²`,
    });
    expect(Object.keys(rowsOf(details, 'Driver'))).toEqual([
      'Profile',
      'Speed against the limit',
      'Following time',
      'Smallest gap',
      'Acceleration used',
      'Comfortable braking',
      'Gap accepted at junctions',
      'Obeys signs and signals',
      'Patience',
      'Lets others out',
      'Watches for queues',
    ]);
    expect(rowsOf(details, 'Driver')['Following time']).toBe(`${vehicle.driver.headway.toFixed(1)} s`);
  });

  it('says where the vehicle is now and what it is doing', () => {
    const { simulation, graph, vehicle } = scenario();
    const v = simulation.vehicle(vehicle.id);
    const details = describeVehicle(v, graph, mainStreet);
    const now = rowsOf(details, 'Now');
    const { point } = pointAlongLane(graph.lanes[v.route[v.routeIndex]], v.position / METRES_PER_TILE);
    expect(now.Position).toBe(`tile ${point[0].toFixed(1)}, ${point[2].toFixed(1)}`);
    expect(now.Speed).toBe(`${Math.round(v.speed * 3.6)} km/h`);
    expect(now.Doing).toBe(v.reason);
    expect(['north', 'south', 'east', 'west'].some((d) => now.Heading.includes(d))).toBe(true); // e.g. 'south-west'
  });

  it('traces the rest of its trip: the exit it’s heading for, how far, and the path to draw on the map', () => {
    const { simulation, graph, vehicle } = scenario();
    const v = simulation.vehicle(vehicle.id);
    const details = describeVehicle(v, graph, mainStreet);
    const trip = rowsOf(details, 'Trajectory');
    expect(trip['Heading for']).toBe(`exit ${v.destination}`);
    const remaining = v.route.slice(v.routeIndex).reduce((sum, lane) => sum + graph.lanes[lane].length * METRES_PER_TILE, 0) - v.position;
    expect(trip['Distance left']).toBe(`${Math.round(remaining)} m`);
    // The path starts at the vehicle and ends at its exit.
    const start = pointAlongLane(graph.lanes[v.route[v.routeIndex]], v.position / METRES_PER_TILE).point;
    expect(details.path[0]).toEqual(start);
    const exit = graph.gateways.find((g) => g.label === v.destination)!;
    const end = details.path.at(-1)!;
    expect(Math.hypot(end[0] - exit.at[0], end[2] - exit.at[1])).toBeLessThan(0.6);
  });

  it('leads with a few highlights: how the driver drives, the speed, what it’s doing and where it’s going', () => {
    const { simulation, graph, vehicle } = scenario();
    const v = simulation.vehicle(vehicle.id);
    const details = describeVehicle(v, graph, mainStreet);
    expect(details.highlights.map(([label]) => label)).toEqual(['Driver', 'Habits', 'Speed', 'Doing', 'Heading for']);
    const highlights = Object.fromEntries(details.highlights);
    // The driver's profile, and the habits that show most on the road: following gap and obeying signs.
    expect(highlights.Driver).toBe(v.driver.label);
    expect(highlights.Habits).toMatch(/^\d+\.\d s gap · obeys \d{1,3}%$/);
    expect(highlights.Speed).toMatch(/^\d+ km\/h \(wants \d+\)$/);
    expect(highlights.Doing).toBe(rowsOf(details, 'Now').Doing);
    // The same destination and distance as the full trajectory section.
    const trip = rowsOf(details, 'Trajectory');
    expect(highlights['Heading for']).toBe(`${trip['Heading for']} · ${trip['Distance left']}`);
  });

  it('names the model the map draws for the vehicle, so the card can show its picture', () => {
    const { simulation, graph, vehicle } = scenario();
    const v = simulation.vehicle(vehicle.id);
    const details = describeVehicle(v, graph, mainStreet);
    expect(v.type.models).toContain(details.model);
    expect(details.model).toBe(modelFor(v));
  });

  it('spreads a type’s vehicles across all of its models', () => {
    const sedan = VEHICLE_TYPES.sedan;
    const drawn = new Set(Array.from({ length: 12 }, (_, id) => modelFor({ id, type: sedan })));
    expect(drawn).toEqual(new Set(sedan.models));
  });

  it('places the vehicle’s centre (where the map draws it and the route ring sits) half its length behind its front', () => {
    const { simulation, graph } = scenario();
    // A vehicle well into a straight lane, so front and centre are on the same line.
    const v = simulation.allVehicles().map((x) => simulation.vehicle(x.id)).find((x) => x.position > x.type.length * 2)!;
    const details = describeVehicle(v, graph, mainStreet);
    const [front, centre] = [details.path[0], details.centre];
    const gap = Math.hypot(front[0] - centre[0], front[2] - centre[2]);
    expect(gap).toBeCloseTo(v.type.length / 2 / METRES_PER_TILE, 3);
  });
});
