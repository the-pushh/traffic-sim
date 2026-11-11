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
