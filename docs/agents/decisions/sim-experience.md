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
- **Results card:** opens above the scene pill when a run ends and shows this run beside the previous one, each labelled scene · intensity · duration.
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
