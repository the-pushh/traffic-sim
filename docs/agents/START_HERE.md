# Traffic simulation build brief

## Session scope

Use the transcript I provide as project context. Read `CLAUDE.md`, `docs/agents/WORKFLOW.md`, `docs/agents/design.md`, and their linked setup documents.

Run the project in **one coding-agent session, with a maximum elapsed duration of 72 hours**. Create one build plan with tasks underneath it. Record each task’s outcome, acceptance criteria, dependencies, status, and verification evidence. Work through unblocked tasks in the same session. This session rule takes precedence over any workflow instruction to start a fresh session for each ticket.

Use the Matt Pocock skills and delivery formats specified in `docs/agents/WORKFLOW.md`. Plan, create tickets, implement with TDD, review, commit, push, open a PR, and merge according to the repository’s rules and the authorization given in the session. Before the session ends, record what shipped, what was verified, and what remains.

## Owner’s brief

- **What the app should do** — Build and deploy a Three.js traffic simulation game. Players pick a scene, set a traffic load, and run an experiment. They can change the road network or traffic controls, then run it again to see how traffic flow changes.
- **What players should do with the objects** — Connect road pieces like building blocks. Rearrange roads, build junctions and flyovers, vary road widths and capacities, add traffic controls, and place vehicle entry and exit points. Players can edit a preset or build their own network.
- **Visual direction** — Use the supplied Kenney vehicles, road pieces, and textures. Keep traffic easy to read from overhead and angled views. Final styling and visual references are open.
- **Primary device** — Three.js web application. Design first for desktop web browsers, with mouse and scroll-wheel controls for navigating the 3D scene.
- **First version is successful when** — A player opens a preset, sets a traffic load, and completes a 30-second run. They change a junction control or road connection, repeat the run with the same load and duration, and compare the results. They can save the edited scene, reopen it, and return to the original preset.

## Required behavior

- Model each vehicle as an agent that follows a route, responds to nearby traffic and junction controls, and travels through roads of different widths and capacities.
- Offer starter scenes such as Traffic Lights, Turnaround, Flyover, and On-Ramp. Each opens with a starting layout, traffic settings, and visible vehicle entry points.
- Offer **30, 60, or 90 seconds of simulation time** per run. Stop at the chosen duration and show the results. Suggested initial measures are vehicles reaching their destinations, average wait, and longest queue.
- **Reset** restores the selected scene’s starting layout and traffic settings and clears the current run. **Save as new scene** keeps the edited setup as a separate, reusable scene.
- Give players a joystick-style camera control to orbit and tilt, scroll-wheel zoom, drag to pan, and a separate **Reset View**. Camera changes preserve the simulation and scene edits. *(Superseded by the owner on 2026-11-13, P14: no joystick; a drag on the map orbits and tilts, Space+drag pans.)*

## Assets already in the repo

Use these exact paths, relative to the project root.

| Archive | Intended use |
| --- | --- |
| `assets/3d/incoming/kenney_car-kit.zip` | Vehicle models |
| `assets/3d/incoming/kenney_city-kit-roads.zip` | Road pieces and junction construction |
| `assets/3d/incoming/kenney_road-textures.zip` | Road surface textures |

Inspect the archives and keep the originals. Extract each into its own folder under `assets/3d/source/`, checking for existing extracted files first. Record usable models, textures, formats, dependencies, and available license information in `assets/3d/ASSETS.md`. Use representative supplied assets in the first working scene.

## Build and verification

1. Inspect the repo, verify that the named skills are available, and reuse existing tools where appropriate.
2. Turn the transcript and brief into a plan with testable tasks. Ask only about decisions that materially affect the build. Continue asset inspection while waiting for answers.
3. Build and verify one representative scene in the browser before expanding to the remaining maps. Use TDD for observable behavior and inspect the supplied assets, road geometry, and camera in the browser.
4. Verify that timed runs end correctly, changing the network affects available routes, Reset restores the scene, and saved scenes reopen with their edits. Verify that moving the camera preserves the run.
5. Update `docs/agents/3d-project.json` with observed facts and working commands. Record verification results, delivery status, and the deployment location once available.