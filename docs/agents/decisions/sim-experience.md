# Decisions: entry to first simulation run

Running record of the planning interview (task 10, issue #1). Each line is an owner decision; "Open" items are still being decided.

## Round 1 — 2026-11-11

| # | Topic | Decision |
| --- | --- | --- |
| 1 | PR #2 | Owner approved squash-merge. |
| 2 | Entry | Land directly in the **Traffic Lights** scene, paused, with entry points visible and the picker one step away. |
| 3 | Dock | **One unified floating dock**, bottom-centre, rounded corners: run section (Play/Pause, timeline, duration) and parts section. |
| 4 | Timeline | **Progress only** (clock + bar to the chosen duration). No scrubbing or replay for now. |
| 5 | Time select | **30 s / 60 s / 90 s** duration select. No playback-speed toggle. |
| 6 | Parts section | Hidden until drag-and-drop works; ships with the editor ticket. |
| 7 | Scene switching | **Left and right arrows** step through the scenes. |
| 8 | Scenes | Prove the engine on a single signalised crossroads first, but the starter scenes themselves must be **complex: multiple flyovers, crossroads, and signals**. |
| 9 | Simulation model | Lane graph, gap-keeping car-following (IDM), fixed-time signals, fixed 1/30 s steps, seeded arrivals for comparable reruns. Owner will specify traffic behaviour in detail later. |
| 10 | Traffic load | **Abstract 5-tick control** (low → congested), no numeric vehicle rates shown to the player. |
| 11 | Results | Results card above the dock when a run ends: reached destination, average wait, longest queue, side by side with the previous run, labelled with scene, load, duration. |

## Round 2 — 2026-11-11

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Scene switcher | A **pill above the dock**: `‹ Scene name ›`, arrows step through scenes. |
| 2 | Switching mid-run | Stops and resets the run; the next scene loads paused with its own starting setup. |
| 3 | Load ticks | **Almost empty · Low · Medium · High · Congested** (5 ticks). |
| 4 | Load location | In the dock's run section, next to the duration select. |
| 5 | Settings during a run | Settings are **disabled and greyed out** while the simulation runs. |
| 6 | Restart vs Reset | Both: **Restart run** (dock) clears the run, keeps layout and settings; **Reset** restores the scene's starting layout, controls and load, and clears the run. |
| 7 | End of run | Traffic freezes, timeline full, results card appears. **Play keeps its label** (no "Run again"). |
| 8 | Results comparison | Latest run and the previous one, with ▲▼ deltas; dismissible. |
| 9 | Scene line-up | Provisional: Traffic Lights (2×2 signalised grid), Flyover, On-Ramp, Turnaround; build order crossroads → Traffic Lights → Flyover → On-Ramp → Turnaround. **Owner is still designing the scenes.** |
| 10 | Entry/exit markers | Every road end at the board edge is a labelled entry/exit (A, B, C…) with flow arrows; vehicles pick a random reachable exit for now. |
| 11 | Vehicle mix | **Mix of every vehicle** in the Car Kit; same behaviour for now. |
| 12 | Screen frame | Header bar removed; full-window 3D view with floating panels. |
| 13 | First-visit hint | One-time tip above the dock: "Press Play to run 30 s of traffic", gone after first Play, remembered in the browser. |

## Round 3 — 2026-11-11

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Saving edits | No menu. A **Save** button appears after the scene title **only when the scene has been edited**. Switching scenes with unsaved edits shows a **warning modal** explaining that leaving resets the scene to its default. |
| 2 | Settings while paused mid-run | Disabled for the whole run, playing or paused. |
| 3 | Play after a run ends | Settings re-enable. Pressing Play **continues from the frozen traffic** if possible; a fresh start is acceptable otherwise. |
| 4 | Scene arrows during a run | **Disabled** during a run (supersedes round 2 #2, "switching mid-run stops and resets"). |
| 5 | Before Play | Not empty: the scene opens **paused with traffic already on the roads**, at the selected load. |
| 6 | Dock layout | `[Play/Pause] [Restart] [clock + progress] │ [Load ticks] [30/60/90 s]`, parts section later; scene pill centred above. |
| 7 | Vehicle mix | A **random permutation of every vehicle model** (shuffled and cycled so all appear evenly). |
| 8 | Build order | Engine and dock start on a hidden test crossroads while the owner designs the four scenes as 16 × 16 tile sketches. |

## Round 4 — 2026-11-11

| # | Topic | Decision |
| --- | --- | --- |
| 1 | What Save does | Save **overrides the scene** with the player's network (stored in the browser). A **Reset** button stays available to return to the designer's network. *Supersedes the brief's "Save as new scene … separate, reusable scene".* |
| 2 | Unsaved-changes modal | Text: "Leaving resets the road network to default." Buttons: **Save and switch**, **Discard and switch**; cancel is an **×** at the top-right. |
| 3 | Save/Reset visibility | Save appears only with unsaved edits; Reset appears whenever the network differs from the designer's default. |
| 4 | Continue vs Restart | Play after the end continues from the frozen traffic with the clock at 0:00; **Restart** gives the identical fresh start. |
| 5 | Starting traffic | Seeded off-screen warm-up at the selected load; changing the load before Play rebuilds it. |
| 6 | Arrows while paused mid-run | Disabled, same rule as settings. |

Planning interview complete; spec in `docs/agents/specs/sim-experience.md`.

## Layout constraint — 2026-11-11

Each preset network fits **entirely inside the existing 1:1 square board** (16 × 16 road tiles, 64 units), including ramps, junctions and road approaches. Road lengths and junction spacing are adjusted to the asset footprints. Each preset leaves **usable empty space** and **at least one open connection point** where players can add a road or junction and see the effect on traffic.

## Round 5 — 2026-11-12 (after the owner's preset plan)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Road widths | Mix **lane counts** (divided roads, side lanes, two-to-one splits) and **speed limits** to create width and capacity differences. |
| 2 | Yield | Use the kit's own signs: `road-sign-warning` is the yield control; `road-sign-stop` is stop; roundabout entries yield. |
| 3 | Own scenario | Fifth carousel entry, **Blank board**, built with the kit's pieces and signs. |
| 4 | "Replay" | Not a replay: pressing Play after a run ends **continues the simulation for the selected duration**. Rerunning the same arrivals, drivers and vehicles is **Restart**. Timeline stays progress-only. |
| 5 | Edits mid-run | Road and control edits are **allowed while paused mid-run** (confirmed 2026-11-12); the simulation **auto-adjusts** (committed vehicles clear, trips reroute, blocked trips shown). Intensity, duration and scene arrows stay **disabled** during the run. |
| 6 | Measures | **Absolute numbers**, always with the **sample count** next to each measure (e.g. "Average travel time 41 s · 118 trips"). |
| 7 | Flyover | Show where the slower surface route **rejoins** the raised route; keep the alternative, connections and build space visible on the 16 × 16 sketch (redrawn). |
| 8 | Demand | Each preset defines its own demand pattern (per-entry weights, timed peaks); the 5-tick control scales it. |
| 9 | Deployment | **Vercel**. |
| 10 | Drivers and vehicles | Owner's behaviour model, `docs/agents/BEHAVIOUR_PLAN.md`; supersedes the proposed fixed mix and round 3 #7 ("every vehicle"): use a sensible mix per scene. |
| — | Defaults applied | First scene **Main Street**. Hovering a vehicle shows "Type · Profile · Reason" (from the behaviour model). |

## Agreement — 2026-11-12

Owner agreed the spec and the T1–T13 ticket breakdown and authorised implementation. Vercel project linked by the owner: `pushkar1809s-projects/traffic-sim`, connected to the GitHub repo. Owner allowed `gh pr merge`.

## Implementation notes — 2026-11-12

- **T1 scene pill label:** shows "Starter scene" until the Main Street preset exists (T7); the "Main Street" label criterion moves to T7 (#9).
- **Intensity control:** a five-tick slider showing the current tick's name (e.g. "Intensity Medium").
- **Settings change after a run ends** returns to Ready, so the next Play starts fresh (spec lifecycle table).
- **Framing above the panels:** the camera's view is centred in the area above the scene pill and dock, and the board is fitted into that area. The first-visit tip is not counted.
- **Driving side (assumed):** right-hand traffic; roundabouts circulate anticlockwise from above. Asked the owner to confirm (2026-11-12). The side is set in two places in the lane builder (`rightOf` lane placement and the roundabout ring direction).
- **Road texture strip** retired: scenes are built from City Kit pieces only (T4).
- **App scene:** the app opens on **Main Street** (T7) until the scene carousel (T11). Earlier tickets used the Signal test (T3) and the Test network (T5–T6), which stay in code.
- **Deferred from T3:** impatience building during delays (needs junction waiting and route choice, T5/T6) and use of the drivers' accepted-gap preference (gap acceptance, T5). Rule violations (speeding, rolling stops) are T5.
- **Run measures** start at zero when a run starts; warm-up trips carry on but aren't counted.
- **Signal lamps** show the aspect by colour and position (red top, amber middle, green bottom).

## Junction behaviour notes (T5) — 2026-11-12

- **Uncontrolled crossroads:** give way to traffic from the right (right-hand traffic assumption). Roundabout entries yield to the ring automatically.
- **Curve speed:** drivers slow for bends to √(2.5 m/s² · radius).
- **Conflict points:** paths that cross, merge or pass within 0.15 tile (≈1.3 m) of each other count as a conflict. Measured: real near-touches are ≤0.06 tile; roundabout entry/exit pairs sit at 0.27 tile and don't conflict.
- **Committing to a junction:** a driver at the front of the queue reserves every conflict point on its path at once (all or nothing), then doesn't recheck. Two drivers who must both give way go in arrival order (same junction only).
- **Courtesy:** a cooperative driver within 70 m of a waiting side-road driver eases toward 3 m/s and holds back. The waiting driver sees this and goes.

## Routing notes (T6) — 2026-11-12

- **Route choice:** each trip takes the quickest route to its destination. The cost is free-flow time (the speed limit or curve speed) plus the usual wait at each control (half the red time on average at a light, 4 s at a stop sign, 1.5 s at a yield), plus 2 s for each queued vehicle the driver can see, weighted by that driver's **route awareness** (0.15–0.6, the same range for every profile).
- **Impatient rerouting:** after 3 s held up, a driver reconsiders once a second. The queue weighting grows with frustration (× (1 + 4 · impatience)). They switch only if the new route saves at least 3 s or 15 % of the time left. Impatience eases once moving, so drivers settle back.
- **Closed connections:** a vehicle clears a closed lane if it's already on it, committed to the junction before it, or can't stop before it (emergency braking). Everyone else reroutes from the last point they can still change. With no way to their destination, they leave by another exit and are counted as blocked. With no exit at all, they pull up short of the closure (never inside a junction), wait as blocked, and go again once it reopens. A vehicle clearing one closure is still rerouted (or stopped) for any closure further on. A trip that gets a way through again stops counting as blocked and counts as finished when it arrives.
- **Shown in the scene:** only trips turned away at an entry get a badge. Vehicles cut off on the board show "Road closed ahead" on hover. Vehicles diverted to another exit aren't marked; the results card (T7) reports the total.
- **Blocked trips** are counted in the run (`blocked`). Trips turned away at an entry show as a red count badge above that gateway's label. Destinations are drawn from the exits the scene was built to reach, so only closures produce blocked trips.
- **Junction fixes found while testing routing:** a junction before a farther red light is still weighed up; "Exit lane full" also counts a queue whose last vehicle still has its rear in the junction's final lane.

## Main Street and measures notes (T7) — 2026-11-12

- **Main Street layout:**
  - The arterial is two one-way carriageways of two lanes each: westbound on row 7, eastbound on row 8.
  - Side streets have one lane each way and run at columns 3, 9 and 11. Column 11's south arm is the open connection.
  - Signals sit on the outer approaches only, 11 in all.
- **Two-tile junctions act as one:** junction pieces that join directly form one junction.
  - Drivers commit to the whole crossing, reserve crossings on both tiles, and never stop between them.
  - Conflicts are checked where the path enters each tile.
  - Turns are judged over the whole movement: a left across the divided road counts as a left turn.
- **Main Street timing:** a 60 s cycle with arterial green 30 s, side green 24 s and 3 s amber. Arterial greens start at 0 s, 5 s and 3 s at the three junctions.
  - The middle light follows the first by the eastbound driving time, so groups get through all three.
  - The last light turns red 2 s before the middle one, so westbound traffic isn't caught in the short block.
  - Eastbound stragglers are caught there instead, filling it and holding traffic back at the middle junction.
- **Demand:** arterial entries weigh 1 and side streets 0.25. Destinations favour the arterial exits (1 against 0.2). No trip leaves by the road it came in on (gateways within 1.5 tiles).
- **Driver fixes from Main Street:**
  - Traffic a red light will hold doesn't count as conflicting.
  - A driver waiting at the line to turn, or already committed and pulling away, finishes the turn on amber.
  - A driver stopped by their own junction's light drops their commitment.
  - At a lane split, a vehicle on the other branch counts as the car ahead until its rear is 3 m clear.
- **Measures:**
  - A queue is the vehicles held up (below 1 m/s) whose next control is that approach.
  - Peaks are tracked per run.
  - Average travel time covers finished trips, shown with their count.
  - Approaches are named "Junction n · eastbound", grouped as the simulation drives them (lane-connected junction pieces) and numbered west to east.
  - Play after a run ends measures the continued run afresh.
- **Results card:** opens above the scene pill when a run ends. Since P3 (#33), it leads with the run's label (scene · intensity · duration) and four headline numbers; this run beside the previous one is the full table behind **Show details**. See the P3 notes below.
  - Every measure shows its sample: travel time with its trip count, blocked trips "of N due", and peak queue "· N approaches".
  - Screen readers hear "Run ended" without focus moving.
  - It hides on the next start. Closing it leaves a "Show results" button that reopens it. Live queue counts float as amber badges over each approach and are hidden at zero.
- **Before/after:** checked at the session seam on Main Street: retiming the middle junction and pressing Restart gives exactly the same arrivals (the simulation keeps an arrivals log) and different peak queues. Changing timings in the UI arrives with the editor (T12).

## Market Roundabout notes (T8) — 2026-11-12

- **Layout:**
  - A 3 × 3 roundabout at (7.5, 7.5) with four arms to the edges.
  - A signalled pedestrian crossing at column 11, two tiles past the east exit.
  - A T-junction at column 13 whose north arm is the open connection.
- **Demand:** west 0.6, north 0.45, east 0.25, south 0.2, about 15 trips a minute at Medium. A single-lane roundabout carries roughly 20; the first weights (summing to 2.5) jammed it at Medium.
- **Crossing:** a 48 s cycle with a 15 s red. At Medium its queue fits in the two tiles before the circle; at Congested it spills back into the circle.
- **Opening other presets before the carousel:** the dev server opens another preset with `?scene=<id>` (`src/scenes/presets.ts` lists them). Production always opens Main Street until T11.

## School Run notes (T9) — 2026-11-12

- **Layout:**
  - A divided 70 km/h main road on rows 3–4. Its signalised two-tile junction at column 8 has a side street north.
  - A 22 km/h shortcut on row 11 with an all-way stop at column 8, which has a street south.
  - School frontage on the shortcut at 20 km/h: a zebra crossing (col 10), the school driveway (P1, col 11) and a drop-off lay-by (cols 12–13). The sketch puts `z` and `d` both in column A; the lay-by needs two tiles, so the frontage spans columns A–D.
  - 60 km/h links at columns 1 and 14 give way where they join the main road and the shortcut (yield signs, so the links never take priority).
  - The shortcut's T at column 4 has an open south arm. Free grass between the roads leaves room for another junction control or traffic calming.
- **Tuning:** the limits make the shortcut about 1.4 s quicker than the main-road detour in quiet traffic, so the queues of the school peak tip some drivers onto the main road.
- **Speed limits per piece** (`speedLimit`, km/h, 10–120; default 50):
  - Drivers keep the limit of the lane they're on, adjusted by their speed factor.
  - They slow before a lower limit at their comfortable braking rate, firmly once over it.
  - Routing uses the limits.
- **Driveways** are labelled P1, P2, … (west to east) and can start and end trips.
  - A trip leaving a driveway waits at the mouth like a driver at a line.
  - Its patience builds and it keeps its place in turn.
  - It pulls out (at most 3 m/s) only when the junction checks allow it.
- **Timed peaks:**
  - A scene's demand can add peaks, in run seconds, scaled by intensity. School Run sends parents to P1 from 10–60 s and back out from 20–70 s.
  - Peak trips draw from their own random sequence, so adding a peak leaves every other trip unchanged (tested).
  - The peak applies to the run that starts from Ready, which is what Restart replays. A run continued after the end doesn't repeat it.
- **Fixes found on School Run:**
  - No route makes a U-turn across a multi-tile junction (from one carriageway of a divided road into the other).
  - A driveway's way in and way out conflict at the mouth.
  - Where lanes split (junction entrances, a lay-by peeling away), a vehicle blocks the split until its rear is past the point where the branches are 2.2 m apart. Splits off a roundabout ring keep the fixed 3 m.
  - A vehicle straddling a merge point always counts as the car ahead.
  - At a merge, a crawling queue counts as queued.
  - A crossing stays reserved until the holder's rear is 2 m past it.

## Flyover Bottleneck notes (T10) — 2026-11-12

- **Layout:**
  - A divided 70 km/h route runs west to east. Eastbound drivers can turn off at the T in column 1.
  - The route narrows to one lane each way at a road split in column 5, climbs two ramps, crosses the bridge over the north–south surface road (column 8), descends, and widens again at column 11.
  - The alternative merges back under a yield at the T in column 13.
  - The 60 km/h surface alternative on row 11 has a signalled crossroads with the surface road. Its T at column 13 leaves the east arm open.
- **Deviation from the sketch:** the narrowing is at column 5, not 3. With it right after the turn-off, the queue formed before the turn-off, where it delays both routes alike, so no driver could ever see a reason to divert.
- **Levels:** bridge lanes and the road below are separate pieces with no connection and no conflicts; only ramp lanes change height (tested).
- **Climbing:**
  - Rising lanes cost every vehicle g × grade, capped at a realistic 5 % (the kit's ramps look steeper) and at 60 % of the vehicle's pull, so a loaded truck can still restart on the ramp.
  - A car still pulls away up the ramp; a heavy truck barely can (tested against the same truck on flat road).
  - Downhill, drivers hold their speed: there's no free acceleration past the limit (tested).
- **Entry lanes:** a trip entering a multi-lane road takes the emptier lane when its route is within 3 s of the best, so both lanes fill and drivers reach the narrowing from either side.
- **Route choice now also sees:**
  - trips kept waiting outside an entry growing impatient;
  - at least two drivers on a lane going under half the speed they'd like (the time lost crossing it), so a lone tractor or cars pulling away on green don't count;
  - a queue standing still for longer than a red light (30 s), which adds that extra wait.

  So a breakdown on the bridge (`breakDown(id, until)`, the seam the test uses) sends some eastbound drivers by the alternative. In ordinary heavy traffic the alternative's own signal and merge congest too, so few divert.
- **Merging at the narrowing:** drivers pick the emptier lane as they enter and merge where the lanes meet, taking turns at the split. There's no lane changing, so drivers can't choose to merge early: that waits for a lane-change model.
- **Demand:** west entry 2 (most traffic heads east over the flyover), east 0.4, surface road 0.3 each. School Run's "not stuck" bound is now 120 s: its drop-off peak queues at the all-way stop.

## Scene carousel and saving notes (T11) — 2026-11-12

- **Carousel:** the pill's ‹ › cycle Main Street → Market Roundabout → School Run → Flyover Bottleneck → Blank board, wrapping both ways.
  - Each scene opens in Ready with its own layout, demand, warm-up traffic and camera framing.
  - The arrows are locked while a run is under way, running or paused.
  - Save and Reset work whenever edits do: in Ready, Paused and Ended. Reset also clears the run back to Ready.
  - The dev server can still open a scene with `?scene=<id>`.
- **Scene store** (`src/scenes/sceneStore.ts`): the designer's scenes, plus a saved version per scene in this browser (`localStorage`, key `traffic-sim:scene:<id>`; memory when storage is blocked), plus the unsaved edits on screen.
  - Save appears only with unsaved edits; Reset appears whenever the network differs from the design.
  - A saved version that no longer loads is ignored.
- **Leaving with unsaved edits** asks "Leaving resets the road network to default." with Save and switch, Discard and switch, and × (or Escape) to cancel.
  - "Default" is the scene's saved version when there is one, as round 4 says (a save overrides the default). Otherwise it's the design.
  - If the browser won't keep a save (storage full or blocked), Save says "Couldn't save" and stays offered.
- **Robustness:**
  - If a scene fails to load, the pill stays usable and the error offers "Reset to the designer's network" when a saved version is open.
  - Leaving a scene frees the GPU resources it created.
  - Focus returns to the arrow used.
- **Blank board:** a one-tile stub in the middle of each edge, each an entry/exit point with an open end. No trips run until the player joins edges up.
- Edits arrive with the editor (T12). Until then, the dev-only `__trafficDebug.editScene()` stands in, to check Save, Reset and the dialog in the browser.

## Editor notes (T12) — 2026-11-12

- **Parts:** a Parts button in the dock opens a drawer above it with six groups: Roads, Curves, Junctions, Ends, Flyovers, Controls. Parts are labelled with text; there are no rendered thumbnails yet.
- **Placement rules** (`src/editor/placement.ts`) are shared by the preview and the drop.
  - A piece snaps to the nearest open road end its port can meet (within 1.1 tiles), taking that end's height. A straight piece also takes its one-way direction.
  - Otherwise it goes on the grid under the pointer.
  - Invalid placements say why: "Off the board", "Something's already there", "Ramp needed to connect these heights", or the lane builder's mismatch reason ("Lane directions don't match" and so on).
  - Controls go on the nearest approach (within 0.8 tile) to a junction or crossing, replacing any control already there.
- **Dragging:** a translucent copy of the part follows the pointer at the exact position, rotation and height it would land. It's blue when valid (with a ring on the connection it makes and "✓ Connects here" or "✓ Place here") and red with a dashed "✕ reason" when not.
  - R or the Rotate button turns it.
  - Escape, or dropping it invalid or off the map, changes nothing.
- **Selecting:** click a piece or control.
  - The inspector offers Rotate, Remove, and Replace with another part of the same group. Signals also get green, amber, red and offset in seconds.
  - Drag a selected piece to move it, with the same preview.
  - Delete or Backspace removes it.
- **Undo and redo:** buttons in the drawer, plus Ctrl or ⌘ Z and Shift Ctrl or ⌘ Z, over whole-scene history. Opening another scene starts a fresh history.
- **When edits apply:** in Ready, Ended and Paused. The parts are disabled while traffic runs.
  - Paused mid-run, the run carries on over the edited network (`TrafficSimulation.continueFrom`). The clock, counts and arrivals continue; vehicles stay put and reroute; vehicles on removed road leave and count as blocked.
  - In Ready, or after a run ends, it starts afresh from Ready.
- An edit makes the scene unsaved: Save and Reset apply, as in T11.
- **Review fixes:**
  - Entry letters follow position round the board, so an edit that adds or removes an edge road moves them. Each edit's demand (entries, destinations, peaks) is moved to stay on the same road ends, and carried-over vehicles keep heading for the same end.
  - Vehicles keep as much of their route as still exists, with their commitment and crossing reservations, so a vehicle committed to a junction clears it.
  - Controls can be moved (drag the selected sign) and replaced (inspector). Their preview stands and faces exactly as the placed sign will.
  - The selection gets a pink outline on the map.
  - Keyboard placement: Enter (or Space) on a part, arrow keys move it a tile, Space or R turns it (P6), Enter drops, Escape cancels.
  - A release over a panel drops nothing; the preview hides and says "Drop it on the map". Pointer capture is released, so touch and pen drags reach the map.

## Verification and delivery report (T13) — 2026-11-12

- **Deployed app:** https://traffic-sim-one.vercel.app (production, from `main`).
- **The four presets:** Main Street, Market Roundabout, School Run and Flyover Bottleneck, plus the Blank board. `node scripts/verify-browser.mjs https://traffic-sim-one.vercel.app/` cycles the scene pill through all five, presses Play on each preset and checks that the clock passes 0:01. All four ran, with no page errors. The script's exit code now fails if any of the T13 checks fails.
- **Behaviour checks.** These run in the test suite (`npm test`), driving the real simulation, rather than in the browser:
  - signal timing shifts queues: `junctions.test.ts`, "shifts where queues form when a signal's timing changes";
  - a stop sign changes who goes first: `junctions.test.ts`, "changes who goes first when a stop sign is added";
  - closing a connection diverts eligible trips, and blocked trips are counted: `routing.test.ts`;
  - the flyover and the road below interact only through ramps (levels change only on the ramps, and a stopped car below doesn't slow the bridge): `flyoverBottleneck.test.ts` and `buildLaneGraph.test.ts`.
  - The browser check covers the before/after edit below.
- **Before/after in the browser:** run Main Street for 30 s, select Junction 1's light (through the debug hook; clicking a sign on the map is covered by the T12 checks), set the arterial green to 8 s, apply it and run again. The results card puts the two runs side by side ("This run" and "Previous run") with the same arrivals (checked), and the peak queues differ (Junction 1 westbound 2 → 3, eastbound 4 → 2). Screenshot: `artifacts/3d/previews/25-before-after.png`.
- **A scenario built on the Blank board through the UI:**
  - From the Parts drawer, the check drags 27 straights and a crossroads into a plus shape across the board, rotating with R for the north–south arm. It then drags a traffic light onto each of the four approaches.
  - All 31 drops previewed as valid before release. The scene then held exactly those pieces and controls.
  - A 90 s run at Medium reached the results card: 70 trips due, 43 entered, 11 finished. Its peak queues were measured per approach, and Save stored the 31-piece layout in the browser.
  - The 30 s default is too short for any trip to cross the 16-tile board through one default-timed light, so this check uses 90 s.
  - Screenshots: `artifacts/3d/previews/26-blank-board-built.png` and `artifacts/3d/previews/27-blank-board-results.png`.
- **Element types counted toward the 60% target:** 15 of 22 (68%). See the final count in `assets/3d/ASSETS.md`.
- **Open for the owner:**
  - which side of the road traffic drives on (right assumed);
  - whether to retire the road-texture strip;
  - the Flyover narrowing column;
  - picture thumbnails for the parts drawer (parts are text labels).
- **Not modelled:** lane changes and merging early.
- **Known flaky check:** the visible-window joystick drag in the browser check fails intermittently. It predates this work.

## Results headlines (P3, #33) — 2026-11-13

- **Layout** (owner's choice of four numbers): trips finished ("of N due"), average travel time ("over N trips"), longest queue (with where), and blocked trips ("of N due"). Above them, the run's label. **Show details** opens the full table and stays open or closed across runs.
- **Comparing:** each number shows its change only against a previous run of the **same scene, load and duration**, so the change comes from the player's edit. Otherwise the caption says "not compared: the previous run was …", and no arrows show.
  - Travel time is subtracted before rounding (21.2 → 21.6 s is ±0, not ▲ 1).
  - The longest queue is compared by size even if it moved. The tooltip says where it was ("5 at Junction 1 · westbound").
- **Look:** better is a filled accent badge ▲/▼ n, worse an outlined pink badge, and unchanged a plain ±0. Shape and colour both carry the verdict, and screen readers hear "Better than the previous run (…)" instead of the arrows. Contrast: the better badge is white on `--color-accent-strong` (6.0:1 in light mode) and ink on the accent in dark mode (6.6:1); the worse badge text is 5.3:1 (light) and 9.2:1 (dark).

## Dock icons (P2, #32) — 2026-11-13

- **Icons:** [Phosphor](https://phosphoricons.com) via `@phosphor-icons/core` 2.1.1 (MIT licence), imported as raw SVG at build time (`src/components/icons.ts`). Icons take `currentColor` and are hidden from screen readers; each control keeps its text label or `aria-label`. Play and Pause use the fill weight; the rest use bold.
- **Dock order:** Play/Pause, Restart, then the clock and progress bar with the run length (clock icon, 30/60/90 s) beside them | Intensity (gauge icon) | Parts (wrench and hammer).
- The camera panel's zoom and theme buttons use Phosphor plus, minus, moon and sun.

## Parts tray (P5, #35) — 2026-11-13

- **Pictures:** `renderThumbnails` (`src/three/thumbnails/partThumbnails.ts`) draws each part's model along the map's starting view diagonal, under the scene's own lights. It uses a short-lived 112 px WebGL context that it frees afterwards.
  - This runs the first time the tray opens, not at start-up, and each picture appears as soon as it's drawn.
  - A model that won't load is skipped; its tile keeps just its name.
  - The editor's models are loaded once and cached (`main.ts`), and are shared by the pictures and the drag preview. The preview tints its own copies and no longer disposes the shared materials.
- **Placement:** the tray sits bottom-right, `--tray-width` (320 px) wide.
  - On opening (and on resize), the editor measures the camera panel and the dock to set `--tray-top` (below the camera panel) and `--tray-bottom` (beside the dock if there's room, otherwise above its top edge).
  - The tray scrolls when the window is short.
- **The map stays in view:** while the tray is open, `fitCameraToViewport(…, coveredRight)` centres the view in the space left of it. It renders part of a wider virtual view, so the camera's position, orbit and the run are untouched.
  - The browser check confirms the board's four corners stay clear of the tray at 1440×900 and 1280×800.
- **Tiles:** three to a row, with the picture above a name of up to two lines. The lane note stays in the tooltip.
- **Removed:** the old full-width strip drawer rules.

## Space turns a part (P6, #36) — 2026-11-13

- **Owner's choice:** while a part is being placed (dragged, or moved with the keyboard), each Space press turns it a quarter. A held Space doesn't keep spinning it. Otherwise Space pans the map as before.
- `placementKeyAction` (`src/editor/placementKeys.ts`, unit-tested) decides what each placement key does:
  - Space or R turns the part;
  - Enter drops a part placed with the keyboard (Space no longer drops it);
  - Escape cancels.
- The editor handles these keys in the capture phase, ahead of the map's Space-pan, and only while placing. With nothing being placed, R just sets the next part's turn and the key carries on as usual. Key-ups always pass through, so the pan state can't stick.
- **Tip:** the first placement of a road piece shows "Press Space to turn it" under the ✓/✕ label. It's remembered in this browser (`traffic-sim:space-turns-tip-seen`) once shown, and isn't shown for signs, where turning doesn't apply.

## Scenery (P8, #38) — 2026-11-13

- **Source:** the Kenney Nature Kit, supplied by the owner. The choice of models, scale and placement rule are recorded in `assets/3d/ASSETS.md`.
- **Placement:** scenery goes on tiles no road covers and stays inside its own tile, so it never touches a road. It is decoration only: the simulation and the editor ignore it (picking only looks at road pieces and controls).
- **Edits:** the scenery is worked out from the scene, so placing a road on a tile clears that tile's trees, and removing a road lets the tile grow some.
- **Room for traffic furniture:** scenery keeps clear of the spots beside every road end, where a sign would stand on either side and where an open end's "+" marker goes. It does so whether or not one is there now, so adding a sign never moves a tree.
- **Known:** while a road is dragged over trees, they stay until the drop, then disappear with the new layout. The road lands exactly where the preview shows.
- **Drawing:** one instanced mesh per part of each model (under 40 meshes for a board), and only trees cast shadows. Cost while running: GPU time up 10–25% (Main Street at Congested: 125 → 137–154 ms/s); idle stays 0.

## Topographic backdrop (P9, #48) — 2026-11-13

- **What:** the owner's contour drawing (three hills), ringed by generated contours out to the screen's edges, sits over the faint vertical columns (P4). Both are kept: the columns give colour, the contours give texture.
- **How:** a fixed `body::before` layer whose background colour (`--backdrop-contour`) is masked by `public/images/topographic.svg` at `center / cover`, so lines are 1.2 px at every size and follow the theme toggle. `#app` sits above it. It's CSS only: the 3D view, the panels and the idle cost (0 draws) are unaffected.
- **Asset record:** `assets/ui/ASSETS.md`; the generator is `scripts/build-topographic.mjs`.

## New pieces join the roads they touch (P10, #50) — 2026-11-13

- **Owner's request:** a road placed against another should join it. Before, a straight dropped perpendicular to a straight was placed but left unconnected.
- **The rule** lives in the shared placement code (`placePart`), so the preview and the drop agree. When a new piece's road end meets the middle of a side of a plain road piece, that piece grows an arm there:
  - a straight or a bend becomes a T-junction;
  - a T-junction becomes a crossroads.
- **And the other way round:** when an old open road end meets the side of the new piece, the new piece grows the arm. A straight laid across a road's end becomes a T.
- **What can grow an arm:** one-tile, ground-level, two-way pieces without a speed limit (straight, bend, T-junction). Pedestrian crossings, one-way carriageways, ramps, bridges and multi-tile pieces are left as they are. *The owner confirmed these exclusions on 2026-11-13.*
- **Signs and demand:** signs on a grown piece stay on the approach they were on, by compass direction. Demand follows its entries, as for any edit.
- **Snapping:** the preview snaps to these join points when the pointer is over the tile the new piece would take (within 0.6 tile). Open road ends keep their wider 1.1-tile snap, so a drop on top of a road still says "Something's already there".
- **Only new pieces join.** Moving, turning or swapping a piece that's already placed never grows junctions, so signs stay on their approaches and turning a piece doesn't change its neighbours.
- **Heights:** only ground-level road ends join a road's side. A ramp's foot can; a bridge deck or a ramp's top can't. No snap ever puts a piece below the ground.
- **Preview:** it shows each piece that will become a junction as a translucent copy of its new shape (and the new piece as its junction shape, when it grows), labelled "✓ Makes a T-junction" or "✓ Makes a crossroads". Undo restores the original pieces.
## Vehicle card (P11, #52) — 2026-11-13

- **Opening it:** clicking a vehicle opens its card in the road inspector's place and style (top-left), whether the run is going or paused. Clicking a road piece switches back to the road inspector, and × closes the card.
- **Contents:** built by `describeVehicle` (unit-tested):
  - **Vehicle:** the type's length, top speed, strongest acceleration and hardest braking.
  - **Driver:** every preference drawn for this driver, namely profile, speed against the limit, following time, smallest gap, acceleration used, comfortable braking, gap accepted at junctions, how often they obey signs and signals, patience, how often they let others out, and how much they watch for queues.
  - **Now:** position (tile), the piece it's on, heading, speed, wanted speed, acceleration, what it's doing, and time held up.
  - **Trajectory:** the exit (or driveway) it's heading for, the distance left, and the next pieces.
- **On the map:** the remaining route is drawn as a 4 px pink line from a ring at the vehicle to its exit.
- **Updates:** the card refreshes every 200 ms. Only the values change, so the × is never rebuilt under a click. The route is redrawn only when it moves, so a paused run with the card open costs nothing. A vehicle that leaves the board is marked "left the board", and its route disappears.
