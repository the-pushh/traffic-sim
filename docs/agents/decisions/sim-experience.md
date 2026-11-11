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
