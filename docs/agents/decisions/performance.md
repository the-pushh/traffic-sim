# Performance evaluation (P7, #37) — 2026-11-13

## How it's measured

`npm run build`, `npx vite preview --port 4173`, then `npm run perf` (`scripts/perf.mjs`; `--quick` for the two heaviest cases, `--label` to name the run). It drives a production build in Chrome (GPU: ANGLE Metal, Apple M1 Pro) at 1440×900 @2× and, for each preset at Medium and Congested, plays 2 s then measures 8 s:

- main-thread time per frame (Chrome's task accounting), script and style/layout time;
- GPU time (`EXT_disjoint_timer_query_webgl2`, one query per animation frame);
- WebGL draw calls and triangles per frame (wrapped draw calls), frame-to-frame times, JS heap;
- a CPU profile summed by function;
- scene switch times.

Load and idle costs were measured with the same tools against the deployed app.

## Where the load was

| | Measured (before) | Reading |
| --- | --- | --- |
| Main thread while running | 1.3–2.0 ms per frame; the profile is about 90% idle, and the busiest JavaScript is Three.js drawing (`renderBufferDirect`, uniform uploads) | The simulation isn't the bottleneck. |
| GPU while running | 150–213 ms per second (2.5–4.7 ms a frame) | This is the largest cost. It barely follows the draw-call count but drops when pixels drop (no antialiasing: 2.5 → 1.3 ms; pixel ratio 1.5: 2.5 → 1.9 ms). It is fill-bound: a 2880×1800 canvas with MSAA and soft shadows. |
| Idle (Ready or Paused) | 60 frames a second still drawn: about 20,000 draw calls and 120 ms of main thread per second, for a picture that doesn't change | Pure waste: battery, fans, a busier machine. |
| Draws while running | Each position drawn twice: the simulation steps 30 times a second and positions aren't interpolated, but the map was drawn 60 times | Half of the GPU work is duplicate frames. |
| Textures | The kit colour map is uploaded once per model (36 texture uploads) | It's the same image. |
| Loading (production) | 1.7–2.2 s cold; a reload is barely faster (1.5–2.1 s) because all 44 files are re-checked (`max-age=0, must-revalidate`), even the content-hashed script | Network round trips dominate. |

## What changed

1. **Drawing on demand** (`main.ts`). The map is drawn only when something it shows changed: traffic stepped, the run changed, the camera moved, the editor shows something new, or a redraw was asked for (resize, scene swap, edits). An idle map draws nothing. While running, it draws once per simulation step.
2. **Adaptive resolution** (`ResolutionGovernor`, unit-tested). While the map is being drawn, if frames average slower than 50 fps over 60 frames, it draws fewer pixels a step at a time (2 → 1.5 → 1). Opening a scene starts sharp again. On this M1 it never triggers. With the CPU throttled 6×, it stepped to 1.5 and held about 60 fps.
3. **Shared kit textures** (`textureSharing.ts`, unit-tested). Models from the same kit share one copy of the colour map: 36 → 25 texture uploads.
4. **Caching** (`vercel.json`). Hashed `/assets/*` files are `immutable` for a year; `/models/*` are cached for a day with a week of `stale-while-revalidate`.
5. **Editor models are loaded once** (P5), and the parts tray's pictures are drawn on first opening, not at start-up.

## After (same machine and method)

| Preset · load | GPU ms/s before → after | Draws/frame before → after | Main ms/frame before → after |
| --- | --- | --- | --- |
| Main Street · Medium | 185 → 97 | 321 → 161 | 1.74 → 1.46 |
| Main Street · Congested | 171 → 95 | 473 → 237 | 1.91 → 1.39 |
| Market Roundabout · Medium | 153 → 83 | 113 → 57 | 1.28 → 1.34 |
| Market Roundabout · Congested | 154 → 84 | 203 → 101 | 1.46 → 1.45 |
| School Run · Medium | 153 → 85 | 213 → 106 | 1.63 → 1.46 |
| School Run · Congested | 161 → 90 | 369 → 184 | 2.04 → 1.49 |
| Flyover Bottleneck · Medium | 184 → 100 | 138 → 69 | 1.53 → 1.53 |
| Flyover Bottleneck · Congested | 213 → 114 | 255 → 128 | 1.66 → 1.53 |

- **Idle:** draw calls per second went from about 20,000 to 0; main thread from 123 to 26 ms per second.
- **Frame rate:** 60 fps held in every case before and after; frame-time p95 is 16.8 ms or better.
- **Loading:** the reload improvement is measured on production after the deploy (see the tracker).

## Not done (and why)

- **Instanced vehicles.** This would cut draw calls further. CPU submission is about 1 ms a frame here, so it isn't the bottleneck; it can be revisited if weaker machines show CPU-bound frames.
- **Interpolating vehicle positions** to draw 60 smooth frames from 30 simulation steps. This is a smoothness feature, not a load reduction; it would double GPU work again.
- **Lazy-loading vehicle models.** There are 18 models (about 550 KB compressed) before the first frame. Caching makes return visits cheap; the first visit is about 1.5 s on this connection.
