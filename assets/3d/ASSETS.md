# 3D asset inventory

All three packs are by Kenney (www.kenney.nl) and licensed **Creative Commons Zero (CC0 1.0)** per each pack's `License.txt`. Credit is optional; we credit Kenney in `README.md`.

## Archives and extraction

| Archive (tracked, unchanged) | Pack / version | Size | SHA-256 | Extracted to (git-ignored) |
| --- | --- | --- | --- | --- |
| `assets/3d/incoming/kenney_car-kit.zip` | Car Kit 3.1 (created 02-04-2026) | 4.8 MB zip / 14 MB extracted, 268 entries | `fac7daca…f3d0c4` | `assets/3d/source/kenney_car-kit/` |
| `assets/3d/incoming/kenney_city-kit-roads.zip` | City Kit Roads 2.2 (created 10-10-2026) | 2.9 MB zip / 7.8 MB extracted, 496 entries | `374a4552…a959` | `assets/3d/source/kenney_city-kit-roads/` |
| `assets/3d/incoming/kenney_road-textures.zip` | Road Textures (created 23-11-2019, orig. 20-05-2013) | 0.5 MB zip / 1.4 MB extracted, 288 entries | `cca05f64…a10c` | `assets/3d/source/kenney_road-textures/` |

Extraction: `unzip -q -n <zip> -d assets/3d/source/<pack>` (UnZip 6.00, macOS), one folder per pack, after checking `assets/3d/source/` was empty and that no entry used an absolute or `../` path. Archive SHA-256 sums were identical before and after extraction. The `source/` folders are git-ignored; re-create them with the same command.

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
| Road surface texture | `kenney_road-textures/PNG/Retina/roadTexture_01.png` (128×128, straight two-lane road with centre line) | `public/textures/roadTexture_01.png` | 1 KB | None |

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
| 9 | Side lane (widening) | `road-side`, `-barrier` | 1 × 1.31 | Extra lane, capacity |
| 10 | Side entry (merge taper) | `road-side-entry`, `-barrier` | 1 × 1.31 | Merge, gap acceptance |
| 11 | Side exit (diverge taper) | `road-side-exit`, `-barrier` | 1 × 1.31 | Diverge / off-ramp |
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

**Coverage target:** 22 types → 60% needs **14**. The planned presets use these 17 (77%): 1 straight, 2 bend, 3 curve, 4 crossroads, 5 T-junction, 7 roundabout, 8 road split, 10 side entry, 11 side exit, 12 straight ramp, 14 bridge, 15 road end, 16 crossing, 17 driveway, 19 traffic light, 20 stop sign, 21 yield (warning sign). The final count is confirmed once the preset layouts are built.
