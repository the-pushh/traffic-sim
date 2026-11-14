import type { LabelledResults } from '../simulation/traffic/trafficSession';

/** How a number moved since the previous run. */
export interface Change {
  /** Now minus before, in whole units (travel time is rounded only after subtracting). */
  amount: number;
  verdict: 'better' | 'worse' | 'same';
  /** Printed after the amount: ' s' for times. */
  unit: string;
  /** What the previous run showed, for the tooltip: "25 s", "5 at Junction 1 · westbound". */
  was: string;
}

/** One big number on the results card. */
export interface Headline {
  label: string;
  value: string;
  /** Small print under the number: what it's out of, or where. */
  detail: string;
  /** Against a comparable previous run (same scene, load and duration); null when there isn't one. */
  change: Change | null;
}

type Queue = LabelledResults['peakQueues'][number];
type Measure = { value: (r: LabelledResults) => number | null; higherIsBetter: boolean; unit: string; was: (r: LabelledResults) => string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const longestQueue = (r: LabelledResults) => r.peakQueues.reduce<Queue | null>((best, q) => (!best || q.peak > best.peak ? q : best), null);
const seconds = (time: number | null) => (time === null ? '—' : `${Math.round(time)} s`);

/** Runs worth comparing: the same scene at the same load for the same time, so only the player's edits differ. */
export const comparable = (a: LabelledResults, b: LabelledResults) => a.scene === b.scene && a.intensity === b.intensity && a.duration === b.duration;

const MEASURES: Measure[] = [
  { value: (r) => r.finished, higherIsBetter: true, unit: '', was: (r) => String(r.finished) },
  { value: (r) => r.averageTravelTime, higherIsBetter: false, unit: ' s', was: (r) => seconds(r.averageTravelTime) },
  { value: (r) => longestQueue(r)?.peak ?? null, higherIsBetter: false, unit: '', was: (r) => (longestQueue(r) ? `${longestQueue(r)!.peak} at ${longestQueue(r)!.approach}` : '—') },
  { value: (r) => r.blocked, higherIsBetter: false, unit: '', was: (r) => String(r.blocked) },
];

function compare(measure: Measure, latest: LabelledResults, before: LabelledResults): Change | null {
  const [now, then] = [measure.value(latest), measure.value(before)];
  if (now === null || then === null) return null;
  const amount = Math.round(now - then);
  const verdict = amount === 0 ? 'same' : amount > 0 === measure.higherIsBetter ? 'better' : 'worse';
  return { amount, verdict, unit: measure.unit, was: measure.was(before) };
}

/**
 * The run in four numbers: trips finished, average travel time, longest queue (and where),
 * blocked trips; each against the previous run when that one is comparable.
 */
export function resultsHeadlines(latest: LabelledResults, previous: LabelledResults | null): Headline[] {
  const before = previous && comparable(latest, previous) ? previous : null;
  const longest = longestQueue(latest);
  const values = [
    { label: 'Trips finished', value: String(latest.finished), detail: `of ${latest.due} due` },
    {
      label: 'Average travel time',
      value: seconds(latest.averageTravelTime),
      detail: latest.averageTravelTime === null ? 'no trip finished' : `over ${plural(latest.travelTimeSamples, 'trip')}`,
    },
    { label: 'Longest queue', value: longest ? String(longest.peak) : '—', detail: longest?.approach ?? 'no junctions' },
    { label: 'Blocked trips', value: String(latest.blocked), detail: `of ${latest.due} due` },
  ];
  return values.map((v, i) => ({ ...v, change: before ? compare(MEASURES[i], latest, before) : null }));
}
