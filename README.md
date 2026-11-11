# Traffic Simulator

A desktop web traffic simulation game built with Three.js. Players will pick a road network, set traffic demand, run short simulations, change the network or junction controls, and compare runs. See `docs/agents/START_HERE.md` and `docs/agents/design.md`.

**Current state:** the app opens a hidden **Test network** built from data (City Kit road pieces placed on a 64-unit board): a signalised crossroads, a flyover on ramps over a road, a roundabout, T-junctions, a driveway and a turnaround, with lanes, entry/exit points (A–H) and an open road end marked. Traffic arrives in T3.

## Live app

**https://traffic-sim-one.vercel.app** — production, deployed by Vercel from `main` on every merge. Each pull request also gets a Vercel preview (behind Vercel sign-in for the project owner).

## Run the app

Requires Node.js 24 (verified with 24.20.0) and npm 11.

```sh
npm install
npm run dev
```

Then open <http://localhost:5173/> in a desktop browser.

### Camera controls

| Input | Action |
| --- | --- |
| With the pointer over the map, hold **Space** and drag | Pan across the map. Works with a trackpad click-drag. A plain drag is reserved for editing road pieces later. Elsewhere on the page Space keeps its normal meaning |
| On-screen **joystick** (drag the knob, or focus it and hold the arrow keys) | Left/right orbits; up tilts toward overhead, down toward an angled view |
| Right-drag on the scene (optional shortcut) | Orbit and tilt |
| Scroll wheel or two-finger trackpad scroll over the scene | Zoom |
| **+** / **−** buttons | Zoom in / out |
| **Reset View** | Return to the starting overhead view |

### Running the simulation

The dock at the bottom holds **Play/Pause**, **Restart run**, the clock, the traffic **Intensity** (Almost empty → Congested) and the run length (**30 s / 60 s / 90 s**). Intensity and run length are greyed out while a run is playing or paused. When the clock reaches the run length the run ends; **Play** continues for another run length, **Restart run** goes back to the start. Traffic arrives in T3; until then the clock runs on its own.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server at <http://localhost:5173/> |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build at <http://localhost:4173/> |
| `npm run verify:browser` | With the dev server running: open the app in installed Google Chrome (headless), check console errors and asset requests, check a plain drag leaves the view alone, exercise Space + drag pan, the joystick (pointer and arrow keys), right-drag, zoom and Reset View, check the asset-failure/Retry state, and save screenshots to `artifacts/3d/previews/`. Another URL: `node scripts/verify-browser.mjs <url>`. |
| `npm run verify:browser:headed` | Same check in a visible Chrome window. |
| `node scripts/verify-browser.mjs https://traffic-sim-one.vercel.app/` | Same check against the deployed app (runs in real time, about 2 minutes). |

On the dev server, `?timeScale=15` speeds up simulation time (used by the browser check to finish a 30 s run in about 2 s). It has no effect in production builds.

## Assets

3D models and textures are from Kenney's Car Kit, City Kit Roads, and Road Textures (CC0, www.kenney.nl). See `assets/3d/ASSETS.md` for the inventory and how the original archives are extracted.
