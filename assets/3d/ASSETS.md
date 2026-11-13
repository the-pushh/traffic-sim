# 3D asset inventory

All three packs are by Kenney (www.kenney.nl) and licensed **Creative Commons Zero (CC0 1.0)** per each pack's `License.txt`. Credit is optional; we credit Kenney in `README.md`.

## Archives and extraction

| Archive (tracked, unchanged) | Pack / version | Size | SHA-256 | Extracted to (git-ignored) |
| --- | --- | --- | --- | --- |
| `assets/3d/incoming/kenney_car-kit.zip` | Car Kit 3.1 (created 02-04-2026) | 4.8 MB zip / 14 MB extracted, 268 entries | `fac7daca…f3d0c4` | `assets/3d/source/kenney_car-kit/` |
| `assets/3d/incoming/kenney_city-kit-roads.zip` | City Kit Roads 2.2 (created 10-10-2026) | 2.9 MB zip / 7.8 MB extracted, 496 entries | `374a4552…a959` | `assets/3d/source/kenney_city-kit-roads/` |
| `assets/3d/incoming/kenney_road-textures.zip` | Road Textures (created 23-11-2019, orig. 20-05-2013) | 0.5 MB zip / 1.4 MB extracted, 288 entries | `cca05f64…a10c` | `assets/3d/source/kenney_road-textures/` |
| `assets/3d/incoming/kenney_nature-kit.zip` | Nature Kit 2.1 (created 29-04-2020); supplied by the owner 2026-11-13 | 10.5 MB zip / 29 MB extracted, 3,626 entries | `fa7974a0…8c4d9d` | `assets/3d/source/kenney_nature-kit/` |

Extraction: `unzip -q -n <zip> -d assets/3d/source/<pack>` (UnZip 6.00, macOS), one folder per pack, after checking `assets/3d/source/` was empty and that no entry used an absolute or `../` path. Archive SHA-256 sums were identical before and after extraction. The `source/` folders are git-ignored; re-create them with the same command.

## Nature Kit — scenery (P8, 2026-11-13)

CC0 (`License.txt`). 329 models each in GLB, FBX, OBJ, DAE and STL, plus isometric and side-view PNG renders. The GLBs are self-contained (flat-coloured materials such as `leafsGreen` and `woodBark`, with no texture files), 2–19 KB each, and stand on y = 0 in kit units (a default tree is 0.76 × 1.71 × 0.65).

**Served:** 14 models copied unchanged to `public/models/nature/` (144 KB in all; conversion: none):
- trees: `tree_default`, `tree_oak`, `tree_fat`, `tree_simple`, `tree_cone`, `tree_pineRoundA`;
- bushes: `plant_bush`, `plant_bushLarge`;
- grass: `grass`, `grass_large`;
- rocks: `rock_smallA`, `rock_smallB`;
- flowers: `flower_redA`, `flower_yellowA`.

**Drawn at** `NATURE_SCALE` = 0.55 tiles per kit unit, so a default tree stands about 0.9 tiles (twice a car's height). Each item's reach (half its footprint diagonal, measured with Three.js) is in `SCENERY_MODELS`: trees 0.27, grass 0.16, bushes 0.15, rocks 0.14, flowers 0.07 tiles.

**Placement:** `sceneryFor(scene)` (`src/scenes/scenery.ts`) fills about 45% of the tiles no road covers. The board's corner tiles are skipped. Each item stays inside its own tile, clear of the tile's edges by its reach, so it can never touch a road. It also keeps clear of the spots beside road ends for signs and open-end markers. Placement is seeded per scene and tile.

**Not used** (available): the other trees (fall and dark variants, palms, pines), cliffs, paths, fences, crops, tents, logs, mushrooms, water and ground tiles.

## Car Kit — vehicles

- **Formats:** each model in GLB, FBX, and OBJ+MTL (`Models/GLB format/`, etc.); 50 of each. Previews in `Previews/`.
- **Dependency:** every GLB references an **external** texture `Textures/colormap.png` (512×512 RGBA) relative to the model. Keep it beside the model.
- **Structure:** UnityGLTF export, single `colormap` material, no animations. Vehicles have separate nodes `body`, `wheel-front-left/right`, `wheel-back-left/right` (wheels can be spun later).
- **Axes and size (observed, `sedan.glb`):** Y-up, front faces **+Z**, origin at ground centre. Bounds ≈ 1.50 W × 1.45 H × 2.55 L units (`taxi` 2.75 L).
- **Useful for traffic:** `sedan`, `sedan-sports`, `hatchback-sports`, `suv`, `suv-luxury`, `taxi`, `van`, `police`, `ambulance`, `firetruck`, `delivery`, `delivery-flat`, `truck`, `truck-flat`, `garbage-truck`. Props: `cone`, `cone-flat`, `box`. Not for traffic: karts, race cars, tractors, debris, loose wheels.

## City Kit Roads — road pieces

- **Formats:** GLB, FBX, OBJ+MTL; 95 of each. Previews in `Previews/`.
- **Dependency:** every GLB references external `Textures/colormap.png` (512×512). **This file differs from the Car Kit's `colormap.png` despite the same name**, so vehicles and roads must live in separate folders. An alternative palette `Models/Textures/variation-a.png` exists.
- **Axes and size (observed):** Y-up, **1 × 1 unit tile** footprint centred on the origin, surface at y = 0.02. `road-straight` runs along **X** (verified in the browser: laid along Z unrotated, its lane lines ran across the road); the app rotates it 90° about Y. Two lanes with a centre line and raised edges. `road-slant` rises to y = 0.27.
- **Useful pieces:** straights (`road-straight`, `-half`, `-barrier*`), curves/bends (`road-bend*`, `road-curve*`), junctions (`road-crossroad*`, `road-intersection*`, `road-curve-intersection*`, `road-split*`, `road-roundabout*`), ends/U-turn candidates (`road-end*`, `road-end-round*`), ramps and elevation (`road-slant*`, `road-slant-flat*`, `road-slant-high*`, `road-bridge`, `bridge-pillar*`, `tile-high/low/slant/slantHigh`), side entry/exit for on-ramps (`road-side-entry*`, `road-side-exit*`), controls (`traffic-light*`, `road-sign-stop`, `road-sign-warning`), dressing (lights, signs, construction, electricity).
- **Gaps (to confirm in later tickets):** no dedicated multi-lane highway, merge/acceleration-lane, or flyover deck piece; flyovers will likely combine `road-bridge`, `road-slant*`, and pillars. Lane counts and connection points are not encoded in the files and must be authored as metadata.

## Road Textures — surfaces

- **Formats:** PNG tiles at 64 px (`PNG/Default/`) and 128 px (`PNG/Retina/`), 96 each (`roadTexture_01`–`_96`); `Tilesheet/` (PNG @1x/@2x), `Vector/roadTextures.svg`, and an older `Legacy/PNG` set.
- **Content:** top-down 2D road tiles: straights, bends, junctions, roundabouts, plazas, plus water/sand variants. Flat-colour style that matches the 3D kits.
- **No dependencies.**

## Chosen for the first version

| Role | Source | Served at | Size | Conversion |
| --- | --- | --- | --- | --- |
| Vehicle | `kenney_car-kit/Models/GLB format/sedan.glb` | `public/models/vehicles/sedan.glb` | 172 KB | None (copied GLB) |
| Vehicle texture | `kenney_car-kit/Models/GLB format/Textures/colormap.png` | `public/models/vehicles/Textures/colormap.png` | 12 KB | None |
| Road piece | `kenney_city-kit-roads/Models/GLB format/road-straight.glb` | `public/models/roads/road-straight.glb` | 5 KB | None (copied GLB) |
| Road piece texture | `kenney_city-kit-roads/Models/GLB format/Textures/colormap.png` | `public/models/roads/Textures/colormap.png` | 11 KB | None |

No format conversion was needed: Three.js `GLTFLoader` loads the supplied GLB files with their relative texture paths. Delivered assets total ≈ 200 KB and are committed directly to git.

**Scene scale (verified in the browser):** one road tile = 4 world units; sedan scaled ×0.55 (≈ 0.83 W × 1.4 L) sits inside one lane at x = +0.75 on the road surface (y = 0.08).

## Traffic-affecting element types (for the 60% coverage target)

Classified from the City Kit Roads previews and measured GLB bounds (2026-11-11). Cosmetic variants (barrier, line, path, sidewalk, pavement, square-corner, object/hanging versions) count as one type. Footprints are in source tiles (1 tile = 4 world units in the app).

| # | Element type | Source models (variants) | Footprint / notes | Simulation role |
| --- | --- | --- | --- | --- |
| 1 | Straight road | `road-straight`, `road-straight-half`, `road-straight-barrier*` | 1×1; `-half` is half **length**, not narrower | Lanes, speed limit |
| 2 | Tight bend | `road-bend`, `-barrier`, `-sidewalk`, `-square`, `-square-barrier` | 1×1, 90° | Curve speed |
| 3 | Wide curve | `road-curve`, `-barrier`, `-pavement` | 2×2, 90° | Curve speed (faster than bend) |
| 4 | Crossroads (4-way) | `road-crossroad`, `-line`, `-path`, `-barrier` | 1×1 | At-grade junction |
| 5 | T-junction | `road-intersection`, `-line`, `-path`, `-barrier` | 1×1 | At-grade junction |
| 6 | Curved T-junction | `road-curve-intersection`, `-barrier` | 2×2 | At-grade junction |
| 7 | Roundabout | `road-roundabout`, `-barrier` | 3×3 | Yield-on-entry circulation |
| 8 | Road split (single ↔ divided) | `road-split`, `-barrier` | 1×2 | Lane-count / width change |
| 9 | Lay-by road | `road-side`, `-barrier` | 1 × 1.31 | Drop-off / bus bay beside the through lane |
| 10 | Lay-by start taper | `road-side-entry`, `-barrier` | 1 × 1.31 | Diverge into the bay |
| 11 | Lay-by end taper | `road-side-exit`, `-barrier` | 1 × 1.31 | Merge out of the bay, gap acceptance |
| 12 | Straight ramp | `road-slant`, `road-slant-high`, `road-slant-flat`, `road-slant-flat-high`, `*-barrier` | 1×1; 0 → 0.27 → 0.52 | Level change |
| 13 | Curved ramp | `road-slant-curve`, `road-slant-flat-curve`, `-barrier` | 2×1 | Level change on a curve |
| 14 | Bridge / flyover deck | `road-bridge` | 1×1, deck at 0.52 (2 world units clear) | Grade separation |
| 15 | Road end / turnaround | `road-end`, `road-end-round`, `*-barrier` | 1×1 | Dead end, U-turn |
| 16 | Pedestrian crossing | `road-crossing` | 1×1 | Traffic calming / slow zone |
| 17 | Driveway | `road-driveway-single`, `-double`, `*-barrier` | 1×1 | Local trip origin/destination |
| 18 | Paved square | `road-square`, `-barrier` | 1×1 | Open area / drop-off zone |
| 19 | Traffic light | `traffic-light`, `-hanging`, `traffic-light-object-*` | prop | Signal control |
| 20 | Stop sign | `road-sign-stop`, `road-sign-object-stop` | prop | Stop control |
| 21 | Warning sign (used as **yield**) | `road-sign-warning`, `road-sign-object-warning` | prop | Yield control; no dedicated yield sign exists |
| 22 | Lane closure | `construction-barrier`, `-cone`, `-fence`, `-light` | prop | Closes a lane / connection |

**Not traffic-affecting (cosmetic):** street and highway signs, empty signs, street lights, electricity poles and wires, dumpster, bridge pillars (deck support), elevation tiles (`tile-*`, embankment fill).

**Gaps:** no narrower or wider road pieces (width differences come from lane count via divided roads and side lanes, plus speed limits); no yield sign (warning sign stands in); no multi-lane highway piece.

**Coverage target:** 22 types → 60% needs **14**. Updated after T4 measured the pieces (rows 9–11 are a lay-by bay, not merge/diverge lanes). The planned presets use **18 (82%)**: 1 straight, 2 bend, 3 curve, 4 crossroads, 5 T-junction, 7 roundabout, 8 road split (two-to-one merge), 9–11 lay-by road and tapers (School Run drop-off bay), 12 straight ramp, 14 bridge, 15 road end, 16 crossing, 17 driveway, 19 traffic light, 20 stop sign, 21 yield (warning sign). Without the drop-off bay it is 15 (68%). Merges come from the road split's lane drop and yield-controlled T-junctions. The final count is confirmed once the presets are built.

**Final count (T13, 2026-11-12), measured from the four built presets: 15 of 22 (68%), above the 14 needed.**

| Preset | Element types it uses |
| --- | --- |
| Main Street | 1 straight, 4 crossroads, 19 traffic light |
| Market Roundabout | 1 straight, 5 T-junction, 7 roundabout, 16 crossing, 19 traffic light |
| School Run | 1 straight, 4 crossroads, 5 T-junction, 10 lay-by start, 11 lay-by end, 16 crossing, 17 driveway, 19 traffic light, 20 stop sign, 21 yield |
| Flyover Bottleneck | 1 straight, 2 bend, 4 crossroads, 5 T-junction, 8 road split, 12 ramp, 14 bridge (with supports), 19 traffic light, 21 yield |

Planned but not used by a preset as built: 3 wide curve, 9 lay-by road (middle; the bay is one tile, start and end only) and 15 road end (no preset needed a dead end). Never planned: 6 curved T-junction, 13 curved ramp, 18 paved square, 22 lane closure. Several of these are still offered in the editor's parts drawer.

## Vehicle types (for the behaviour model)

Classified from the Car Kit previews and measured bounds (2026-11-12). The models are stylised and **not to scale with each other** (sedan 2.55 units long, garbage truck 3.45), so the simulation uses realistic per-type lengths and each model is scaled to its type's length.

| Simulation type | Car Kit models | Notes |
| --- | --- | --- |
| Compact car | `hatchback-sports`, `sedan-sports` | Quickest to pull away, shortest gap |
| Sedan | `sedan`, `taxi`, `police` | |
| SUV | `suv`, `suv-luxury` | |
| Pickup | `truck`, `truck-flat` | Kenney's "truck" is a pickup |
| Van | `van`, `ambulance` | |
| Box truck | `delivery`, `delivery-flat` | Light goods lorry / flatbed |
| Heavy truck | `garbage-truck`, `firetruck` | Slowest acceleration, needs most room past a junction |
| Tractor | `tractor`, `tractor-police`, `tractor-shovel` | Slow vehicle; low top speed |

**Not used as traffic:** karts (`kart-*`) and race cars (`race`, `race-future`). **Gap:** no bus model exists. Emergency models drive as their base type (no sirens or priority).

## Road piece connections (measured 2026-11-12 for T4)

Ports were measured from the GLB geometry: an opening is an edge with kerbs at both ends of a 0.8-tile carriageway (lanes 0.4 tile wide, centred 0.2 tile either side of the centre line). Recorded as data in `src/simulation/network/pieces.ts` and summarised in `docs/agents/3d-project.json` (`roadPieces`).

- **Road split** (1 × 2) joins a divided road (two full roads at ±0.5) to a single road centred on the tile boundary, so scenes use **half-tile positions** there. Two lanes merge into one.
- **`road-side`, `-side-entry`, `-side-exit`** add a **lay-by bay** (0.31 tile, from −0.71 to −0.4) with tapers in and out — a drop-off/bus bay, not a through lane. Merges in the presets come from the split's lane drop and yield-controlled T-junctions.
- **Ramps:** `road-slant` climbs 0 → 0.25 tile, `road-slant-high` 0 → 0.5 in one tile; the **bridge deck** is at 0.5 and runs along the model's z axis. Two `road-slant` stacked on a `tile-high` block make the gentler two-tile ramp.
- **Driveways** have a narrow 0.26-tile opening on one side: an access point for local trips.
- **Road ends** (`road-end`, `road-end-round`) open on their +x side only; vehicles turn around.
- **Roundabout:** circulating carriageway from radius 0.45 to 1.15 tiles — one lane, centre line at 0.8.

**Road texture:** `roadTexture_01.png` was used for a separate textured strip in the first starter scene. Scenes are now built entirely from City Kit pieces (which carry their own `colormap.png`), so the texture is no longer served; the original stays in `assets/3d/source/kenney_road-textures/`.

## Vehicle models served (T3, 2026-11-12)

All 18 Car Kit models used by the eight vehicle types are copied unchanged to `public/models/vehicles/` (about 3.5 MB in total, 170–280 KB each), sharing `Textures/colormap.png`: `hatchback-sports`, `sedan-sports`, `sedan`, `taxi`, `police`, `suv`, `suv-luxury`, `truck`, `truck-flat`, `van`, `ambulance`, `delivery`, `delivery-flat`, `garbage-truck`, `firetruck`, `tractor`, `tractor-police`, `tractor-shovel`. Each is drawn at its type's real length (1 tile = 8.75 m); width is capped at 75% of a lane and height is scaled between the two, because the stylised models are wider than real vehicles.
