# FleetNexus

FleetNexus is a real-time 2D simulation for decentralized coordination of heterogeneous mobile robots. It demonstrates task allocation, peer negotiation, collision prediction, right-of-way resolution, deadlock recovery, battery-aware reassignment, controller failover, and live fleet monitoring.

## Features

- Canvas-based 48 × 30 industrial grid with routes, operating zones, obstacles, charging stations, conflicts, and density heatmaps
- Real-time movement for fleets from 24 to 500 robots
- Auction-style task bidding using distance, capability, workload, and battery reserve
- BFS route planning with occupied-cell reservation and right-of-way negotiation
- Head-on conflict detection with priority-based deadlock recovery and alternate paths
- Battery threshold routing to the nearest charging station
- Central controller toggle that demonstrates continued peer-to-peer operation
- Manual and stochastic failure injection with mission ownership recovery
- Live event feed, mission queue, selected-unit telemetry, and fleet metrics
- Four simulation speeds, pause/resume, reset, fullscreen, and map layer controls

## Architecture

```text
React mission-control UI
        │
        ├── SimulationCanvas ── Canvas renderer and robot selection
        │
        └── SimulationEngine
              ├── Auction scheduler
              ├── Grid path planner
              ├── Reservation and negotiation layer
              ├── Deadlock recovery
              ├── Battery scheduler
              └── Failure and resilience models
```

The simulation engine is independent of React and advances from `requestAnimationFrame`. UI snapshots are sampled at 220 ms, while the canvas reads live engine state for smooth movement. See `ARCHITECTURE.md` for algorithm details.

## Run locally

Requirements:

- Node.js 20 or newer
- npm 10 or newer

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production build

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Demo controls

- Select a robot on the grid to inspect battery, workload, mission, peers, and completion count.
- Use the fleet slider or presets to reset the simulation at 24, 72, 180, or 500 robots.
- Select **Controller offline** to verify that mission execution continues through local bidding and peer fallback.
- Select **Inject failure** to fail a robot and return its mission to the distributed auction.
- Enable **Density heatmap** to inspect fleet concentration.
- Select **Mission queue** to jump to the robot currently assigned to a mission.

## Docker

The included multi-stage `Dockerfile` builds the Vite app and serves it with nginx on port 80.

```bash
docker build -t fleet-nexus .
docker run --rm -p 8080:80 fleet-nexus
```

Open `http://localhost:8080`. Render uses `/healthz` for container health checks.

## Deployment

The app deploys as a Docker web service on Render with no environment variables.

- Render runtime: Docker
- Build: automatic from `Dockerfile`
- Health check path: `/healthz`
- Deployment URL: _Added after the Render service is created._
- Team/member details: _Add before evaluation._
- Public repository: _Add the verified GitHub URL before evaluation._

## Technology

React, TypeScript, Vite, Canvas 2D, and Lucide icons. No backend is required for the prototype; controller outage behavior is simulated in the client.
