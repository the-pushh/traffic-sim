import type { LabelledResults } from '../simulation/traffic/trafficSession';

/** How a number moved since the previous run: `better` is null when it didn't move. */
export interface Change {
  amount: number;
  better: boolean | null;
}

/** One big number on the results card. */
export interface Headline {
  label: string;
  value: string;
  /** Small print under the number: what it's out of, or where. */
  detail: string;
  /** Against the previous run of the same scene; null when there's nothing to compare with. */
  change: Change | null;
}

type Queue = LabelledResults['peakQueues'][number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const longestQueue = (r: LabelledResults) => r.peakQueues.reduce<Queue | null>((best, q) => (!best || q.peak > best.peak ? q : best), null);
const roundedTime = (r: LabelledResults) => (r.averageTravelTime === null ? null : Math.round(r.averageTravelTime));

/** The change from `before` to `now`, where a higher number is better or worse as given. */
function compare(now: number | null, before: number | null, higherIsBetter: boolean): Change | null {
  if (now === null || before === null) return null;
  const amount = now - before;
  return { amount, better: amount === 0 ? null : amount > 0 === higherIsBetter };
}

/**
 * The run in four numbers: trips finished, average travel time, longest queue (and where),
 * blocked trips; each against the previous run when that was the same scene.
 */
export function resultsHeadlines(latest: LabelledResults, previous: LabelledResults | null): Headline[] {
  const before = previous?.scene === latest.scene ? previous : null;
  const versus = (value: (r: LabelledResults) => number | null, higherIsBetter: boolean) => (before ? compare(value(latest), value(before), higherIsBetter) : null);
  const longest = longestQueue(latest);
  const time = roundedTime(latest);
  return [
    { label: 'Trips finished', value: String(latest.finished), detail: `of ${latest.due} due`, change: versus((r) => r.finished, true) },
    {
      label: 'Average travel time',
      value: time === null ? '—' : `${time} s`,
      detail: time === null ? 'no trip finished' : `over ${plural(latest.travelTimeSamples, 'trip')}`,
      change: versus(roundedTime, false),
    },
    { label: 'Longest queue', value: longest ? String(longest.peak) : '—', detail: longest?.approach ?? 'no junctions', change: versus((r) => longestQueue(r)?.peak ?? null, false) },
    { label: 'Blocked trips', value: String(latest.blocked), detail: `of ${latest.due} due`, change: versus((r) => r.blocked, false) },
  ];
}
