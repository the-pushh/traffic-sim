export type Stream = 'vehicles' | 'entries' | 'trips' | 'peak-trips' | 'decisions';
const STREAM_SALT: Record<Stream, number> = { vehicles: 0x1b873593, entries: 0x85ebca6b, trips: 0xc2b2ae35, decisions: 0x27d4eb2f, 'peak-trips': 0x165667b1 };

/** 32-bit integer hash (murmur3 finaliser): spreads nearby inputs far apart. */
function mix(x: number) {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Small seeded random-number generator (mulberry32): the same seed gives the same sequence. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A generator that carries on from exactly where this one is, independently of it. */
  copy(): Random {
    const copy = new Random(0);
    copy.state = this.state;
    return copy;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  between(min: number, max: number) {
    return min + (max - min) * this.next();
  }

  /** Exponentially distributed waiting time for events at `ratePerSecond`. */
  exponential(ratePerSecond: number) {
    return -Math.log(1 - this.next()) / ratePerSecond;
  }

  /** Pick a key with probability proportional to its weight. */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let r = this.next() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) if ((r -= w) < 0) return key;
    return entries[entries.length - 1][0];
  }

  /**
   * An independent generator for item `index` of a named `stream` (e.g. trips or entries),
   * derived from this generator's seed without consuming its sequence. Different streams
   * never share seeds by construction.
   */
  fork(stream: Stream, index: number) {
    return new Random(mix(mix(this.state ^ STREAM_SALT[stream]) ^ mix(index + 1)));
  }
}
