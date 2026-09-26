export type RobotKind = 'Scout' | 'Hauler' | 'Inspector' | 'Lifter'
export type RobotStatus = 'En route' | 'Negotiating' | 'Waiting' | 'Charging' | 'Idle' | 'Faulted'
export type TaskStatus = 'Queued' | 'Allocated' | 'In progress' | 'Completed'
export type TaskPriority = 'Critical' | 'High' | 'Standard'
export type EventType = 'allocation' | 'negotiation' | 'recovery' | 'battery' | 'system' | 'failure'

export interface Point {
  x: number
  y: number
}

export interface Robot {
  id: string
  name: string
  kind: RobotKind
  color: string
  x: number
  y: number
  battery: number
  health: number
  load: number
  speed: number
  status: RobotStatus
  taskId: string | null
  path: Point[]
  heading: number
  distanceTravelled: number
  completedTasks: number
  peerIds: string[]
  failed: boolean
}

export interface MissionTask {
  id: string
  title: string
  kind: RobotKind
  pickup: Point
  destination: Point
  priority: TaskPriority
  status: TaskStatus
  assigneeId: string | null
  createdAt: number
  completedAt: number | null
}

export interface MissionEvent {
  id: string
  type: EventType
  title: string
  detail: string
  timestamp: number
  severity: 'info' | 'success' | 'warning' | 'danger'
}

export interface Conflict {
  id: string
  x: number
  y: number
  robotIds: [string, string]
  age: number
}

export interface SimulationMetrics {
  activeTasks: number
  completedTasks: number
  throughput: number
  averageLatency: number
  conflicts: number
  recoveredDeadlocks: number
  networkLoad: number
  energyUsed: number
}

export interface SimulationSnapshot {
  robots: Robot[]
  tasks: MissionTask[]
  events: MissionEvent[]
  conflicts: Conflict[]
  metrics: SimulationMetrics
  controllerOnline: boolean
  elapsedSeconds: number
  totalCells: number
  availableCells: number
}

export interface MapLayers {
  routes: boolean
  conflicts: boolean
  heatmap: boolean
  labels: boolean
}
