# 3D setup and verification

## Scope

Use this checklist to prepare and verify the 3D assets for the desktop Three.js traffic simulation. Read `docs/agents/design.md` for the player experience and `docs/agents/REPO_STRUCTURE.md` for asset locations.

`docs/agents/3d-project.json` records the toolchain, asset conventions, and verified commands. Leave unknown values empty until they are confirmed.

## Use the supplied assets

The three original archives are already in the repo. Use these exact paths, relative to the repo root.

| Archive | Intended use |
| --- | --- |
| `assets/3d/incoming/kenney_car-kit.zip` | Vehicle models |
| `assets/3d/incoming/kenney_city-kit-roads.zip` | Road pieces and junction construction |
| `assets/3d/incoming/kenney_road-textures.zip` | Road surfaces and markings |

1. Inspect each archive for formats, textures, dependencies, scale information, and licensing. Check `assets/3d/source/` for existing extractions before creating new ones.
2. Preserve the ZIPs and extract each into a separate folder under `assets/3d/source/`. Keep linked models and textures together until their relative paths have been checked.
3. Record useful assets, formats, dependencies, sizes, provenance, and available license information in `assets/3d/ASSETS.md`. Mark gaps in the asset set. If a required piece such as a ramp or flyover is missing, use a simple compatible piece and document it.
4. Put only browser-ready assets used by the application in its configured served asset folder. Keep originals and editable sources in their source locations.

## Establish the toolchain

1. Inspect the project’s dependencies, lockfile, scripts, and existing scenes. Reuse the project’s setup where practical. Record the actual Three.js version, build tools, and any asset conversion tools in `docs/agents/3d-project.json`.
2. Confirm which model and texture formats load in the application. Convert assets as needed for reliable browser use. Preserve geometry, normals, UVs, material assignments, and relevant animation. Check the converted result against the source.
3. Run the actual development, build, and test commands. Record the working commands under `verification.commands`, keyed by purpose.
4. Load one supplied vehicle on a short stretch of road with a supplied road texture in the browser. Inspect the scene and check browser errors and asset requests. Set `toolchain.setupVerified` to `true` only after observing that result. Record the tools, assets, and command used.

## Establish road and vehicle conventions

- **Scale and orientation.** Confirm units, up and forward axes, handedness, and origin policy before conversion. Record them in `coordinates` in the manifest. Check that vehicles fit the intended lanes, sit on the road surface, and face their travel direction.
- **Road pieces.** Give each placeable piece a consistent pivot, footprint, and connection points. Record each connection point’s position, travel direction, elevation, and lane compatibility. Use these points for snapping in the editor and for defining how lanes connect in the simulation.
- **Elevation and routing.** Verify ramp endpoints meet the corresponding road heights and vehicles follow the slope. A road that passes above another connects to it only through an explicit link, such as a ramp. Check visual alignment and legal vehicle routes separately.
- **Placement preview.** While the player drags or rotates a piece, show a translucent preview at the position, rotation, and height that a drop would commit. Use the same snapping and placement checks for the preview and the final piece. Give the preview its own material so changes to opacity leave placed roads and shared assets intact.
- **Textures and portability.** Verify road markings and textures after export, including where road pieces meet. Check that the browser can load the scene and its dependencies from the deployment path.

## Verify changes in the browser

| Area | What to check |
| --- | --- |
| **Assets and road geometry** | Inspect representative vehicles and roads from overhead and angled views. Check framing, scale, orientation, surface shading, textures, and missing resources. |
| **Drag and drop** | From a blank map and an edited preset, drag a part from the drawer. Check that the preview follows the pointer, rotates, and snaps to compatible endpoints. Confirm the placed piece matches the preview, an invalid drop preserves the prior layout, and undo restores the previous connection. |
| **Traffic and elevation** | Run traffic through a representative junction, merge, and flyover as those scenes become available. Confirm vehicles follow connected lanes, respect controls, and stay on the correct road level. |
| **Camera and scene state** | Check drag-to-turn (orbit and tilt; the joystick was removed in P14), arrow keys on the focused map, Space+drag to pan, scroll-wheel zoom, and Reset View. Confirm the controls work while paused and running and preserve the layout, vehicle state, and simulation clock. |
| **Scene lifecycle** | Switch maps repeatedly. Check that the previous scene’s vehicles and controls are cleared, shared assets still load, and repeated switching does not accumulate event listeners or graphics resources. |
| **Performance** | Measure asset size, scene load time, and frame rate on a representative desktop scene at a stated traffic load. Record the browser and hardware used. Evaluate against agreed targets once they exist. |

Save representative preview images to the configured preview location when available. In the handoff, record what was checked, what happened, and any remaining limitations. Keep `setupVerified` false until the initial browser asset check succeeds.