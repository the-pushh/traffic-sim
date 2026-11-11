# Agent instructions

## Project and session scope

Build a desktop web application using Three.js. Players choose or build a road network, adjust traffic demand and junction controls, and run short traffic simulations to compare the results.

Read the owner’s supplied transcript and `docs/agents/START_HERE.md` before planning. Work in **one coding-agent session, with a maximum elapsed duration of 72 hours**. Organize the build under one plan with tickets and track progress in the configured issue tracker. Complete tickets in dependency order within the same session. This session rule takes precedence over any skill guidance to start a fresh session for each ticket.

## Read before working

All paths are relative to the repository root.

| File | When to read it |
| --- | --- |
| `docs/agents/START_HERE.md` | At the start of the session for the owner’s brief, build scope, and supplied assets. |
| `docs/agents/WORKFLOW.md` | Before planning, ticketing, implementing, reviewing, committing, pushing, opening a PR, or merging. |
| `docs/agents/design.md` | Before changing the player experience, maps, parts drawer, drag-and-drop preview, simulation controls, results, or observer camera. |
| `docs/agents/REPO_STRUCTURE.md` | Before organizing project files or importing the three supplied Kenney archives. |
| `docs/agents/3D_SETUP.md` and `docs/agents/3d-project.json` | Before importing, converting, placing, rendering, or verifying 3D assets. |
| `docs/agents/TRACKER.md` | Tracker configuration and current plan. The tracker is GitHub Issues on `the-pushh/traffic-sim`; this file mirrors the plan issue. |

## Working process

1. Inspect the project’s manifests, scripts, assets, and existing scenes. Reuse working tools and conventions. Record decisions that affect the build, and ask the owner when a missing answer materially changes the outcome.
2. Follow the Matt Pocock skill flow in `docs/agents/WORKFLOW.md`. Turn the agreed plan into tickets with observable acceptance criteria. Implement each ticket with TDD, review the result, and follow the documented commit, PR, and merge formats.
3. Use the three original Kenney ZIPs in `assets/3d/incoming/`. Preserve the archives and extracted sources. Record the input, output, tool version, and options for asset conversions. Place browser-ready assets in the configured served directory.
4. Run the relevant automated checks. For visual or 3D changes, also inspect the result in the browser using representative assets and views. For editor changes, verify that the translucent placement preview matches the final drop. For camera changes, verify that the layout and simulation state are preserved.
5. Record what changed, what was verified, and what remains open. Include a preview or deployment location when available. Before the session ends, update the plan and ticket statuses so the owner can see what shipped and what remains.

## Completion criteria

A ticket is complete when its acceptance criteria are met, relevant checks pass, and the result is recorded in the tracker. Changed 3D assets must load with their dependencies, and visual changes must be inspected in the browser. Report any check that could not be performed and any resulting limitation.

Keep requirements in the design and brief, asset conventions in `docs/agents/3d-project.json`, and working commands in the project manifests and scripts. Update the relevant document when a confirmed decision changes.
