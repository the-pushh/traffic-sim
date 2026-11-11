# Traffic Simulator

A desktop web traffic simulation game built with Three.js. Players will pick a road network, set traffic demand, run short simulations, change the network or junction controls, and compare runs. See `docs/agents/START_HERE.md` and `docs/agents/design.md`.

**Current state:** first runnable version — one starter scene with a supplied Kenney sedan on a short straight road built from supplied road pieces, beside a strip using a supplied road texture. Observer camera with pan, orbit/tilt, zoom, and **Reset View**. No traffic simulation yet.

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
| Left-drag on the scene | Pan across the map |
| Right-drag on the scene | Left/right orbits, up/down tilts between overhead and angled |
| Scroll wheel over the scene | Zoom |
| **+** / **−** buttons | Zoom in / out |
| **Reset View** | Return to the starting overhead view |

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server at <http://localhost:5173/> |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build at <http://localhost:4173/> |
| `npm run verify:browser` | With the dev server running: open the app in installed Google Chrome (headless), check console errors and asset requests, exercise the camera and Reset View, check the asset-failure/Retry state, and save screenshots to `artifacts/3d/previews/`. Another URL: `node scripts/verify-browser.mjs <url>`. |
| `npm run verify:browser:headed` | Same check in a visible Chrome window. |

## Assets

3D models and textures are from Kenney's Car Kit, City Kit Roads, and Road Textures (CC0, www.kenney.nl). See `assets/3d/ASSETS.md` for the inventory and how the original archives are extracted.
