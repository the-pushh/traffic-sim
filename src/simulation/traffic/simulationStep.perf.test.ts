// Simulation step time per preset (P7). Skipped in `npm test`; run with `npm run perf:sim`.
// Each case runs 60 s of traffic first, then times seconds of simulation (30 steps each),
// the work the app does per second of a run, and prints the median.
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../scenes/presets';
import { simulateScene, STEP } from '../../scenes/sceneTesting';

const WARM_UP_SECONDS = 60;
const TIMED_SECONDS = 40;
const STEPS_PER_SECOND = Math.round(1 / STEP);

describe.skipIf(!process.env.PERF)('simulation step time', () => {
  it('times one second of traffic per preset at Medium and Congested', () => {
    const rows: string[] = [];
    for (const scene of PRESETS.filter((p) => p.id !== 'blank-board')) {
      for (const intensity of ['medium', 'congested'] as const) {
        const simulation = simulateScene(scene, intensity, 7);
        for (let i = 0; i < WARM_UP_SECONDS * STEPS_PER_SECOND; i++) simulation.step(STEP);
        const seconds: number[] = [];
        for (let s = 0; s < TIMED_SECONDS; s++) {
          const start = performance.now();
          for (let i = 0; i < STEPS_PER_SECOND; i++) simulation.step(STEP);
          seconds.push(performance.now() - start);
        }
        seconds.sort((a, b) => a - b);
        const median = seconds[Math.floor(seconds.length / 2)];
        const worst = seconds[seconds.length - 1];
        rows.push(`${scene.name} · ${intensity}: ${median.toFixed(2)} ms per simulated second (worst ${worst.toFixed(2)}), ${simulation.allVehicles().length} vehicles`);
        expect(median).toBeGreaterThan(0);
      }
    }
    console.log(rows.join('\n'));
  });
});
