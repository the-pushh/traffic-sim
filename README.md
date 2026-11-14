# Traffic Simulator

An agent-based traffic model on an editable road network, deployed as a desktop web app (Three.js, TypeScript, Vite). Each vehicle is its own agent: one of eight vehicle types, driven by one of five driver profiles, with its own route. Players pick or build a network with junctions, a flyover and roads of different widths and speed limits. They set the traffic load and run length, run a short simulation, then change the network or its junction controls and compare the next run with the last.

## Live app

**https://traffic-sim-one.vercel.app** is the production build, deployed by Vercel from `main` on every merge. Open it in a desktop browser on a laptop or desktop; phones and tablets get a message instead.

Vercel's bot protection may show a short "checking your browser" page on the first visit.

## Walkthrough (about 5 minutes)

This walks through the brief: an agent-based model of traffic on a road network with junctions, flyovers and roads of different widths and capacities, where users set up scenarios and see results.

1. **Flyover Bottleneck (opens by default).**
   - The divided road (two lanes each way) narrows to one lane each way at a road split. It climbs a ramp, crosses a bridge over a north–south surface road, and comes back down and widens again.
   - A slower, signalled surface road is the alternative.
   - Press **Play**. Vehicles cross the raised bridge above the road below, and merge from both lanes into the single lane at the split. Drivers can reroute to the alternative when the flyover backs up.
2. **Click any vehicle.** A card shows its type, its driver (profile and habits), its speed, what it's doing ("Red light", "Queued behind the car ahead") and where it's heading. Pink chevrons on the road show its route.
3. **Main Street.**
   - Step to it with the **‹ ›** arrows on the scene pill. It's a wide divided arterial (two lanes each way) with three signalised junctions on one-lane side roads.
   - In the bottom toolbar, set **Traffic load** to *High* and keep **Duration: 60 s**.
   - Press **Play**. At the end, the results card shows **Trips finished**, **Delay per trip** (time lost compared with the same route on empty roads), **Longest queue** (and where) and **Blocked trips**. **Show details** opens a table of this run beside the previous one, including the peak queue on every approach.
4. **Change a junction control and rerun.**
   - Open **Customise** and click a traffic light on the map. Its panel lets you change **Green / Amber / Red / Offset** and press **Apply timing**, or **Replace with** a *Stop sign* or *Give way sign*.
   - Press **Play** again with the same load and duration. The results card compares the two runs: each number gets a ▲/▼ badge, filled blue when it's better and outlined red when it's worse, with a "Better/Worse than the previous run (…)" note.
   - Example from the live app: replacing Junction 1's southbound signal with a Give way sign. Before, 6 of 51 trips finished, delay was 22 s per trip, and the longest queue was 8 at Junction 1 southbound. After, 4 of 51 finished, delay was 23 s, and the longest queue was 7, now at Junction 3 westbound. The side-road queue went, but side-road drivers now wait for gaps in the arterial traffic and slow it.
5. **Build your own.**
   - In **Customise**, drag a component onto the map, or click it and then click the map. A translucent preview shows where it will land.
   - Components include straight roads, curves, T-junctions, crossroads, a roundabout, a road split (2 lanes to 1), ramps, a bridge, signals, stop and give way signs.
   - Click a placed road to get its rotation ring, **Replace…** and **Remove**. Undo with ⌘Z or Ctrl+Z.
   - **Save** keeps the layout in this browser; **Reset** restores the preset.
   - The other presets are **Market Roundabout**, **School Run** and **Blank board**.

## Run locally

Requires Node.js 24 (verified with 24.20.0) and npm 11.

```sh
npm install
npm run dev        # http://localhost:5173/
npm test           # unit tests (Vitest)
npm run build      # type-check and production build to dist/
npm run preview    # serve the build at http://localhost:4173/
```

| Command | Purpose |
| --- | --- |
| `npm run verify:browser` | With the dev server running, opens the app in the installed Google Chrome (headless) and runs the end-to-end checks. These cover running, pausing, resetting and ending a run, the results card, the editor and every preset. Screenshots are saved to `artifacts/3d/previews/`. |
| `npm run verify:browser:headed` | The same checks in a visible Chrome window. |
| `npm run perf:sim` | The opt-in simulation performance test (skipped in `npm test`). |

On the dev server, `?timeScale=15` speeds up simulation time; production builds ignore it.

## Controls

| Input | Action |
| --- | --- |
| Drag on the map | Turn the view: left/right orbits, up/down tilts. A drag that starts on the selected road moves it |
| Hold **Space** and drag over the map | Pan |
| Scroll or two-finger scroll; **+** / **−** | Zoom |
| Focus the map (Tab), arrow keys | Orbit and tilt |
| Moon/sun button | Light or dark theme |
| Speaker button (below the theme button) | Sound on/off (starts muted; remembered) |
| Bottom toolbar | **Play/Pause** (the ring fills with simulated time) · countdown · **Reset run** · **Duration** (30/60/90 s) · **Traffic load** (Almost empty → Congested) · **Customise** |

The traffic load and duration are locked while a run is playing or paused. After a run ends, **Play** continues from the traffic as it stands, and **Reset run** starts again from the beginning.

## How the model works

- **Network:** road pieces on a 16 × 16 tile board build a lane graph. Each lane has its own geometry, height (ramps and bridges), speed limit and connections. Pieces have one or two lanes each way, and a road split narrows two lanes to one.
- **Agents:** each vehicle has a type (length, acceleration, braking, top speed) and a driver drawn from a profile: Steady, Cautious, Assertive, Cooperative or Impatient. A profile sets speed choice, headway, gap acceptance, compliance and patience.
- **Driving:** car-following, signals with amber and red, stop and give way rules, and gap acceptance at conflicts. Drivers route to their exit, and can reroute when their road backs up.
- **Steps:** the simulation advances in fixed steps of 1/30 s from a seeded random stream. The same scene, load and duration give the same run, so two runs can be compared directly.
- **Code:** the simulation (`src/simulation/`) has no rendering dependencies and is unit-tested. Rendering is in `src/three/`, and the app and interface are in `src/app/` and `src/components/`.

## Known limitations

- Desktop browsers only; phones and tablets are turned away by design.
- A free-flowing trip still shows about 1 s of delay per trip, from accelerating after it enters the board.
- Signal timings apply per approach. The editor doesn't coordinate the other approaches of a junction for you.
- Saved layouts live in this browser's local storage only.
- The JavaScript bundle is large (about 810 KB, 220 KB gzipped) because Three.js isn't code-split. Vite warns about this at build time.

## Assets

3D models and textures are from Kenney's Car Kit, City Kit Roads, Road Textures and Nature Kit (CC0, www.kenney.nl). See `assets/3d/ASSETS.md` for the inventory and how the original archives are extracted. Interface icons are from [Phosphor Icons](https://phosphoricons.com) (`@phosphor-icons/core`, MIT licence).
