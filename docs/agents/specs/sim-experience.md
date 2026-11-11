# Spec: traffic simulator — presets, driver agents, editing, delivery

Parent: issue #1. Sources, in order of precedence: owner decisions `docs/agents/decisions/sim-experience.md` (rounds 1–5 and the layout constraint) · `docs/agents/BEHAVIOUR_PLAN.md` · `docs/agents/PRESETS_PLAN.md` · `docs/agents/design.md` · `docs/agents/START_HERE.md`. Layout sketches: `docs/agents/specs/preset-layouts.md`. Assets: `assets/3d/ASSETS.md`.

## Goal

A player opens the app on **Main Street** with traffic already on the roads, picks a traffic intensity and a run length, presses Play, and watches individual drivers deal with signals, roundabouts, merges and a flyover. They edit a road or control, rerun the same arrivals, drivers and vehicles, and compare the numbers. They can also build their own network on a blank board.

## Screen

Full-window 3D view (cube-diagonal start, 64 × 64 board), no header bar.

```text
┌──────────────────────────────────────────────────────────┐
│                                            ┌──────────┐  │
│     hover a vehicle:                       │ joystick │  │
│     "Truck · Assertive · Braking for the   │  +  −    │  │
│      car ahead"                            │ Reset    │  │
│                                            │ View     │  │
│              ┌──────────── results card ─────└──────────┘│
│              └───────────────────────────────────┘       │
│              ( ‹  Main Street  ›  [Save] [Reset] )       │  scene pill
│  ┌──────────────────────────────────────────────────────┐│
│  │ ▶ ↺ 0:12 / 0:30 ━━━━░░░ │ Intensity ●●●○○ │ 30 60 90 │ parts… ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

- **Dock** (floating, rounded, bottom-centre): Play/Pause · Restart · clock and progress │ intensity (Almost empty · Low · Medium · High · Congested) · duration (30/60/90 s) │ parts section (arrives with the editor).
- **Scene pill** above the dock: `‹ Scene ›` cycles Main Street → Market Roundabout → School Run → Flyover Bottleneck → Blank board. Save appears only with unsaved edits; Reset appears when the network differs from the designer's.
- **Hover a vehicle**: "Type · Profile · Reason" (e.g. "Compact car · Cautious · Waiting for a larger gap").
- **Live queue labels** on each junction approach during a run.
- **First visit**: tip "Press Play to run 30 s of traffic", shown once.

## Run lifecycle

| State | How you get there | Intensity, duration, scene arrows |
| --- | --- | --- |
| **Ready** | Scene opens, Restart, Reset, or intensity change (rebuilds the warm-up) | enabled |
| **Running** | Play | **disabled, greyed** |
| **Paused** | Pause mid-run | **disabled, greyed**; road and control edits allowed (simulation auto-adjusts) |
| **Ended** | Clock reaches the duration: traffic freezes, results card shows | enabled |

- **Play after Ended** continues the simulation from the frozen traffic for another selected duration (clock restarts at 0:00).
- **Restart** returns to Ready with the **same arrivals, drivers and vehicles**, for before/after comparison after an edit.
- **Switching scenes** with unsaved edits asks first: "Leaving resets the road network to default." [Save and switch] [Discard and switch], × to cancel.
- **Save** overrides the scene in this browser; **Reset** restores the designer's network.


## Network model

- Pieces from the City Kit become **lane graph** segments using per-piece connection metadata (position, travel direction, elevation, lanes). 17 of the 22 traffic-affecting element types are used across the presets (target ≥ 14, see `ASSETS.md`).
- **Width and capacity** come from lane counts (divided roads, side lanes, two-to-one splits) and **speed limits** (narrow streets are slower).
- **Controls**: traffic lights (fixed-time phases, configurable timings, staggered offsets), stop signs, yield (`road-sign-warning`), roundabout entries yield to circulating traffic, lane closures.
- **Levels**: the bridge level is reachable only through connected ramps; vehicles on the bridge and the road below never interact.

## Driver and vehicle model (`BEHAVIOUR_PLAN.md`)

- Each trip gets a **driver profile** and a **vehicle type**, chosen independently. Preferences are drawn once per trip from overlapping profile ranges: preferred speed, following gap, pull-away and braking rates, accepted gap size.
- **Profiles**: Steady, Cautious, Assertive, Cooperative, Impatient. Impatience builds while delayed and eases once moving.
- **Vehicle types** (from the Car Kit): compact car, sedan, SUV, pickup, van, box truck, heavy truck, tractor. Each has its own length, acceleration, braking and turning limits. There's no bus in the kit. The mix depends on the scene.
- **Driving**: smooth acceleration and braking in response to the vehicle ahead, curves, speed limits, controls and space. Gap acceptance at roundabouts and merges. A vehicle won't enter a junction unless its exit has room for its length. Cooperative drivers make room for merging traffic.
- **Rule-following** is separate from the profile. Most drivers comply. Modest speeding or rolling a stop is decided **once per approach**, only when the road looks clear. Other drivers react to what actually happens, and every vehicle still checks for conflicts.
- **Each vehicle has a current reason** for what it's doing (e.g. "Red light", "Waiting for a gap", "Exit lane full", "Braking for the car ahead"). This is shown on hover.
- **Fixed 1/30 s simulation steps** and **seeded randomness** for arrivals, drivers and vehicles, so a Restart reproduces the same run.

## Demand

- Each preset defines its own **demand pattern**: per-entry weights (e.g. the roundabout's uneven arms) and timed peaks (School Run's local trips).
- The **intensity** control scales trips due per minute.
- When an entrance is full, trips **wait outside** and are counted.

## Measures (absolute numbers, each with its sample count)

| Measure | Shown as |
| --- | --- |
| Trips due / entered / finished | three counts |
| Average travel time | seconds · number of finished trips |
| Queue length by approach | vehicles, live and peak · per approach |
| Blocked trips | count of trips with no path |

The results card shows the latest run and the previous one, labelled with scene, intensity and duration.

## Presets (sketches in `preset-layouts.md`; all inside 16 × 16 tiles, each with free space and an open connection)

1. **Main Street**: divided arterial, three staggered signals, one-tile short block that backs up, narrower side streets.
2. **Market Roundabout**: four-arm single-lane roundabout, uneven demand, a signal just past the east exit that spills back into the circle.
3. **School Run**: wide signalised main road and a narrow, slower, stop-controlled shortcut between the same areas, plus a school driveway, crossing and a local-trip peak.
4. **Flyover Bottleneck**: divided route narrowing to one lane over a flyover. A slower surface alternative leaves before the climb and merges back after it.
5. **Blank board**: edge entry/exit points only, for the player's own scenario.

## Test seams (to agree before writing tests)

| Seam | Catches | Misses |
| --- | --- | --- |
| **Run controller** | Ends exactly at 30/60/90 s; settings and arrows lock and unlock; Play after the end continues; Restart reproduces | Dock visuals |
| **Driving core** (one lane, one light first) | Following, queueing at red, pulling away one by one on green; profile and vehicle differences (a compact car pulls away faster and fits a shorter gap than a truck); smooth speed changes | Rendering |
| **Junction behaviour** | Yield and stop priority, gap acceptance, no entry while the exit is full, staggered signals, rule violations decided once per approach | Visual timing |
| **Lane network builder** | Connections only where piece endpoints meet; ramps are the only level change; entry/exit points found | Model alignment |
| **Routing and edits** | Routes to destinations, rerouting after a closed connection, blocked trips | — |
| **Measures** | Counts and averages with sample sizes on hand-built networks | — |
| **Scene store** | Save overrides, Reset restores, unsaved-edit detection | Browser storage itself |

The dock, pill, modal, hover tag, results card and the four presets in 3D are checked in the browser (`verify:browser`), along with the plan's verification list: signal timing shifts queues, a stop or yield changes who goes first, closing a connection diverts trips, the flyover and the road below interact only via ramps, and one before-and-after edit changes the queue or travel time.

## Delivery

Deploy to **Vercel**. Report the deployed URL, the four presets, and the element types counted toward the 60% target.
