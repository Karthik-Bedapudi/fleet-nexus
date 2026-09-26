# FleetNexus Architecture

## Design goals

FleetNexus models an industrial multi-agent system in which robots can keep operating when the central coordination service is unavailable. The implementation prioritizes deterministic behavior, low-latency visualization, and bounded work per animation frame.

## Components

### SimulationCanvas

`SimulationCanvas` is a device-pixel-ratio-aware Canvas 2D renderer. It draws the grid, zones, obstacles, charging stations, active routes, task markers, robots, and negotiation conflicts. Pointer coordinates are converted to grid cells for robot selection and telemetry inspection.

### SimulationEngine

`SimulationEngine` owns all mutable fleet and mission state. It exposes a small command surface (`tick`, `reset`, `injectFailure`, `setControllerOnline`, and `recoverFailures`) plus read-only views for rendering and UI snapshots.

### Mission-control UI

The React dashboard polls immutable engine snapshots at 220 ms. User actions update the engine directly and request a fresh snapshot. The animation loop calls `tick` at up to four times real time while the canvas continues to redraw at display refresh rate.

## Coordination model

### Task allocation

Queued missions are ordered by priority. Eligible robots submit bids using a cost based on:

```text
bid = pickup distance + delivery distance
    - capability match
    + battery penalty
    + workload penalty
    + small deterministic jitter
```

The lowest bidder receives the task and calculates a route to its pickup point. Arrival at pickup transitions the mission to `In progress`; arrival at the destination completes it and releases the robot to the next auction.

### Path planning

The prototype uses breadth-first search over the 48 × 30 occupancy grid. Obstacles are static in the demonstration; robots are dynamic reservations. Paths are recalculated when a robot begins negotiation recovery, releases a task, or enters charging mode.

### Collision and right-of-way management

During each movement step, proposed next cells are checked against current occupants and cells reserved earlier in the same frame. A robot that cannot claim its next cell broadcasts a right-of-way request to the blocked peer. Conflict markers and negotiation events expose this state in real time.

### Deadlock detection and recovery

When two waiting robots request each other's current cells, the engine evaluates mission priority, completed workload, and load. One robot receives the right-of-way. The other receives a temporary adjacent escape cell and replans after a short consensus delay. The dashboard tracks the cumulative number of recovered deadlocks.

### Battery-aware scheduling

Below the energy threshold, a robot releases ownership of its mission and routes to the nearest charging station. It rejoins the peer bidding pool after reaching the configured charge reserve. This prevents energy-constrained units from starting missions they cannot complete.

### Failure injection and controller resilience

Manual failure injection selects an active robot, marks it faulted, and returns its mission to the queue. A low-probability stochastic failure model demonstrates unsolicited communication loss. Disconnecting the central controller does not stop movement, task assignment, negotiation, or recovery; it increases peer-consensus latency and network load in the metrics model.

## Scale

The renderer draws at most 100 non-selected routes to bound path-stroke cost. Movement and reservation work are linear in fleet size. Task pathfinding occurs only on assignment or recovery. A headless 10-second engine run at 500 robots completed 22 missions, recorded 46 deadlock recoveries, and used 246 ms of total engine time in the local verification environment.

## Prototype boundaries

- Peer communication is represented by deterministic neighborhood topology and consensus state rather than a real network transport.
- Static map obstacles do not change during a run.
- Robots share a single client process rather than separate processes or machines.
- Persistent storage, authentication, a physical robot adapter, and a hosted multi-user backend are outside the browser prototype scope.
