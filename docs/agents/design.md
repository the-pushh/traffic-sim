# Traffic simulation design specification

## Intent and platform

Build a Three.js traffic simulation game for desktop web browsers. Players choose a road network, set the traffic load, and run a short experiment. They can change the layout or traffic controls, then run it again to see how their decisions affect traffic flow.

Keep the road network and moving vehicles visually dominant. Use the supplied Kenney vehicles, road pieces, and textures. The editor should feel like connecting building blocks, with a clear preview of where each piece will land.

## Visual tokens

These are provisional interface values. Keep the interface palette separate from the materials used in the 3D scene.

| Token | Value | Use |
| --- | --- | --- |
| background | `#101318` | Workspace background |
| surface | `#1B2028` | Controls and panels |
| text | `#F4F6FA` | Primary labels |
| text-muted | `#ADB7C5` | Supporting information |
| accent | `#8EB8FF` | Selection and focus |
| on-accent | `#101318` | Text on filled accent controls |
| error | `#FF9D9D` | Errors and invalid placements |
| spacing | 4, 8, 12, 16, 24, 32 px | Layout rhythm |
| radius | 8 px | Controls and panels |
| type | System sans, 14 px body, 12 px metadata, 20 px section titles | Interface hierarchy |
| control-height | 40 px | Default desktop controls |

Use semantic token names. Check the contrast of text, focus indicators, and controls, including overlays against the 3D scene.

## Workspace layout

*Since P18 (2026-11-14), owner's decision:* phones and tablets see only a message that the app is meant for a laptop. Give most of the workspace to the 3D viewport. Put the scene picker, traffic load, run duration, Play, Pause, and Reset in a compact toolbar. *Confirmed 2026-11-11 (see `docs/agents/specs/sim-experience.md`):* the 3D view fills the window with no header bar. A floating, rounded **dock** at the bottom holds Play/Pause, Restart, the clock and progress bar, the 5-tick load control, and the 30/60/90 s select; the Parts section joins it later (*since P16: the **Customise** button with a wrench icon (owner, 2026-11-14); Reset View has since been removed*). A **scene pill** above the dock steps through scenes with ‹ › arrows. Settings and scene arrows are disabled and greyed out for the whole run. Keep camera controls beside the viewport. In edit mode, show a collapsible **Parts** drawer and an inspector for the selected piece or junction. *Since P11 (2026-11-13):* clicking a vehicle opens a card in the inspector's place with its settings, live position and trajectory, and its route drawn on the map. On narrower browser windows, let players dismiss these panels to see more of the network.

Show the simulation clock during a run and the results when it ends. Display units beside numeric settings. Label icon-only controls, show keyboard focus, and preserve scene state when panels open or the browser resizes.

Show loading progress when available. Give a blank map a clear first action, such as **Drag a road onto the map**. If an asset fails to load or its format is unsupported, identify the asset and offer a retry or replacement when possible.

## Starter maps

| Map | Starting layout | First experiment |
| --- | --- | --- |
| **Traffic Lights** | A grid with signal-controlled junctions | Increase arrivals from one side and watch where queues form. |
| **Turnaround** | A divided road with a U-turn connection | Increase the share of vehicles turning back and watch them rejoin traffic. |
| **Flyover** | Roads crossing at different heights, connected by ramps | Send more vehicles onto an exit ramp and compare its queue with traffic below. |
| **On-Ramp** | A main road with an acceleration lane and a merge zone | Increase ramp traffic and watch drivers wait for gaps. |

Give each map a starting layout, traffic settings, marked vehicle entry and exit points, and a camera position. Show a thumbnail and one suggested experiment in the picker. Switching maps loads the selected map’s starting setup and opens it paused. Use `ROAD_SCENES.md` for layout examples if it is present.

## Free Build and saved scenes

Offer **Edit this map** on every preset and **Start from scratch** in the picker. Editing a preset opens a working copy. Both paths use the same editor and Parts drawer.

### Parts drawer and drag-and-drop placement

*Since P16 (2026-11-13), owner's change:* the button is **Customise**, and the tray's header reads **Components** with "Drag a component onto the map". It has no Rotate, Undo or Redo buttons: turning is on R or Space, undo on Ctrl/⌘ Z and redo on Shift+Ctrl/⌘ Z (the keyboard hints remain for screen readers).

Group parts by purpose so players can find straight roads, curves, junctions, U-turns, ramps, flyover sections, signals, yield controls, and vehicle entry and exit markers. Show a thumbnail for each part and its lane count where applicable. *As built in T12:* parts are grouped (Roads, Curves, Junctions, Ends, Flyovers, Controls) with a lane note on each. *Since P5 (2026-11-13):* each part shows a picture of its model, drawn the first time the tray opens, and the tray docks bottom-right of the map (under the camera panel, beside the dock or above it) while the view re-centres in the space left of it, so the whole map stays in view (*since P20 the view starts zoomed in, so the board's centre stays in view; zoom out to see it all*). Entry and exit points appear automatically where a road meets the board edge, so they aren't separate parts. Offer road pieces with different widths and lane counts.

Let players **drag a part from the drawer onto the map**. While dragging, show a **translucent 3D preview** at the position, rotation, and height where the piece would land. As the piece approaches a compatible road endpoint, snap the preview into alignment and highlight the connection. *Since P10 (2026-11-13):* a straight road placed with its end against the side of a plain road piece joins it: the piece becomes a T-junction (or a crossroads), and the preview shows and names the junction before the drop. *Since P17:* only straights join; open road ends have no "+" marker. Provide a way to rotate the piece before placing it. Use the same preview when moving a piece already on the map.

Distinguish valid and invalid placements with an outline or icon as well as color. When a placement is invalid, explain why near the preview, for example **Road ends don’t align** or **Ramp needed to connect these heights**. Releasing a valid piece places it exactly where the preview showed it. An invalid drop or pressing Escape cancels the placement and restores the layout from before the drag.

### Editing and running traffic

- Let players select, move, rotate, and remove pieces, and undo or redo edits. Make selection visible against light and dark surfaces with an outline or label. Provide a way to clear selection.
- Show travel direction and the connections each piece creates. Roads crossing at different heights connect through explicit ramps or links.
- Let players change traffic demand, entry and exit points, and junction controls. If an entry has no route to its intended exit, highlight it and explain what needs to be connected.
- Pause traffic while players edit the layout. Pressing **Play** after a layout change starts a fresh run on the edited network. *Changed 2026-11-12 by the owner (round 5, Q5):* edits are allowed while paused mid-run and the simulation auto-adjusts. Play then continues the same run on the edited network: committed vehicles clear, trips reroute, blocked trips are shown. An edit in Ready or after a run ends starts afresh from Ready.

**Reset** restores the selected scene’s starting layout, traffic controls, and demand, and clears the current run. **Save as new scene** saves the edited layout, controls, and demand as a separate scene in the picker. Reopening it loads that saved setup, ready for a new run. The original preset stays available. *Changed 2026-11-11 by the owner:* **Save** (shown only with unsaved edits) overrides the scene with the player's network in this browser, and **Reset** returns to the designer's network. Leaving a scene with unsaved edits asks first ("Leaving resets the road network to default.").

## Simulation and results

Model each vehicle as an agent. It follows a permitted route, responds to signals and yields, and adjusts to nearby traffic and available space. Road widths, lane counts, connections, and junction controls affect how traffic moves through the network.

Offer **30 s**, **60 s**, and **90 s** runs measured in simulation time. End the run at the selected duration and show its results. Start with measures players can connect to what they saw, such as vehicles reaching their destinations, average wait, and longest queue. Use consistent labels and definitions across maps.

Show the scene, traffic load, and duration alongside each run’s results. Let players keep load and duration constant while comparing a layout or control change. Comparison layout (decided 2026-11-13, P3): four headline numbers with their change against a previous run of the same scene, load and duration, with the full side-by-side table behind Show details. Saved scenes are kept in the browser (T11).

## 3D presentation

Frame the whole network at the start. *Confirmed 2026-11-11:* each scene sits on a **1:1 square ground board with rounded corners and visible thickness** (16 × 16 road tiles = 64 units, 0.8-unit edge), sized to hold every starter scene. Roads and vehicles lie on its top face. Use soft, even lighting so lane markings, junction controls, vehicles, and changes in elevation are easy to read. Preserve the supplied materials and textures where they serve the scene. Use outlines, markings, and labels alongside color to distinguish selections, entry and exit points, and disconnected links.

Keep optional motion restrained, respect reduced-motion preferences for interface animation, and leave automatic camera rotation off. Follow the asset units, axes, and origin conventions in `3d-project.json`. Inspect imported models and textures before converting or rescaling them.

## Observer camera

Start with the network framed from above at a slight tilt (*since P20: twice as close as the whole-board fit; zoom out to see the whole board*). *Confirmed 2026-11-11:* the starting view looks along the **cube diagonal** (equal angles to X, Y and Z; 35.26° below horizontal, 45° around), framed so the whole board fills the view. Keep camera controls available while editing, paused, or running.

- **Drag to turn** — *Since P14 (2026-11-13; the owner removed the on-screen joystick):* a plain drag on the map turns the view. Left and right orbit around the area in view; up and down tilt between overhead and angled views. A drag that starts on the selected road piece moves that piece instead. With the map focused, the arrow keys turn the view.
- **Scroll wheel** — Zoom while the pointer is over the viewport. Provide labeled zoom buttons as an alternative.
- **Drag to pan** — Move across the map using a gesture distinct from dragging road pieces. *Confirmed 2026-11-11:* with the pointer over the map, hold **Space** and drag to pan (this works even when a camera control has focus; elsewhere Space keeps its normal meaning). *Since P6 (2026-11-13):* while a part is being placed, each Space press turns it a quarter instead (the first placement says so). Right-drag also turns the view.
- **Reset View** — Restore the selected scene’s starting camera position and angle while preserving the road layout, traffic settings, vehicles, and simulation clock.

Make camera gestures discoverable and keep ordinary page scrolling available outside the viewport.

## Acceptance criteria

- A player can select a starter map, identify its entry points, set traffic demand, and complete a run at each of the three durations. Results appear when the selected time expires.
- From both a blank map and an edited preset, a player can drag a road piece from the drawer, see a translucent preview snap into alignment, and drop it to create the displayed connection.
- A player can rotate a preview, move an existing piece, cancel an invalid placement, and undo a valid placement. The network matches the visible placement after each action.
- A player can change a road connection or traffic control and compare a second run at the same traffic load and duration. Vehicles use the routes permitted by the edited network.
- Reset restores the selected scene’s starting setup. A scene saved as a new map reopens with its layout, controls, and traffic settings.
- Orbit, tilt, pan, zoom, and Reset View preserve the scene and simulation state.
- Roads, lanes, and vehicles remain readable from overhead and angled views. Verify representative materials, textures, transparency, and shadows in the browser.
- Loading, blank-map, disconnected-route, and asset-failure states give the player a clear next action. Essential controls remain accessible when the browser window is resized.

## Decisions to refine

Confirm the final visual references, supported desktop browsers, and level of traffic realism. Measure performance using a representative scene once the target browser and hardware are agreed.