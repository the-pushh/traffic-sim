import { describe, expect, it } from 'vitest';
import { buildLaneGraph } from '../simulation/network/buildLaneGraph';
import { BOARD_TILES, laneSpeedLimits, validateScene } from '../simulation/network/scene';
import { runScene, simulateScene } from './sceneTesting';
import { schoolRun } from './schoolRun';

/** Scene runs simulate minutes of traffic: allow longer than Vitest's default. */
const SLOW_TEST = 60_000;
const graph = buildLaneGraph(schoolRun.pieces);
const at = (lane: number) => schoolRun.pieces[graph.lanes[lane].piece].at;
const SHORTCUT_ROW = 11.5;
const onMainRoad = (lane: number) => at(lane)[1] < 5;
const onShortcut = (lane: number) => at(lane)[1] === SHORTCUT_ROW;
/** The school's stretch of the shortcut: crossing, driveway and lay-by. */
const onSchoolFrontage = (lane: number) => onShortcut(lane) && at(lane)[0] >= 9.5 && at(lane)[0] <= 13.5;
const WEST_SHORTCUT = 'F';
const EAST_SHORTCUT = 'D';
const PEAK_WINDOW: [number, number] = [10, 70];
const withoutPeak = { ...schoolRun, demand: { ...schoolRun.demand, peaks: [] } };
const SCHOOL = 'P1';
const schoolExits = new Set(graph.accessPoints.find((a) => a.label === SCHOOL)!.entryLanes);
/** The link at the west end, up from the shortcut to the main road: taking it means going by the main road. */
const onWestLink = (lane: number) => at(lane)[0] === 1.5 && at(lane)[1] > 5 && at(lane)[1] < SHORTCUT_ROW;

describe('School Run preset', () => {
  it('is a valid scene that fits the board, with two routes, a school driveway and an open connection', () => {
    expect(validateScene(schoolRun)).toEqual([]);
    expect(graph.mismatches).toEqual([]);
    expect(graph.gateways.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(graph.accessPoints.map((a) => a.label)).toEqual(['P1']);
    expect(graph.openEnds).toEqual([{ at: [4.5, 12], level: 0, facing: [0, 1] }]);
    const used = new Set(schoolRun.pieces.map((p) => `${Math.floor(p.at[0])},${Math.floor(p.at[1])}`));
    expect(used.size / (BOARD_TILES * BOARD_TILES)).toBeLessThan(0.4);
  });

  it('has a signal on the main road, a stop-controlled junction on the shortcut, and a lower limit on the shortcut', () => {
    const controlAt = (type: string, z: number) => schoolRun.controls.filter((c) => c.type === type && schoolRun.pieces[c.piece].at[1] === z);
    expect(controlAt('signal', 3.5).length + controlAt('signal', 4.5).length).toBeGreaterThan(0);
    expect(controlAt('stop', SHORTCUT_ROW).length).toBe(3);
    const limits = laneSpeedLimits(schoolRun.pieces, graph);
    const shortcut = graph.lanes.filter((l) => onShortcut(l.id)).map((l) => limits[l.id]);
    const main = graph.lanes.filter((l) => onMainRoad(l.id)).map((l) => limits[l.id]);
    expect(Math.max(...shortcut)).toBeLessThan(Math.min(...main));
  });

  it('works as soon as it opens: traffic flows at Medium and nobody is stuck for long', () => {
    for (const seed of [1, 2, 3]) {
      const s = simulateScene(schoolRun, 'medium', seed);
      const longestStop = runScene(s, 180);
      const { due, entered, finished } = s.counts;
      expect(entered).toBeGreaterThan(due * 0.85);
      expect(finished).toBeGreaterThan(due * 0.5); // slow 30 km/h trips: many still under way when it ends
      expect(longestStop).toBeLessThan(120); // the drop-off peak queues at the all-way stop, but nothing locks up
    }
  }, SLOW_TEST);

  it('slows the shortcut past the school during the drop-off peak', () => {
    const meanSpeed = (scene: typeof schoolRun) => {
      let total = 0;
      let samples = 0;
      for (const seed of [1, 2, 3]) {
        const s = simulateScene(scene, 'medium', seed);
        runScene(s, PEAK_WINDOW[1], () => {
          if (s.time < PEAK_WINDOW[0]) return;
          // Through traffic only: parents turning in and out of the school are slow by design.
          for (const v of s.allVehicles())
            if (onSchoolFrontage(v.route[v.routeIndex]) && v.destination !== SCHOOL && !schoolExits.has(v.route[0])) {
              total += v.speed;
              samples++;
            }
        });
      }
      return total / samples;
    };
    expect(meanSpeed(schoolRun)).toBeLessThan(meanSpeed(withoutPeak) * 0.85);
  }, SLOW_TEST);

  it('sends more through drivers by the main road during the peak', () => {
    // Trips from the shortcut's west end to its east end: straight along the shortcut, or up the
    // west link, along the main road and back down.
    const viaMain = (scene: typeof schoolRun) => {
      let through = 0;
      let main = 0;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const s = simulateScene(scene, 'medium', seed);
        const seen = new Set<number>();
        runScene(s, PEAK_WINDOW[1], () => {
          if (s.time < PEAK_WINDOW[0]) return;
          for (const v of s.allVehicles()) {
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            const fromWestShortcut = graph.gateways.find((g) => g.label === WEST_SHORTCUT)!.entryLanes.includes(v.route[0]);
            if (!fromWestShortcut || v.destination !== EAST_SHORTCUT) continue;
            through++;
            if (v.route.some(onWestLink)) main++;
          }
        });
      }
      return { through, main };
    };
    const peak = viaMain(schoolRun);
    const quiet = viaMain(withoutPeak);
    expect(peak.through).toBeGreaterThan(5);
    expect(peak.main).toBeGreaterThan(0);
    expect(peak.main / peak.through).toBeGreaterThan(quiet.main / Math.max(quiet.through, 1));
  }, SLOW_TEST);
});
