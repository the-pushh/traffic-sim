import type { AudioOutput, Effect } from './soundBoard';

/** Overall level, and the ambience's level under it: low, so it sits behind the edits. */
const MASTER_LEVEL = 0.8;
const AMBIENCE_LEVEL = 0.07;
const FADE_IN_S = 1.2;
const FADE_OUT_S = 0.8;

/**
 * Sound through the Web Audio API, synthesised (no files to load): a soft two-note click for a
 * placed road, a short tick for a committed turn, a low tap for a removal, and one looped,
 * filtered noise bed for traffic that fades in and out.
 */
export function createWebAudioOutput(): AudioOutput {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = MASTER_LEVEL;
  master.connect(context.destination);
  // Browsers start audio suspended until the player does something: resume on their next press.
  const resume = () => void (context.state === 'suspended' && context.resume());
  resume();
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);

  /** One enveloped tone: a quick attack, then an exponential fall. */
  function tone(type: OscillatorType, from: number, to: number, start: number, length: number, level: number) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  let ambience: GainNode | null = null;
  /** The traffic bed: brown noise, low-passed, with a slow drift so it doesn't sound like a hiss. */
  function ambienceBed() {
    if (ambience) return ambience;
    const seconds = 3;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const drift = context.createOscillator();
    const depth = context.createGain();
    drift.frequency.value = 0.08;
    depth.gain.value = 140;
    drift.connect(depth).connect(filter.frequency);
    ambience = context.createGain();
    ambience.gain.value = 0;
    source.connect(filter).connect(ambience).connect(master);
    source.start();
    drift.start();
    return ambience;
  }

  /** After a silence, sound comes back at full level. */
  function unmute() {
    if (master.gain.value === 0) master.gain.setValueAtTime(MASTER_LEVEL, context.currentTime);
  }

  return {
    effect(kind: Effect) {
      unmute();
      const now = context.currentTime + 0.005;
      if (kind === 'place') {
        // A snug click: two bright, short notes a fifth apart.
        tone('triangle', 880, 820, now, 0.08, 0.22);
        tone('sine', 1320, 1250, now + 0.035, 0.1, 0.16);
      } else if (kind === 'rotate') {
        tone('triangle', 1900, 1700, now, 0.035, 0.12);
      } else {
        // Softer and lower: a tap that falls away.
        tone('sine', 260, 150, now, 0.14, 0.18);
      }
    },
    ambience(on: boolean) {
      unmute();
      const gain = ambienceBed().gain;
      const now = context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(on ? AMBIENCE_LEVEL : 0, now + (on ? FADE_IN_S : FADE_OUT_S));
    },
    silence() {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0, now);
      if (ambience) {
        ambience.gain.cancelScheduledValues(now);
        ambience.gain.setValueAtTime(0, now);
      }
    },
  };
}
