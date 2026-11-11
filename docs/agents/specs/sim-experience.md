# Spec: from opening the app to running the simulation

Parent: issue #1 (plan 00, task 10). Decisions: `docs/agents/decisions/sim-experience.md` (rounds 1–4). Brief: `docs/agents/START_HERE.md`; design: `docs/agents/design.md`.

## Goal

A player opens the app, sees a scene with traffic already on the roads, picks a traffic load and a run length, presses Play, watches traffic flow through signals, and gets results when the time is up. They can run again and compare against the previous run.

## Screen

Full-window 3D view, no header bar. Floating panels:

```text
┌──────────────────────────────────────────────────────────┐
│                                            ┌──────────┐  │
│                                            │ joystick │  │
│              3D board (cube-diagonal view) │  +  −    │  │
│                                            │ Reset    │  │
│                                            │ View     │  │
│                                            └──────────┘  │
│              ┌──────────── results card ────────────┐    │  appears when a run ends
│              └──────────────────────────────────────┘    │
│                  ( ‹  Traffic Lights  › [Save][Reset] )  │  scene pill
│  ┌──────────────────────────────────────────────────────┐│
│  │ ▶  ↺  0:12 / 0:30 ━━━━━░░░░ │ Load ●●●○○  │ 30 60 90 ││  dock (rounded, floating)
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

- **Dock** (bottom-centre, rounded corners): Play/Pause · Restart · clock and progress bar │ load (5 ticks: Almost empty · Low · Medium · High · Congested) · duration (30 s · 60 s · 90 s). The parts section is added on the right, after another divider, in the editor ticket; until then it is absent.
- **Scene pill** (centred above the dock): `‹ Scene name ›`, plus a one-line suggested-experiment caption. **Save** appears after the name only when there are unsaved edits. **Reset** appears whenever the network differs from the designer's default.
- **Camera controls** stay top-right as built.
- **First visit:** a tip above the dock says "Press **Play** to run 30 s of traffic". It goes away on the first Play and is remembered in the browser.

## Run lifecycle

```text
          load scene / change load tick (rebuilds warm-up)
                │
                ▼
  ┌────────► READY ──Play──► RUNNING ◄──Play── PAUSED
  │      (frozen warm-up)      │   └──Pause──►   │
  │                            │ clock = duration
  │                            ▼
  │                          ENDED (traffic frozen, results shown)
  │                            │ Play: continue from frozen traffic, clock 0:00
  │                            └──────────► RUNNING
  └── Restart (any state): identical fresh start from the warm-up state
```

| State | Load, duration, scene arrows | Clock |
| --- | --- | --- |
| Ready | enabled | 0:00 |
| Running / Paused | **disabled and greyed out** | counting / held |
| Ended | enabled | full |

- **Restart** returns to Ready with the same seed, so the same load and duration give the same traffic. This is the strict before/after comparison.
- **Reset** (pill) restores the designer's network and default load, and clears the run.
- **Switching scenes** happens only when arrows are enabled. If there are unsaved edits, a modal says "Leaving resets the road network to default." with **Save and switch** and **Discard and switch** buttons; × at the top-right cancels.
- **Save** overrides the scene with the player's network in this browser. Reset brings back the designer's version.

## Simulation model (first version; the owner will specify behaviour later)

- **Lane graph** built from road pieces' connection points. Vehicles follow lane centrelines.
- **Car following:** keep a gap to the vehicle ahead (IDM), stop for red signals and the end of queues.
- **Signals:** fixed-time phases per junction.
- **Time:** fixed 1/30 s steps in simulation time, independent of frame rate. The run ends exactly at 30/60/90 s.
- **Arrivals:** seeded random arrivals at each entry, with a rate per load tick (internal values tuned so that Congested builds visible queues). Each vehicle gets a random reachable exit.
- **Vehicles:** a shuffled sequence of every Car Kit vehicle model, cycled so all appear evenly. Behaviour is the same for all models for now; length comes from the model.
- **Warm-up:** each scene opens paused after a seeded off-screen warm-up at the selected load.

## Results

When the run ends, a card above the dock shows these measures, labelled with scene, load and duration:

| Measure | Definition |
| --- | --- |
| Reached destination | Vehicles that arrived at their exit during the run. |
| Average wait | Mean time vehicles spent nearly stopped (below a small speed threshold) during the run. |
| Longest queue | Most vehicles stopped one behind another in a single lane at any moment. |

The previous run is shown beside it with ▲▼ change markers. The card can be dismissed.

## First scene: test crossroads

A hidden test scene that isn't in the picker: one signal-controlled 4-way crossroads in the board centre, with 4 roads to the board edges, giving entry/exit points A–D. It proves the engine while the owner designs the four starter scenes (provisionally Traffic Lights, Flyover, On-Ramp, Turnaround) as 16 × 16 tile sketches.

## Test seams (to agree before writing tests)

| Seam | What the tests catch | What they miss |
| --- | --- | --- |
| **Run controller** (Ready/Running/Paused/Ended; play, pause, restart, tick; settings-locked flag) | Run ends exactly at the duration, settings and arrows lock and unlock at the right moments, Play after the end continues, Restart resets | Visual state of the dock |
| **Simulation core** (`network + settings + seed → step(dt) → snapshot / results`), pure TypeScript with no Three.js | Same seed gives the same results; vehicles stop at red and queue; vehicles only use connected lanes; measures are computed correctly on small hand-built networks | Rendering, animation smoothness |
| **Lane network builder** (road pieces + placements → lane graph) | Connections only where piece endpoints meet; entry/exit points found at the board edge | Visual alignment of models |
| **Scene store** (designer default, saved override, unsaved edits; save, reset, discard) with an in-memory storage adapter | Save overrides, Reset restores the designer's network, unsaved-edit detection | The browser's actual storage |

The dock, pill, modal and results card are checked in the browser (`verify:browser`), not unit-tested.

## Out of scope here

Drag-and-drop editor and parts section, the four designed scenes, detailed driver behaviour, scrubbing and replay, playback speed, deployment.
