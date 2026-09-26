export const GRID_WIDTH = 48
export const GRID_HEIGHT = 30

export const CHARGING_STATIONS = [
  { x: 3, y: 3, id: 'CS-01' },
  { x: 44, y: 4, id: 'CS-02' },
  { x: 3, y: 26, id: 'CS-03' },
  { x: 44, y: 26, id: 'CS-04' },
]

export const OPERATING_ZONES = [
  { id: 'Z1', label: 'INBOUND', x: 3, y: 3, width: 7, height: 7, color: '#65d6a0' },
  { id: 'Z2', label: 'ASSEMBLY', x: 18, y: 6, width: 11, height: 8, color: '#c9a86a' },
  { id: 'Z3', label: 'INSPECTION', x: 33, y: 11, width: 11, height: 8, color: '#8e9df2' },
  { id: 'Z4', label: 'OUTBOUND', x: 29, y: 21, width: 11, height: 6, color: '#65d6a0' },
  { id: 'Z5', label: 'COLD STORE', x: 12, y: 19, width: 8, height: 7, color: '#7bb7e8' },
]

export const OBSTACLES = [
  { x: 11, y: 3, width: 2, height: 7 },
  { x: 11, y: 14, width: 2, height: 12 },
  { x: 16, y: 16, width: 13, height: 2 },
  { x: 31, y: 4, width: 2, height: 5 },
  { x: 35, y: 20, width: 2, height: 7 },
  { x: 22, y: 10, width: 7, height: 2 },
  { x: 39, y: 13, width: 5, height: 2 },
]

import type {
  Conflict,
  MissionEvent,
  MissionTask,
  Point,
  Robot,
  RobotKind,
  SimulationMetrics,
  SimulationSnapshot,
  TaskPriority,
} from './types'

const ROBOT_COLORS: Record<RobotKind, string> = {
  Scout: '#65d6a0',
  Hauler: '#e8b86d',
  Inspector: '#8e9df2',
  Lifter: '#70b7dd',
}

const ROBOT_KINDS: RobotKind[] = ['Scout', 'Hauler', 'Inspector', 'Lifter']
const TASK_TITLES = [
  'Transfer component',
  'Inspect pressure line',
  'Move assembly crate',
  'Collect tooling set',
  'Scan quality station',
  'Deliver finished unit',
  'Relocate spare part',
  'Verify sealed package',
]
const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  Critical: 3,
  High: 2,
  Standard: 1,
}

export class SimulationEngine {
  readonly width = GRID_WIDTH
  readonly height = GRID_HEIGHT

  private robots: Robot[] = []
  private tasks: MissionTask[] = []
  private events: MissionEvent[] = []
  private conflicts: Conflict[] = []
  private blockedCells = new Set<string>()
  private random = this.createRandom(4281)
  private eventId = 0
  private conflictId = 0
  private completedTimestamps: number[] = []
  private totalCompleted = 0
  private recoveredDeadlocks = 0
  private networkLoad = 28
  private controllerOnline = true
  private elapsedSeconds = 0
  private lastNegotiationAt = new Map<string, number>()
  private replanAt = new Map<string, number>()

  constructor(fleetSize = 72) {
    this.reset(fleetSize)
  }

  reset(fleetSize: number) {
    const count = Math.max(12, Math.min(500, Math.round(fleetSize)))
    this.random = this.createRandom(4281 + count * 17)
    this.robots = []
    this.tasks = []
    this.events = []
    this.conflicts = []
    this.blockedCells = new Set()
    this.completedTimestamps = []
    this.totalCompleted = 0
    this.recoveredDeadlocks = 0
    this.networkLoad = 28
    this.controllerOnline = true
    this.elapsedSeconds = 0
    this.eventId = 0
    this.conflictId = 0
    this.lastNegotiationAt.clear()
    this.replanAt.clear()
    this.buildBlockedCells()

    const occupied = new Set<string>()
    for (let index = 0; index < count; index += 1) {
      const start = this.findFreeCell(occupied, true)
      occupied.add(this.key(start))
      const kind = ROBOT_KINDS[index % ROBOT_KINDS.length]
      const id = `R-${String(index + 1).padStart(3, '0')}`
      this.robots.push({
        id,
        name: `${kind.slice(0, 2).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
        kind,
        color: ROBOT_COLORS[kind],
        x: start.x,
        y: start.y,
        battery: 48 + this.random() * 50,
        health: 96 + this.random() * 4,
        load: Math.round(this.random() * 35),
        speed: 1.9 + this.random() * 1.1,
        status: 'Idle',
        taskId: null,
        path: [],
        heading: this.random() * Math.PI * 2,
        distanceTravelled: 0,
        completedTasks: 0,
        peerIds: this.createPeerRing(index, count),
        failed: false,
      })
    }

    const taskCount = Math.max(14, Math.min(72, Math.ceil(count * 0.2)))
    for (let index = 0; index < taskCount; index += 1) {
      this.tasks.push(this.createTask(index))
    }

    this.assignAvailableTasks()
    this.addEvent('system', 'Simulation initialized', `${count} agents connected through a peer mesh`, 'success')
    this.addEvent('allocation', 'Decentralized auction opened', `${this.tasks.length} missions are competing for capacity`, 'info')
  }

  tick(deltaSeconds: number) {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.08))
    this.elapsedSeconds += delta

    for (const robot of this.robots) {
      if (robot.failed) continue
      this.prepareRobot(robot, delta)
    }

    this.moveRobots(delta)
    this.manageTasks()
    this.resolveNegotiations()
    this.updateConflicts(delta)
    this.maybeCreateFailure(delta)
    this.replenishTasks()
    this.networkLoad = Math.min(
      98,
      24 + this.activeTaskCount() * 1.1 + this.conflicts.length * 2.5 + (this.controllerOnline ? 0 : 18),
    )
  }

  getRobots(): readonly Robot[] {
    return this.robots
  }

  getTasks(): readonly MissionTask[] {
    return this.tasks
  }

  getConflicts(): readonly Conflict[] {
    return this.conflicts
  }

  getAvailableCells() {
    return this.width * this.height - this.blockedCells.size
  }

  setControllerOnline(online: boolean) {
    if (online === this.controllerOnline) return
    this.controllerOnline = online
    if (online) {
      this.addEvent('recovery', 'Central service restored', 'Peer state reconciled; auction loop resumed', 'success')
    } else {
      this.addEvent('system', 'Controller link lost', 'Fleet continues through local consensus and peer bidding', 'warning')
    }
  }

  injectFailure() {
    const candidates = this.robots.filter((robot) => !robot.failed && robot.status !== 'Idle')
    const pool = candidates.length > 0 ? candidates : this.robots.filter((robot) => !robot.failed)
    const robot = pool[Math.floor(this.random() * pool.length)]
    if (!robot) return

    robot.failed = true
    robot.health = 0
    robot.status = 'Faulted'
    robot.path = []
    this.releaseTask(robot)
    this.addEvent('failure', `${robot.id} offline`, 'Telemetry lost; active mission returned to the peer auction', 'danger')
  }

  recoverFailures() {
    let recovered = 0
    for (const robot of this.robots) {
      if (!robot.failed) continue
      robot.failed = false
      robot.health = 88
      robot.status = 'Idle'
      robot.path = []
      robot.battery = Math.max(robot.battery, 55)
      recovered += 1
    }
    if (recovered > 0) {
      this.addEvent('recovery', `${recovered} unit${recovered > 1 ? 's' : ''} recovered`, 'Replacement peers revalidated routes and task ownership', 'success')
      this.assignAvailableTasks()
    }
  }

  snapshot(): SimulationSnapshot {
    return {
      robots: this.robots.map((robot) => ({
        ...robot,
        path: robot.path.map((point) => ({ ...point })),
        peerIds: [...robot.peerIds],
      })),
      tasks: this.tasks.map((task) => ({ ...task, pickup: { ...task.pickup }, destination: { ...task.destination } })),
      events: this.events.map((event) => ({ ...event })),
      conflicts: this.conflicts.map((conflict) => ({ ...conflict })),
      metrics: this.getMetrics(),
      controllerOnline: this.controllerOnline,
      elapsedSeconds: this.elapsedSeconds,
      totalCells: this.width * this.height,
      availableCells: this.getAvailableCells(),
    }
  }

  private buildBlockedCells() {
    for (const obstacle of OBSTACLES) {
      for (let y = obstacle.y; y < obstacle.y + obstacle.height; y += 1) {
        for (let x = obstacle.x; x < obstacle.x + obstacle.width; x += 1) {
          this.blockedCells.add(this.key({ x, y }))
        }
      }
    }
  }

  private createRandom(seed: number) {
    let state = seed >>> 0
    return () => {
      state += 0x6d2b79f5
      let value = state
      value = Math.imul(value ^ (value >>> 15), value | 1)
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
  }

  private key(point: Point) {
    return `${point.x},${point.y}`
  }

  private isBlocked(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height || this.blockedCells.has(this.key({ x, y }))
  }

  private findFreeCell(occupied = new Set<string>(), preferEdges = false) {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      let x = Math.floor(this.random() * this.width)
      let y = Math.floor(this.random() * this.height)
      if (preferEdges && attempt < 80) {
        x = this.random() > 0.5 ? Math.floor(this.random() * 7) : this.width - 1 - Math.floor(this.random() * 7)
        y = this.random() > 0.5 ? Math.floor(this.random() * 6) : this.height - 1 - Math.floor(this.random() * 6)
      }
      const key = this.key({ x, y })
      if (!this.isBlocked(x, y) && !occupied.has(key)) return { x, y }
    }
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        if (!this.isBlocked(x, y)) return { x, y }
      }
    }
    return { x: 1, y: 1 }
  }

  private createPeerRing(index: number, count: number) {
    const peerCount = Math.min(5, Math.max(2, Math.floor(count / 12)))
    const peers: string[] = []
    for (let offset = 1; offset <= peerCount; offset += 1) {
      const peerIndex = (index + offset * 7) % count
      if (peerIndex !== index) peers.push(`R-${String(peerIndex + 1).padStart(3, '0')}`)
    }
    return peers
  }

  private createTask(index: number): MissionTask {
    const kind = ROBOT_KINDS[index % ROBOT_KINDS.length]
    const priorityRoll = this.random()
    const priority: TaskPriority = priorityRoll > 0.9 ? 'Critical' : priorityRoll > 0.62 ? 'High' : 'Standard'
    const pickup = this.findFreeCell()
    const destination = this.findFreeCell()
    const taskNumber = index + 1
    return {
      id: `M-${String(taskNumber).padStart(4, '0')}`,
      title: `${TASK_TITLES[index % TASK_TITLES.length]} ${String.fromCharCode(65 + (index % 8))}${taskNumber}`,
      kind,
      pickup,
      destination,
      priority,
      status: 'Queued',
      assigneeId: null,
      createdAt: this.elapsedSeconds,
      completedAt: null,
    }
  }

  private activeTaskCount() {
    return this.tasks.filter((task) => task.status !== 'Completed').length
  }

  private currentTask(robot: Robot) {
    return this.robotTaskId(robot) === null ? undefined : this.tasks.find((task) => task.id === this.robotTaskId(robot))
  }

  private robotTaskId(robot: Robot) {
    return robot.taskId
  }

  private assignAvailableTasks() {
    const available = this.robots.filter(
      (robot) => !robot.failed && robot.taskId === null && robot.status !== 'Faulted' && robot.battery > 28,
    )
    const queued = this.tasks
      .filter((task) => task.status === 'Queued')
      .sort((first, second) => PRIORITY_WEIGHT[second.priority] - PRIORITY_WEIGHT[first.priority])

    for (const task of queued) {
      let bestRobot: Robot | undefined
      let bestCost = Number.POSITIVE_INFINITY
      for (const robot of available) {
        if (robot.battery < 25) continue
        const distance = this.manhattan(robot, task.pickup) + this.manhattan(task.pickup, task.destination)
        const capability = robot.kind === task.kind ? -8 : 0
        const batteryPenalty = Math.max(0, 48 - robot.battery) * 0.32
        const loadPenalty = robot.load * 0.18
        const bid = distance + capability + batteryPenalty + loadPenalty + this.random() * 3
        if (bid < bestCost) {
          bestCost = bid
          bestRobot = robot
        }
      }
      if (!bestRobot) break
      this.assignTask(bestRobot, task)
      available.splice(available.indexOf(bestRobot), 1)
    }
  }

  private assignTask(robot: Robot, task: MissionTask) {
    const path = this.findPath(robot, task.pickup)
    if (path.length === 0 && !this.sameCell(robot, task.pickup)) {
      return
    }
    robot.taskId = task.id
    robot.status = path.length > 0 ? 'En route' : 'Idle'
    robot.path = path
    task.assigneeId = robot.id
    task.status = path.length > 0 ? 'Allocated' : 'In progress'
    if (path.length === 0) this.handleArrival(robot)
    this.addEvent(
      'allocation',
      `${task.id} assigned to ${robot.id}`,
      `${task.priority} priority · bid score ${bestCostLabel(robot, task)}`,
      task.priority === 'Critical' ? 'warning' : 'info',
    )
  }

  private manageTasks() {
    for (let index = this.tasks.length - 1; index >= 0; index -= 1) {
      const task = this.tasks[index]
      if (task.status !== 'Completed' && this.elapsedSeconds - task.createdAt > 120) {
        this.tasks.splice(index, 1)
      }
    }
    const completedRecently = this.tasks.filter((task) => task.status === 'Completed').slice(-4)
    if (completedRecently.length > 0 && this.tasks.filter((task) => task.status !== 'Completed').length < 3) {
      this.replenishTasks()
    }
    this.assignAvailableTasks()
  }

  private replenishTasks() {
    const target = Math.max(18, Math.min(80, Math.ceil(this.robots.length * 0.2)))
    if (this.tasks.filter((task) => task.status !== 'Completed').length >= target) return
    const nextIndex = this.tasks.length
    this.tasks.push(this.createTask(nextIndex))
  }

  private prepareRobot(robot: Robot, delta: number) {
    if (robot.status === 'Charging' && robot.path.length === 0) {
      robot.battery = Math.min(100, robot.battery + delta * 8)
      robot.load = Math.max(0, robot.load - delta * 4)
      if (robot.battery >= 94) {
        robot.status = 'Idle'
        robot.taskId = null
        this.addEvent('battery', `${robot.id} charge cycle complete`, 'Robot returned to the peer bidding pool', 'success')
      }
      return
    }

    if (robot.battery < 18 && robot.status !== 'Charging') {
      this.sendToCharger(robot)
    }

    if (robot.status === 'Negotiating') {
      const replanTime = this.replanAt.get(robot.id) ?? 0
      if (this.elapsedSeconds >= replanTime) {
        const task = this.currentTask(robot)
        const target = task?.status === 'Allocated' ? task.pickup : task?.destination
        if (target) robot.path = this.findPath(robot, target)
        robot.status = robot.path.length > 0 ? 'En route' : 'Idle'
        this.replanAt.delete(robot.id)
      }
    }
  }

  private sendToCharger(robot: Robot) {
    if (robot.taskId) this.releaseTask(robot)
    const station = CHARGING_STATIONS.reduce((nearest, candidate) =>
      this.distance(robot, candidate) < this.distance(robot, nearest) ? candidate : nearest,
    )
    robot.path = this.findPath(robot, station)
    robot.status = 'Charging'
    this.addEvent('battery', `${robot.id} energy threshold reached`, `Rerouting to ${station.id} and releasing mission`, 'warning')
  }

  private moveRobots(delta: number) {
    const occupied = new Map<string, string>()
    const reserved = new Map<string, string>()
    for (const robot of this.robots) {
      if (!robot.failed && robot.status !== 'Idle') {
        occupied.set(this.key(this.cellOf(robot)), robot.id)
      }
    }

    const movingRobots = this.robots
      .filter((robot) => !robot.failed && robot.path.length > 0)
      .sort((first, second) => {
        const firstPriority = this.taskPriority(first)
        const secondPriority = this.taskPriority(second)
        return secondPriority - firstPriority || first.load - second.load
      })

    for (const robot of movingRobots) {
      let remaining = robot.speed * delta
      while (remaining > 0.0001 && robot.path.length > 0) {
        const next = robot.path[0]
        const nextKey = this.key(next)
        const currentKey = this.key(this.cellOf(robot))
        const occupant = occupied.get(nextKey)
        const priorClaim = reserved.get(nextKey)
        if ((occupant && occupant !== robot.id) || (priorClaim && priorClaim !== robot.id)) {
          const otherId = occupant && occupant !== robot.id ? occupant : priorClaim
          this.negotiate(robot, otherId, next)
          break
        }

        const fromX = robot.x
        const fromY = robot.y
        const distance = this.distance({ x: fromX, y: fromY }, next)
        const step = Math.min(distance, remaining)
        if (distance > 0) {
          robot.x += ((next.x - fromX) / distance) * step
          robot.y += ((next.y - fromY) / distance) * step
          robot.heading = Math.atan2(next.y - fromY, next.x - fromX)
          robot.distanceTravelled += step
          robot.battery = Math.max(0, robot.battery - step * 0.075)
          remaining -= step
        }
        if (step >= distance - 0.001) {
          robot.x = next.x
          robot.y = next.y
          robot.path.shift()
          occupied.delete(currentKey)
          occupied.set(nextKey, robot.id)
          reserved.set(nextKey, robot.id)
        }
      }

      if (robot.path.length === 0) this.handleArrival(robot)
    }

    for (const robot of this.robots) {
      if (robot.status === 'En route' && robot.path.length > 0 && robot.battery < 18) {
        this.sendToCharger(robot)
      }
    }
  }

  private handleArrival(robot: Robot) {
    const task = this.currentTask(robot)
    if (task && task.status === 'Allocated' && this.sameCell(robot, task.pickup)) {
      task.status = 'In progress'
      robot.path = this.findPath(robot, task.destination)
      robot.status = 'En route'
      robot.load = Math.min(100, robot.load + 34)
      if (robot.path.length === 0) this.completeTask(robot, task)
      return
    }
    if (task && task.status === 'In progress' && this.sameCell(robot, task.destination)) {
      this.completeTask(robot, task)
      return
    }
    if (robot.status === 'Charging' && CHARGING_STATIONS.some((station) => this.sameCell(robot, station))) {
      return
    }
    if (robot.status !== 'Charging') robot.status = 'Idle'
  }

  private completeTask(robot: Robot, task: MissionTask) {
    task.status = 'Completed'
    task.assigneeId = robot.id
    task.completedAt = this.elapsedSeconds
    robot.taskId = null
    robot.path = []
    robot.status = 'Idle'
    robot.completedTasks += 1
    robot.load = 0
    this.totalCompleted += 1
    this.completedTimestamps.push(this.elapsedSeconds)
    this.addEvent('allocation', `${task.id} completed by ${robot.id}`, `${Math.round(robot.battery)}% energy remaining · route accepted`, 'success')
    this.replenishTasks()
  }

  private releaseTask(robot: Robot) {
    if (!robot.taskId) return
    const task = this.tasks.find((candidate) => candidate.id === robot.taskId)
    if (task && task.status !== 'Completed') {
      task.status = 'Queued'
      task.assigneeId = null
      this.addEvent('negotiation', `${task.id} returned to auction`, 'Ownership transfer prevents a single-agent stall', 'info')
    }
    robot.taskId = null
  }

  private negotiate(robot: Robot, otherId: string | undefined, point: Point) {
    if (!otherId) return
    const other = this.robots.find((candidate) => candidate.id === otherId)
    if (!other) return
    const now = this.elapsedSeconds
    if (now - (this.lastNegotiationAt.get(robot.id) ?? -10) < 1.25) return
    this.lastNegotiationAt.set(robot.id, now)
    robot.status = 'Waiting'
    other.status = 'Waiting'
    this.registerConflict(robot, other, point)
    this.addEvent('negotiation', `${robot.id} ↔ ${other.id}`, 'Right-of-way request broadcast to nearby peers', 'warning')
  }

  private resolveNegotiations() {
    const waiting = this.robots.filter((robot) => !robot.failed && robot.status === 'Waiting')
    for (let firstIndex = 0; firstIndex < waiting.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < waiting.length; secondIndex += 1) {
        const first = waiting[firstIndex]
        const second = waiting[secondIndex]
        const firstCell = this.cellOf(first)
        const secondCell = this.cellOf(second)
        const firstWantsSecond = this.sameCell(first.path[0] ?? firstCell, secondCell)
        const secondWantsFirst = this.sameCell(second.path[0] ?? secondCell, firstCell)
        if (firstWantsSecond && secondWantsFirst) {
          this.recoverDeadlock(first, second)
          return
        }
      }
    }
  }

  private recoverDeadlock(first: Robot, second: Robot) {
    const firstScore = this.taskPriority(first) * 12 - first.completedTasks - first.load * 0.2
    const secondScore = this.taskPriority(second) * 12 - second.completedTasks - second.load * 0.2
    const winner = firstScore >= secondScore ? first : second
    const loser = winner === first ? second : first
    this.recoveredDeadlocks += 1
    this.registerConflict(first, second, this.cellOf(loser))
    const alternate = this.findAvoidanceCell(loser, winner)
    winner.status = 'En route'
    loser.status = 'Negotiating'
    loser.path = alternate ? [alternate, ...loser.path] : loser.path
    this.replanAt.set(loser.id, this.elapsedSeconds + 0.6)
    this.addEvent('recovery', `Deadlock resolved near ${winner.id}`, 'Priority consensus yielded a safe alternative path', 'success')
  }

  private findAvoidanceCell(robot: Robot, other: Robot) {
    const origin = this.cellOf(robot)
    const options: Point[] = [
      { x: origin.x, y: origin.y - 1 },
      { x: origin.x + 1, y: origin.y },
      { x: origin.x, y: origin.y + 1 },
      { x: origin.x - 1, y: origin.y },
    ]
    return options.find((point) => {
      const distanceToOther = this.distance(point, this.cellOf(other))
      return !this.isBlocked(point.x, point.y) && distanceToOther > 0 && this.robots.every((candidate) => candidate.id === robot.id || !this.sameCell(point, this.cellOf(candidate)))
    })
  }

  private registerConflict(first: Robot, second: Robot, point: Point) {
    const existing = this.conflicts.find(
      (conflict) => conflict.robotIds.includes(first.id) && conflict.robotIds.includes(second.id),
    )
    if (existing) return
    this.conflictId += 1
    this.conflicts.push({
      id: `conflict-${this.conflictId}`,
      x: point.x,
      y: point.y,
      robotIds: [first.id, second.id],
      age: 0,
    })
    if (this.conflicts.length > 18) this.conflicts.shift()
  }

  private updateConflicts(delta: number) {
    for (const conflict of this.conflicts) conflict.age += delta
    this.conflicts = this.conflicts.filter((conflict) => conflict.age < 3.2)
  }

  private maybeCreateFailure(delta: number) {
    const chance = this.controllerOnline ? 0.00045 : 0.0007
    for (const robot of this.robots) {
      if (robot.failed) continue
      if (this.random() < chance * delta) {
        robot.failed = true
        robot.health = 0
        robot.status = 'Faulted'
        robot.path = []
        this.releaseTask(robot)
        this.addEvent('failure', `${robot.id} communication degraded`, 'Peer mesh isolated the node and migrated its workload', 'danger')
        break
      }
    }
  }

  private findPath(start: Point, goal: Point): Point[] {
    const roundedStart = this.cellOf(start)
    const roundedGoal = this.cellOf(goal)
    if (this.isBlocked(roundedGoal.x, roundedGoal.y)) return []
    if (this.sameCell(roundedStart, roundedGoal)) return []
    const queue: Point[] = [roundedStart]
    const visited = new Set<string>([this.key(roundedStart)])
    const parent = new Map<string, Point>()
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]
    let cursor = 0
    while (cursor < queue.length) {
      const current = queue[cursor]
      cursor += 1
      for (const direction of directions) {
        const next = { x: current.x + direction.x, y: current.y + direction.y }
        const key = this.key(next)
        if (this.isBlocked(next.x, next.y) || visited.has(key)) continue
        visited.add(key)
        parent.set(key, current)
        if (next.x === roundedGoal.x && next.y === roundedGoal.y) {
          const path: Point[] = []
          let trail: Point | undefined = next
          while (trail && !this.sameCell(trail, roundedStart)) {
            path.push({ ...trail })
            trail = parent.get(this.key(trail))
          }
          return path.reverse()
        }
        queue.push(next)
      }
    }
    return []
  }

  private cellOf(point: Point): Point {
    return { x: Math.round(point.x), y: Math.round(point.y) }
  }

  private sameCell(first: Point, second: Point) {
    return Math.round(first.x) === Math.round(second.x) && Math.round(first.y) === Math.round(second.y)
  }

  private distance(first: Point, second: Point) {
    return Math.hypot(first.x - second.x, first.y - second.y)
  }

  private manhattan(first: Point, second: Point) {
    return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
  }

  private taskPriority(robot: Robot) {
    const task = this.currentTask(robot)
    return task ? PRIORITY_WEIGHT[task.priority] : 0
  }

  private addEvent(type: MissionEvent['type'], title: string, detail: string, severity: MissionEvent['severity']) {
    this.eventId += 1
    this.events.unshift({
      id: `event-${this.eventId}`,
      type,
      title,
      detail,
      severity,
      timestamp: this.elapsedSeconds,
    })
    if (this.events.length > 12) this.events.pop()
  }

  private getMetrics(): SimulationMetrics {
    const cutoff = this.elapsedSeconds - 60
    this.completedTimestamps = this.completedTimestamps.filter((timestamp) => timestamp >= cutoff)
    const observationWindow = Math.max(10, Math.min(60, this.elapsedSeconds))
    const throughput = this.elapsedSeconds < 3 ? 0 : Math.round((this.completedTimestamps.length / observationWindow) * 60)
    return {
      activeTasks: this.activeTaskCount(),
      completedTasks: this.totalCompleted,
      throughput,
      averageLatency: Math.round((this.controllerOnline ? 12 : 24) + this.conflicts.length * 1.8),
      conflicts: this.conflicts.length,
      recoveredDeadlocks: this.recoveredDeadlocks,
      networkLoad: Math.round(this.networkLoad),
      energyUsed: Math.round(this.robots.reduce((total, robot) => total + (100 - robot.battery), 0)),
    }
  }
}

function bestCostLabel(robot: Robot, task: MissionTask) {
  const distance = Math.round(manhattanPublic(robot, task.pickup) + manhattanPublic(task.pickup, task.destination))
  return `${Math.max(1, Math.round(distance / 10))}.${robot.id.slice(-1)}`
}

function manhattanPublic(first: Point, second: Point) {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}
