# Owner's driver and vehicle behaviour model (2026-11-12)

Supplied by the owner in the session on 2026-11-12 as the answer to round 5 Q10. Supersedes the proposed fixed driver mix. Vehicle-type corrections against the Car Kit are in `assets/3d/ASSETS.md` ("Vehicle types").

Build the driver and vehicle behavior for the traffic simulator. Start with one lane and one traffic light. Once cars can follow each other, queue at red, and pull away one by one on green, use the same driving system in all four presets.

## Give every trip a driver and a vehicle

Choose the driver profile and vehicle type separately. A cautious driver can be in a quick car, and an assertive driver can be in a slow truck. Give each driver slightly different preferences within their profile and keep those preferences for the whole trip. The driver’s preferences determine what they try to do. The vehicle’s limits, the road, and nearby traffic determine what they can do.

## Driver profiles

- **Steady.** Keeps a consistent pace, leaves a moderate following gap, and gets into the correct lane early.
- **Cautious.** Brakes earlier, leaves more space, and waits for larger openings at roundabouts and merges.
- **Assertive.** Pulls away briskly, prefers a faster pace, and takes smaller usable openings.
- **Cooperative.** Eases off to make room for someone merging or pulling out of a side street.
- **Impatient.** Becomes more willing to overtake or try another route after a long wait. Settles back into their usual behavior once traffic moves again.

Give each profile a range for preferred speed, following gap, how quickly the driver pulls away or brakes, and how large an opening they’re willing to take. Let the ranges overlap so two drivers with the same profile can still feel different. Cars should speed up and slow down smoothly as conditions change.

Set rule-following separately. Most drivers should obey signals and stop signs. Some can exceed the speed limit modestly or occasionally roll through a stop when the road looks clear. Make that choice once for that approach. Nearby drivers should react to the movement, and vehicles should still check for conflicts and space before proceeding.

## Vehicle types

Check the existing 3D assets first. My starting guess is **compact cars, sedans, SUVs, vans, buses, and trucks**. Correct that list and include other usable types you find. Give each type its own length, acceleration, braking, and turning limits. A compact car should be able to pull away more quickly and fit into a shorter gap than a truck. A longer vehicle should also need more room beyond a junction before entering it. Use a mix that makes sense for each scene.

## Show how the behavior changes with the road

- **Main Street:** Watch how drivers pull away at different rates on green and wait when the next block fills.
- **Market Roundabout:** Watch one driver take an opening that another would pass up.
- **School Run:** Watch drop-off traffic slow the narrow road and some through drivers take the main road instead.
- **Flyover Bottleneck:** Watch cars and trucks accelerate differently, drivers merge early or late, and some take the surface route when the flyover backs up.

On hover, show the vehicle type, driver profile, and the actual reason for its current action. For example, **“Truck · Assertive · Braking for the car ahead”** or **“Compact car · Cautious · Waiting for a larger gap.”**

Keep the intensity slider tied to how many trips are due per minute. Let trips wait outside when the entrance is full, and count how many were due, entered, and finished. Let me replay the same arrivals, drivers, and vehicles after changing a road or traffic control. Verify one before-and-after run where the edit changes the queue or travel time.
