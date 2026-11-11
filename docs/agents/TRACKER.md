# Project tracker

Tracker: **GitHub Issues** on `the-pushh/traffic-sim` (owner's choice): plan issue [#1](https://github.com/the-pushh/traffic-sim/issues/1). This file mirrors the plan issue and is synced to it after every update. Statuses: `todo` · `in progress` · `done` · `blocked`.

## Plan 00 — First runnable version (setup + starter scene)

Scope: repo setup, asset inventory, one starter scene with a supplied vehicle on a textured road, observer camera basics and **Reset View**. Traffic engine, timed runs, editor, saved maps, and remaining presets are follow-up tickets.

| # | Task | Status | Verification note |
| --- | --- | --- | --- |
| 1 | Read the docs, check skills, flag conflicts | done | Read CLAUDE.md, START_HERE, design, WORKFLOW, REPO_STRUCTURE, 3D_SETUP, 3d-project.json. Checked installed skills via Claude Code skill list. Flags recorded below. |
| 2 | Set up the repo (toolchain, deps, dev/build) | done | No app existed; added Vite 8.3.8 + Three.js 0.187.0 + TypeScript 7.0.2 + Vitest 5.1.0 via npm 11.19 (Node 24.20). `npm run build` produced `dist/`; `npm run dev` served `/` with HTTP 200. `.gitignore` already covers `node_modules/`, `dist/`, `assets/3d/source/*`, previews. |
| 3 | Inventory the Kenney assets → `assets/3d/ASSETS.md` | done | Extracted each ZIP to its own `assets/3d/source/` folder; ZIP SHA-256 unchanged after extraction. Parsed GLB headers for texture deps, axes, bounds. All CC0. Picked `sedan.glb`, `road-straight.glb`, `roadTexture_01.png`; copied to `public/`. |
| 4 | Build one starter scene (vehicle, textured road, camera, Reset View) with TDD | done | Owner approved seams: camera controller, asset manifest, initial framing. Vitest tests written red→green one slice at a time (framing tilt, fit at 4 aspects, Reset View, pan directions, drag-pan follows pointer, tilt/zoom limits, asset deps); passing-first tests were mutation-checked and fail on mutants. Scene + mouse wiring built. Browser check found and fixed road tiles rotated 90° and a too-small ground plane. |
| 5 | Verify in browser, update `README.md` and `3d-project.json` | done | Claude-in-Chrome extension not connected, so drove installed Google Chrome 157 via `playwright-core` (`npm run verify:browser`, headless and in a visible window, GPU WebGL on M1 Pro) on dev and production builds: 0 console errors, 5/5 assets HTTP 200, pan/orbit-tilt/zoom each change the view, Reset View frame pixel-identical to start; overhead + angled screenshots inspected; asset-failure state names the file with focused Retry, which recovers. `npm test` 18/18, `npm run build` ok. README run command and `3d-project.json` (`setupVerified: true`) updated. |
| 6 | Review, commit, PR, hand off | done | `mattpocock-skills:code-review` ran Standards and Spec reviewers. Fixed: loaders moved to `src/three/loaders/` and deduplicated; raw colours replaced with tokens; pan pixel maths moved into `ObserverCamera.dragPan` (TDD); Retry no longer re-attaches listeners and keeps focus; camera buttons disabled while loading; grabbing-cursor CSS bug; clearer names. Remaining notes are in the follow-ups below. Commit `af09370` pushed on `feat/00-setup-starter-scene`; PR [#2](https://github.com/the-pushh/traffic-sim/pull/2) **merged** by the owner (squash) as `2e486b4` on `main`, 2026-11-11; verified on GitHub. |
| 7 | Laptop-friendly camera: Hold Space + drag on the map pans (plain drag reserved for the editor); on-screen joystick orbits/tilts as the primary control; right-drag stays an optional shortcut | done | Owner feedback on PR #2: left/right drag can't be the primary control on laptops; owner chose the joystick. TDD: `dragGesture` + `mapClaimsSpace` (8 tests), `CameraJoystick` (6 tests); 32/32 pass, build ok. Review (Standards + Spec) found Space ignored when a control had focus and Space-release pressing the focused button; fixed, middle-drag dropped as unagreed. Browser (headless, 3× visible Chrome, production): plain drag doesn't move the view; Space+drag pans incl. with joystick/Reset View focused; joystick drag + arrow keys orbit/tilt and stop on release; Reset View pixel-identical. DOM widget code is covered by the browser check, not unit tests (agreed seams). |
| 8 | Default camera at 45°; ground as a 1:1 square board with rounded corners and thickness, with roads and vehicle on its top surface | done | Owner request after PR #2 review. TDD: start-tilt test changed to 45° (red→green); `squareBoard`/`starterFootprint` (3 tests: square, centred, margin clear of rounded corners); framing now fits the scene exactly (binary search to 90% of screen) with long-road and square-board cases at 4 aspects; 39/39 pass, build ok. Board = extruded rounded square, 1.2 thick + 0.2 bevel, top face measured at y = 0. Browser (headless, visible Chrome, production): all camera checks pass, no errors; 45° start view and zoomed angled view inspected. |
| 9 | Board at half thickness; camera starts on the cube diagonal (equal angles to X, Y, Z); board big enough for the planned scenes | done | Owner request; owner approved tasks 1–8. TDD: start pose test now requires the camera offset along (1,1,1) (red→green); board tests require 16 × 16 tiles (64 units) holding the starter roads clear of the corners, and a 0.8 edge (was 1.6). 39/39 pass, build ok. Shadow area widened to cover the board. Browser: headless and production pass; visible-window check failed once (output not captured) then passed twice, so it is treated as an intermittent flake. Diagonal start view inspected. |
| 10 | Plan the experience from app entry to running the simulator: presets, driver and vehicle agents, editing, delivery; agree tickets | done | Grilling rounds 1–5 (installed `mattpocock-skills:grilling` in place of the missing `/grill-with-docs`). Owner plans `PRESETS_PLAN.md` and `BEHAVIOUR_PLAN.md`; spec `docs/agents/specs/sim-experience.md`; layouts `preset-layouts.md`; asset and vehicle types in `ASSETS.md`. Owner agreed the spec and the T1–T13 breakdown on 2026-11-12; tickets published as issues #3–#15. |

## Plan 01 — Traffic simulator build

Spec: `docs/agents/specs/sim-experience.md`. Each ticket is a GitHub issue with acceptance criteria; this table mirrors their status. Statuses: `todo` · `in progress` · `in review` (PR open) · `done` (merged and verified) · `blocked`.

| Issue | Ticket | Blocked by | Status | Verification note |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/the-pushh/traffic-sim/issues/3) | T1 — Dock and run controls | — | in progress | |
| [#4](https://github.com/the-pushh/traffic-sim/issues/4) | T2 — Vercel deployment | T1 | todo | |
| [#5](https://github.com/the-pushh/traffic-sim/issues/5) | T3 — Driving core on one lane and one light | T1 | todo | |
| [#6](https://github.com/the-pushh/traffic-sim/issues/6) | T4 — Lane network and scene format | — | in progress | |
| [#7](https://github.com/the-pushh/traffic-sim/issues/7) | T5 — Junction behaviour | T3, T4 | todo | |
| [#8](https://github.com/the-pushh/traffic-sim/issues/8) | T6 — Routing | T3, T4 | todo | |
| [#9](https://github.com/the-pushh/traffic-sim/issues/9) | T7 — Main Street preset, measures and results card | T5 | todo | |
| [#10](https://github.com/the-pushh/traffic-sim/issues/10) | T8 — Market Roundabout preset | T5, T7 | todo | |
| [#11](https://github.com/the-pushh/traffic-sim/issues/11) | T9 — School Run preset | T6, T7 | todo | |
| [#12](https://github.com/the-pushh/traffic-sim/issues/12) | T10 — Flyover Bottleneck preset | T6, T7 | todo | |
| [#13](https://github.com/the-pushh/traffic-sim/issues/13) | T11 — Scene carousel and saving | T7 | todo | |
| [#14](https://github.com/the-pushh/traffic-sim/issues/14) | T12 — Editor | T6, T11 | todo | |
| [#15](https://github.com/the-pushh/traffic-sim/issues/15) | T13 — Verification and delivery report | all | todo | |

## Flags from task 1

- **Transcript missing.** The owner's request says to use a supplied transcript, but none was attached. Worked from `START_HERE.md` and `design.md`.
- **Named skills missing.** `WORKFLOW.md` names `/setup-matt-pocock-skills`, `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`; none are installed for Claude Code in this project. Installed and used: `mattpocock-skills:tdd`, `mattpocock-skills:code-review`, `mattpocock-skills:pr`. Not installed from an external source in this session; reported instead.
- **Session rule conflict.** `WORKFLOW.md` prefers a fresh session per ticket; `CLAUDE.md`/`START_HERE.md` require one session. One session wins (CLAUDE.md says so).
- **Planning flow vs. this request.** `WORKFLOW.md` puts grill → spec → tickets before implementation; the owner's request scopes this session to six setup tasks, so the full spec/ticket flow is deferred to the next session step.
- **Deploy.** `START_HERE.md` says build and deploy; this request stops at the first working local version. No deployment yet.
- **`ROAD_SCENES.md`** is referenced by `design.md` but is not in the repo.
- **Two `code-review` skills** exist (built-in and `mattpocock-skills:code-review`); used the Matt Pocock one per `WORKFLOW.md`.

## Known limitations of this version

- The road texture (`roadTexture_01.png`) is shown on a separate strip beside the road-piece road, which uses the City Kit's own `colormap.png`. The car drives only on the road-piece road. Choosing one road-surface approach is a follow-up decision.
- The framing unit tests use representative boxes (a long road and a square board), not the bounds computed from loaded assets; real-scene framing is checked in screenshots. Framing is computed at load and not recomputed when the window is resized.
- The visible-window browser check (`verify:browser:headed`) is intermittently flaky (timing-sensitive screenshot comparisons); headless is stable.
- Three.js makes the JS bundle 600+ KB (Vite chunk-size warning). No code splitting yet.

## Earlier proposed follow-ups

Superseded by Plan 01 above (agreed 2026-11-12).
