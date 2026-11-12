# Performance evaluation (P7, #37) — 2026-11-13

## How it's measured

- **The app:** `npm run build`, `npx vite preview --port 4173`, then `npm run perf -- [url] [--label name] [--quick] [--throttle N]` (`scripts/perf.mjs`). It drives a production build in Chrome at 1440×900 @2× (GPU: ANGLE Metal, Apple M1 Pro).
  - **Idle:** the map in Ready for 5 s.
  - **Running:** each preset at Medium and Congested, played for 2 s, then measured for 8 s. It records:
    - main-thread time per animation frame (Chrome's task accounting), split into script and style/layout;
    - GPU time per second (`EXT_disjoint_timer_query_webgl2`);
    - frames drawn and draw calls per second, and draws per drawn frame;
    - frame-to-frame times, the JS heap, and a CPU profile summed by function;
    - scene switch times.
  - **`--throttle N`:** Main Street at Congested with the CPU slowed N times, recording the canvas resolution and frame rate.
- **The simulation on its own:** `npm run perf:sim` times one simulated second (30 steps) per preset at Medium and Congested, after 60 s of traffic.
- **Loading** was measured against the deployed app (cold load, reload, and requests re-checked).

## Where the load was (before)

| | Measured | Reading |
| --- | --- | --- |
| Simulation | 0.8–15 ms per simulated second (Main Street Congested is the most: 65 vehicles, ≈0.5 ms per step) | Not a bottleneck: at most 1.5% of one core. |
| Main thread while running | 1.3–1.9 ms per animation frame. The CPU profile is about 90% idle; the busiest code is Three.js submitting draws (`renderBufferDirect`, uniform uploads) | Not a bottleneck. |
| GPU while running | 159–281 ms per second (2.5–4.7 ms per frame) | **The largest cost.** It barely follows the draw count but drops with fewer pixels (antialiasing off: 2.5 → 1.3 ms per frame; pixel ratio 1.5: 2.5 → 1.9 ms per frame), so it is fill-bound: a 2880×1800 canvas with MSAA and soft shadows. Half of it was **duplicate frames**: the simulation steps 30 times a second and positions aren't interpolated, but every position was drawn twice (60 frames a second). |
| Idle (Ready or Paused) | 60 frames drawn every second: 20,340 draw calls, 261 ms of GPU and 125 ms of main thread per second | **Pure waste** for a picture that doesn't change: battery, heat, a busier machine. |
| Textures | The kit colour map uploaded once per model (36 texture uploads) | It's the same image. |
| Loading (production) | 1.7–2.2 s cold. A reload is barely faster (1.5–2.1 s), because all 44 files are re-checked (`max-age=0, must-revalidate`), even the content-hashed script | Network round trips dominate. |

## What changed

1. **Drawing on demand** (`DrawOnDemand`, unit-tested; used in `main.ts`). The map is drawn only when something it shows changed: traffic stepped, the run changed, a new simulation started (Restart, a new load, an edit), the camera moved or the view was resized, the editor shows something new (`editor.sync()`), or a redraw was asked for (a scene swap, a restored GPU context). The idle map is never drawn; while running, it's drawn once per simulation step; while a part is being placed, every frame.
2. **Adaptive resolution** (`ResolutionGovernor`, unit-tested). It learns the screen's frame interval from the shortest gap between frames, idle ones included, so a browser capped at 30 fps (battery saver) or a 50 Hz screen isn't taken for a slow computer.
   - If frames being drawn average more than 1.4× that interval (and slower than 50 fps) over 60 frames, it draws fewer pixels, a step at a time (2 → 1.5 → 1).
   - It's applied before drawing, so no blank frame. Opening a scene starts sharp again.
   - This helps GPU-bound slowness, the bottleneck above. With the CPU slowed 20× it steps to 1× (as it should), but that case is CPU-bound and stays at 17 fps.
3. **Shared kit textures** (`textureSharing.ts`, unit-tested). Models from the same kit share one colour map when every sampling setting matches: 36 → 25 texture uploads.
4. **Caching** (`vercel.json`). Hashed `/assets/*` files are `immutable` for a year. Unhashed `/models/*` files are kept 10 minutes, then served stale for up to a day while they're refreshed, so a deploy that changes a model reaches players within minutes.

## After (same machine, same script; `before` = main, `after` = this change)

| | Before | After |
| --- | --- | --- |
| Idle: GPU / draw calls / main thread per second | 261 ms / 20,340 / 125 ms | **0 / 0 / 38 ms** |
| Main Street · Medium: GPU ms/s, draws/s, main ms/frame | 275, 19,372, 1.72 | **130, 9,666, 1.34** |
| Main Street · Congested | 281, 28,525, 1.89 | **125, 14,298, 1.51** |
| Market Roundabout · Medium | 251, 6,847, 1.34 | **95, 3,417, 1.40** |
| Market Roundabout · Congested | 236, 12,263, 1.45 | **95, 6,121, 1.52** |
| School Run · Medium | 215, 12,855, 1.53 | **89, 6,414, 1.52** |
| School Run · Congested | 184, 22,256, 1.72 | **94, 11,128, 1.45** |
| Flyover Bottleneck · Medium | 166, 8,317, 1.57 | **85, 4,161, 1.44** |
| Flyover Bottleneck · Congested | 159, 15,356, 1.67 | **87, 7,681, 1.48** |

- The screen still updates 60 times a second in every case, and frame-time p95 is 16.8 ms or better. Frames drawn while running fell from 60 to 30 a second, one per simulation step, which looks identical. Draws per drawn frame are unchanged (every vehicle is still drawn).
- Scene switches take 86–165 ms (before: 102–176 ms). The JS heap stayed at 9–17 MB.
- Loading: see the tracker row for #37, measured on production after the deploy.

## Not done (and why)

- **Instanced vehicles:** fewer draw calls per frame. CPU submission is about 1 ms a frame here, so it isn't the bottleneck.
- **Interpolating vehicle positions** to draw 60 smooth frames from 30 steps: a smoothness feature that would double GPU work again.
- **Lazy-loading vehicle models:** 18 models (about 550 KB compressed) load before the first frame. With caching, return visits are cheap.
