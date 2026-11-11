# Owner's updated plan: presets, driver agents, editing, delivery (2026-11-11)

Supplied by the owner in the session on 2026-11-11. Supersedes the earlier provisional scene line-up (Traffic Lights, Flyover, On-Ramp, Turnaround) and the "same behaviour for every vehicle for now" decision. Open conflicts with earlier decisions are tracked in `docs/agents/decisions/sim-experience.md` (round 5).

Build and run an agent-based traffic simulator using the project’s existing 3D road models and application framework. Users should be able to open a ready-made scenario, watch individual vehicles drive, edit the road network or its controls, and see how those changes affect traffic. They should also be able to set up and run a scenario of their own.

## Build four playable preset networks

Inspect the existing assets and map them to working simulation elements. Across the four presets, use at least **60% of the distinct traffic-affecting element types** represented by the available assets. Count cosmetic variants as one type. Include at-grade junctions, a flyover, roads of different widths and capacities, traffic lights, a roundabout, a merge, and stop or yield controls across the set. Each preset should work as soon as it opens and have visible space and valid connections for players to extend it.

1. **Main Street.** Build a wider arterial with three signalized junctions, narrower side streets, and a short block between two lights. Stagger the signal timing so groups of cars sometimes move through together. Make the short block capable of filling up and backing traffic into the previous junction. Leave room for a turn lane or a new side-street connection.
2. **Market Roundabout.** Build a four-arm, single-lane roundabout with uneven traffic demand. Place a traffic light a short distance beyond one exit so a queue can spill back into the circle. Leave room to extend the exit or add a connection downstream.
3. **School Run.** Build two routes between the same areas. One is a wider main road with a signalized junction. The other is a narrow neighborhood shortcut with a stop-controlled junction and slower traffic. Add a peak in local trips around the school. Leave room for another junction control, a traffic-calming element, or a new local connection.
4. **Flyover Bottleneck.** Build a flyover that crosses an at-grade road, with ramps connecting the routes. Narrow the main route from two lanes to one near the flyover and provide a slower surface alternative. Vehicles should switch levels only via connected ramps. Leave room for an extra lane, a ramp connection, or changes to the surface junction.

## Make each vehicle an individual agent

Give each vehicle a destination and a route. Have it accelerate and brake in response to the vehicle ahead, curves, speed limits, traffic controls, and available space. Vehicles should yield at roundabouts, look for gaps when merging, and wait before entering a junction if their exit lane is full. Road capacity should follow from usable lanes, available queue space, speeds, and junction controls.

Give each driver stable preferences for cruising speed, following distance, acceleration, gap acceptance, courtesy, patience, and rule compliance. Use cautious, steady, assertive, cooperative, and impatient profiles as starting points with overlapping values. Keep vehicle capabilities separate from personality so, for example, an assertive truck driver still accelerates like a truck.

Include mostly rule-following behavior and occasional plausible violations such as modest speeding or rolling through a stop when the driver perceives the junction as clear. Choose whether to violate a rule once per relevant encounter. Other drivers should react to what the vehicle actually does. Let impatience build during a delay and ease once traffic starts moving, so the same driver can behave differently in free flow and in a queue.

## Let users edit, run, and compare

Let users add, move, or replace supported road pieces and controls at valid locations. They should be able to configure signal timings and place supported stop, yield, or other traffic controls at different approaches. Each placement must change how vehicles use the network. Make it clear when a piece will connect and explain invalid placements.

Support pause, resume, and replay. When an edit closes a connection, let vehicles already committed to it clear where possible, then reroute affected trips. Show blocked trips when there is no path. Let users rerun the same traffic demand and driver mix after an edit so they can compare the outcomes.

Show queue length by approach, completed trips, and average travel time. Let users select a stopped vehicle to see a reason such as “Red light,” “Waiting for a gap,” or “Exit lane full.”

## Verify and deliver

Run all four presets in the application. Verify that changing signal timing shifts queues, adding a stop or yield control changes who goes first, and closing a connection diverts eligible trips. Verify that vehicles on the flyover and the road below only interact where ramps connect them. Test one user-built scenario from setup through results.

Deploy the application using the project’s existing deployment setup. Report the deployed URL, the four presets, and which asset types count toward the 60% coverage target.
