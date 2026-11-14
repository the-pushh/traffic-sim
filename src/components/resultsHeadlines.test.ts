import { describe, expect, it } from 'vitest';
import type { LabelledResults } from '../simulation/traffic/trafficSession';
import { resultsHeadlines } from './resultsHeadlines';

const run = (over: Partial<LabelledResults> = {}): LabelledResults => ({
  scene: 'Main Street',
  intensity: 'medium',
  duration: 30,
  due: 12,
  entered: 11,
  finished: 6,
  blocked: 1,
  averageTravelTime: 21.4,
  travelTimeSamples: 6,
  peakQueues: [
    { approach: 'Junction 1 · westbound', peak: 3 },
    { approach: 'Junction 2 · southbound', peak: 7 },
    { approach: 'Junction 3 · eastbound', peak: 2 },
  ],
  ...over,
});

describe('results headlines', () => {
  it('sums a run up in four numbers: trips finished, average travel time, longest queue and where, blocked trips', () => {
    const headlines = resultsHeadlines(run(), null);
    expect(headlines.map((h) => [h.label, h.value, h.detail])).toEqual([
      ['Trips finished', '6', 'of 12 due'],
      ['Average travel time', '21 s', 'over 6 trips'],
      ['Longest queue', '7', 'Junction 2 · southbound'],
      ['Blocked trips', '1', 'of 12 due'],
    ]);
    expect(headlines.every((h) => h.change === null)).toBe(true);
  });

  it('shows each number against the previous run of the same scene, and whether it got better or worse', () => {
    const before = run({ finished: 4, averageTravelTime: 25.2, blocked: 1, peakQueues: [{ approach: 'Junction 1 · westbound', peak: 5 }] });
    const changes = resultsHeadlines(run(), before).map((h) => h.change);
    expect(changes).toEqual([
      { amount: 2, verdict: 'better', unit: '', was: '4' }, // 6 finished, was 4
      { amount: -4, verdict: 'better', unit: ' s', was: '25 s' }, // 21 s, was 25 s
      { amount: 2, verdict: 'worse', unit: '', was: '5 at Junction 1 · westbound' }, // longest 7, was 5
      { amount: 0, verdict: 'same', unit: '', was: '1' }, // blocked 1, was 1
    ]);
  });

  it('compares only runs of the same scene, load and duration, so the arrows mean something', () => {
    for (const other of [run({ scene: 'School Run' }), run({ intensity: 'high' }), run({ duration: 90 })]) {
      expect(resultsHeadlines(run(), other).every((h) => h.change === null)).toBe(true);
    }
  });

  it('measures the travel time change unrounded, in seconds, and says where the longest queue was before', () => {
    const before = run({ averageTravelTime: 21.2, peakQueues: [{ approach: 'Junction 1 · westbound', peak: 5 }] });
    const [, time, queue] = resultsHeadlines(run({ averageTravelTime: 21.6 }), before);
    expect(time.change).toEqual({ amount: 0, verdict: 'same', unit: ' s', was: '21 s' }); // 0.4 s apart: no change worth an arrow
    expect(queue.change).toMatchObject({ amount: 2, verdict: 'worse', was: '5 at Junction 1 · westbound' });
  });

  it('compares nothing when the previous run had no finished trips to time', () => {
    const untimed = resultsHeadlines(run(), run({ averageTravelTime: null, travelTimeSamples: 0 }));
    expect(untimed[1].change).toBeNull();
    expect(untimed[0].change).toMatchObject({ amount: 0, verdict: 'same' });
  });
});
