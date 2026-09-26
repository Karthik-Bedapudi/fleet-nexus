import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  Cpu,
  Crosshair,
  GitBranch,
  LayoutDashboard,
  Map,
  Maximize2,
  Network,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Server,
  Settings2,
  ShieldCheck,
  Target,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SimulationCanvas } from './components/SimulationCanvas'
import { SimulationEngine } from './simulation/engine'
import type { MapLayers, MissionEvent, MissionTask, SimulationSnapshot } from './simulation/types'

const INITIAL_FLEET_SIZE = 72
const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Simulation', icon: Map },
  { label: 'Fleet', icon: Bot },
  { label: 'Missions', icon: Target },
  { label: 'Analytics', icon: Activity },
]
const SCENARIOS = [
  { id: 'balanced', label: 'Balanced load' },
  { id: 'peak', label: 'Peak traffic' },
  { id: 'offline', label: 'Controller offline' },
] as const

type ScenarioId = (typeof SCENARIOS)[number]['id']

export default function App() {
  const engineRef = useRef<SimulationEngine | null>(null)
  if (!engineRef.current) engineRef.current = new SimulationEngine(INITIAL_FLEET_SIZE)
  const engine = engineRef.current

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => engine.snapshot())
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [fleetSize, setFleetSize] = useState(INITIAL_FLEET_SIZE)
  const [scenario, setScenario] = useState<ScenarioId>('balanced')
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>('R-001')
  const [activityTab, setActivityTab] = useState<'activity' | 'missions'>('activity')
  const [layers, setLayers] = useState<MapLayers>({
    routes: true,
    conflicts: true,
    heatmap: false,
    labels: true,
  })
  const [toast, setToast] = useState<string | null>(null)
  const [wallClock, setWallClock] = useState(() => new Date())

  useEffect(() => {
    let frame = 0
    let lastTime = performance.now()
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000
      lastTime = time
      if (isRunning) engine.tick(delta * speed)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [engine, isRunning, speed])

  useEffect(() => {
    const snapshotTimer = window.setInterval(() => setSnapshot(engine.snapshot()), 220)
    const clockTimer = window.setInterval(() => setWallClock(new Date()), 1000)
    return () => {
      window.clearInterval(snapshotTimer)
      window.clearInterval(clockTimer)
    }
  }, [engine])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectedRobot = snapshot.robots.find((robot) => robot.id === selectedRobotId) ?? null
  const selectedTask = selectedRobot?.taskId
    ? snapshot.tasks.find((task) => task.id === selectedRobot?.taskId) ?? null
    : null
  const activeTasks = snapshot.tasks.filter((task) => task.status !== 'Completed')
  const queuedTasks = activeTasks.filter((task) => task.status === 'Queued')
  const chargingRobots = snapshot.robots.filter((robot) => robot.status === 'Charging').length
  const faultedRobots = snapshot.robots.filter((robot) => robot.failed).length
  const availableRobots = snapshot.robots.filter((robot) => !robot.failed && robot.taskId === null).length
  const scenarioLabel = SCENARIOS.find((item) => item.id === scenario)?.label ?? 'Balanced load'

  const fleetHealth = useMemo(() => {
    const healthy = snapshot.robots.filter((robot) => !robot.failed && robot.health >= 70).length
    return Math.round((healthy / Math.max(1, snapshot.robots.length)) * 100)
  }, [snapshot.robots])

  const resetSimulation = (nextFleetSize = fleetSize, nextSpeed = speed, nextScenario = scenario) => {
    engine.reset(nextFleetSize)
    if (nextScenario === 'offline') engine.setControllerOnline(false)
    setSpeed(nextSpeed)
    setSnapshot(engine.snapshot())
    setSelectedRobotId('R-001')
    setIsRunning(true)
  }

  const selectScenario = (nextScenario: ScenarioId) => {
    if (nextScenario === 'balanced') {
      setScenario(nextScenario)
      setSpeed(1)
      resetSimulation(INITIAL_FLEET_SIZE, 1, nextScenario)
    } else if (nextScenario === 'peak') {
      setScenario(nextScenario)
      setFleetSize(180)
      setSpeed(2)
      resetSimulation(180, 2, nextScenario)
    } else {
      setScenario(nextScenario)
      setFleetSize(INITIAL_FLEET_SIZE)
      setSpeed(1)
      resetSimulation(INITIAL_FLEET_SIZE, 1, nextScenario)
    }
    setToast(`${SCENARIOS.find((item) => item.id === nextScenario)?.label} loaded`)
  }

  const setFleetPreset = (count: number) => {
    setFleetSize(count)
    setScenario(count >= 180 ? 'peak' : 'balanced')
    resetSimulation(count, count >= 180 ? 2 : 1, count >= 180 ? 'peak' : 'balanced')
  }

  const toggleLayer = (layer: keyof MapLayers) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }))
  }

  const injectFailure = () => {
    engine.injectFailure()
    setSnapshot(engine.snapshot())
    setToast('Failure injected · ownership returned to peer auction')
  }

  const toggleController = () => {
    engine.setControllerOnline(!snapshot.controllerOnline)
    setSnapshot(engine.snapshot())
    setToast(snapshot.controllerOnline ? 'Central controller disconnected' : 'Central controller restored')
  }

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">FLEET<span>NEXUS</span></div>
            <div className="brand-kicker">HACKFUSION 2026</div>
          </div>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <div className="nav-label">COMMAND CENTER</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                type="button"
                className={`nav-item ${item.label === 'Simulation' ? 'active' : ''}`}
                key={item.label}
                onClick={() => {
                  if (item.label !== 'Simulation') setToast(`${item.label} overview is folded into the live simulation`)
                }}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Fleet' ? <span className="nav-count">{snapshot.robots.length}</span> : null}
              </button>
            )
          })}
        </nav>

        <div className="rail-divider" />

        <section className="scenario-section">
          <div className="section-eyebrow">
            <span>ACTIVE SCENARIO</span>
            <Settings2 size={13} />
          </div>
          <div className="scenario-list">
            {SCENARIOS.map((item) => (
              <button
                type="button"
                className={`scenario-button ${scenario === item.id ? 'active' : ''}`}
                key={item.id}
                onClick={() => selectScenario(item.id)}
              >
                <span className="scenario-radio" />
                <span>{item.label}</span>
                {item.id === 'offline' ? <WifiOff size={13} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="fleet-control-section">
          <div className="control-label-row">
            <label htmlFor="fleet-size">FLEET SIZE</label>
            <strong>{fleetSize} units</strong>
          </div>
          <input
            id="fleet-size"
            className="fleet-slider"
            type="range"
            min="24"
            max="500"
            step="1"
            value={fleetSize}
            style={{ '--slider-progress': `${((fleetSize - 24) / 476) * 100}%` } as React.CSSProperties}
            onChange={(event) => setFleetSize(Number(event.target.value))}
            onPointerUp={() => resetSimulation(fleetSize)}
            onKeyUp={() => resetSimulation(fleetSize)}
          />
          <div className="slider-scale">
            <span>24</span>
            <span>500+</span>
          </div>
          <div className="fleet-presets">
            {[24, 72, 180, 500].map((count) => (
              <button type="button" className={fleetSize === count ? 'active' : ''} key={count} onClick={() => setFleetPreset(count)}>
                {count === 500 ? '500' : count}
              </button>
            ))}
          </div>
        </section>

        <section className="layer-section">
          <div className="section-eyebrow">
            <span>MAP LAYERS</span>
            <Crosshair size={13} />
          </div>
          <LayerToggle label="Planned routes" active={layers.routes} onClick={() => toggleLayer('routes')} />
          <LayerToggle label="Live conflicts" active={layers.conflicts} onClick={() => toggleLayer('conflicts')} />
          <LayerToggle label="Density heatmap" active={layers.heatmap} onClick={() => toggleLayer('heatmap')} />
        </section>

        <div className="rail-spacer" />

        <section className="mesh-card">
          <div className="mesh-visual" aria-hidden="true">
            <Network size={19} />
            <span />
            <span />
            <span />
          </div>
          <div className="mesh-copy">
            <div><strong>PEER MESH</strong><span>STABLE</span></div>
            <p>{Math.max(2, Math.floor(snapshot.robots.length / 8))} active clusters · {snapshot.metrics.networkLoad}% load</p>
          </div>
        </section>

        <div className="rail-footer">
          <span className="avatar">FN</span>
          <div><strong>Operator 01</strong><span>Hackfusion Team</span></div>
          <ChevronDown size={14} />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="page-heading">
            <div className="heading-line">
              <h1>Mission control</h1>
              <span className={`live-pill ${isRunning ? '' : 'paused'}`}>
                <i /> {isRunning ? 'LIVE SIMULATION' : 'SIMULATION PAUSED'}
              </span>
            </div>
            <p>Industrial Grid A <span>/</span> {scenarioLabel}</p>
          </div>

          <div className="topbar-center">
            <div className="topbar-stat">
              <span>FLEET HEALTH</span>
              <strong>{fleetHealth}%</strong>
            </div>
            <div className="stat-separator" />
            <div className="topbar-stat">
              <span>UPTIME</span>
              <strong>{formatDuration(snapshot.elapsedSeconds)}</strong>
            </div>
            <div className="stat-separator" />
            <div className="topbar-stat">
              <span>COORDINATION</span>
              <strong>{snapshot.controllerOnline ? 'HYBRID' : 'PEER-TO-PEER'}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className={`controller-pill ${snapshot.controllerOnline ? '' : 'offline'}`}
              onClick={toggleController}
              title="Toggle central coordinator"
            >
              {snapshot.controllerOnline ? <Server size={15} /> : <WifiOff size={15} />}
              <span>
                <strong>{snapshot.controllerOnline ? 'Controller online' : 'Controller offline'}</strong>
                <small>{snapshot.controllerOnline ? `${snapshot.metrics.averageLatency} ms consensus` : 'Peer fallback active'}</small>
              </span>
              <i />
            </button>
            <div className="clock-block">
              <span>{wallClock.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}</span>
              <strong>{wallClock.toLocaleTimeString('en-GB', { hour12: false })}</strong>
            </div>
          </div>
        </header>

        <section className="map-panel panel">
          <div className="map-toolbar">
            <div className="map-title">
              <div className="map-icon"><Map size={15} /></div>
              <div>
                <strong>Live fleet map</strong>
                <span>Grid 48 × 30 · Occupancy {Math.round((snapshot.robots.length / snapshot.availableCells) * 1000) / 10}%</span>
              </div>
            </div>
            <div className="map-statuses">
              <span><i className="status-dot green" /> {availableRobots} available</span>
              <span><i className="status-dot amber" /> {snapshot.metrics.conflicts} negotiating</span>
              <span><i className="status-dot blue" /> {chargingRobots} charging</span>
            </div>
            <div className="map-tools">
              <button type="button" onClick={() => setLayers((current) => ({ ...current, labels: !current.labels }))}>
                <Boxes size={14} /> Zones
              </button>
              <button
                type="button"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen()
                  else void document.documentElement.requestFullscreen()
                }}
                aria-label="Toggle fullscreen"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <SimulationCanvas
            engine={engine}
            layers={layers}
            selectedRobotId={selectedRobotId}
            onSelect={setSelectedRobotId}
          />

          <div className="map-legend">
            {ROBOT_KIND_LEGEND.map((item) => (
              <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>
            ))}
            <span className="legend-divider" />
            <span><i className="charge-symbol">ϟ</i>Charge</span>
            <span><i className="conflict-symbol">↔</i>Conflict</span>
          </div>

          <div className="map-coordinates">
            <Crosshair size={12} /> GRID A-07
          </div>

          <div className="simulation-controls">
            <button type="button" className="reset-button" onClick={() => resetSimulation()} aria-label="Reset simulation">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="play-button" onClick={() => setIsRunning((current) => !current)}>
              {isRunning ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              {isRunning ? 'Pause' : 'Resume'}
            </button>
            <div className="speed-control">
              {[0.5, 1, 2, 4].map((value) => (
                <button type="button" className={speed === value ? 'active' : ''} key={value} onClick={() => setSpeed(value)}>
                  {value}×
                </button>
              ))}
            </div>
            <span className="control-divider" />
            <button type="button" className="failure-button" onClick={injectFailure}>
              <Zap size={14} /> Inject failure
            </button>
          </div>
        </section>

        <section className="metrics-strip">
          <MetricCard
            icon={Target}
            label="Active missions"
            value={String(snapshot.metrics.activeTasks)}
            detail={`${queuedTasks.length} awaiting ownership`}
            trend="+8.4%"
            tone="green"
            chart={[22, 26, 24, 31, 29, 38, 41, 45, 43, 52]}
          />
          <MetricCard
            icon={CircleGauge}
            label="Mission throughput"
            value={`${snapshot.metrics.throughput}/hr`}
            detail={`${snapshot.metrics.completedTasks} missions completed`}
            trend="+12.1%"
            tone="blue"
            chart={[18, 24, 22, 32, 29, 37, 44, 41, 50, 56]}
          />
          <MetricCard
            icon={Network}
            label="Network load"
            value={`${snapshot.metrics.networkLoad}%`}
            detail={`${snapshot.metrics.averageLatency} ms avg. consensus`}
            trend={snapshot.controllerOnline ? 'nominal' : 'degraded'}
            tone="amber"
            chart={[32, 35, 31, 39, 43, 42, 48, 46, 52, 55]}
          />
          <MetricCard
            icon={ShieldCheck}
            label="Deadlocks resolved"
            value={String(snapshot.metrics.recoveredDeadlocks)}
            detail={`${snapshot.metrics.conflicts} negotiations active`}
            trend="100% safe"
            tone="violet"
            chart={[10, 10, 12, 12, 18, 18, 22, 29, 31, 38]}
          />
        </section>
      </main>

      <aside className="intelligence-panel">
        <div className="right-panel-header">
          <div>
            <span>OPERATIONS FEED</span>
            <strong>Command intelligence</strong>
          </div>
          <button type="button" aria-label="Refresh feed" onClick={() => setSnapshot(engine.snapshot())}>
            <RefreshCw size={14} />
          </button>
        </div>

        <section className={`unit-card ${selectedRobot ? '' : 'empty'}`}>
          <div className="unit-card-topline">
            <span>SELECTED UNIT</span>
            <span className={`unit-status ${selectedRobot?.status.toLowerCase().replace(' ', '-') ?? ''}`}>
              <i />{selectedRobot?.status ?? 'No selection'}
            </span>
          </div>
          {selectedRobot ? (
            <>
              <div className="unit-identity">
                <div className="unit-avatar" style={{ '--unit-color': selectedRobot.color } as React.CSSProperties}>
                  <Bot size={20} />
                </div>
                <div>
                  <strong>{selectedRobot.id}</strong>
                  <span>{selectedRobot.kind} autonomous unit</span>
                </div>
                <button type="button" aria-label="Open unit details"><ChevronDown size={14} /></button>
              </div>
              <div className="battery-block">
                <div><span>Battery reserve</span><strong>{Math.round(selectedRobot.battery)}%</strong></div>
                <div className="progress-track"><i style={{ width: `${selectedRobot.battery}%` }} /></div>
              </div>
              <div className="unit-mini-grid">
                <div><span>HEALTH</span><strong>{Math.round(selectedRobot.health)}%</strong></div>
                <div><span>WORKLOAD</span><strong>{Math.round(selectedRobot.load)}%</strong></div>
                <div><span>COMPLETED</span><strong>{selectedRobot.completedTasks}</strong></div>
              </div>
              <div className="mission-assignment">
                <div className="assignment-icon"><Route size={15} /></div>
                <div>
                  <span>{selectedTask ? 'CURRENT MISSION' : 'READY FOR MISSION'}</span>
                  <strong>{selectedTask?.title ?? 'Awaiting peer auction bid'}</strong>
                </div>
                {selectedTask ? <Check size={15} /> : <Activity size={15} />}
              </div>
              <div className="peer-row">
                <span><Network size={12} /> {selectedRobot.peerIds.length} direct peers</span>
                <div className="peer-stack">
                  {selectedRobot.peerIds.slice(0, 3).map((peerId) => <i key={peerId}>{peerId.slice(-1)}</i>)}
                  <i>+{Math.max(0, selectedRobot.peerIds.length - 3)}</i>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-selection">
              <Crosshair size={22} />
              <span>Select a robot on the grid to inspect its state</span>
            </div>
          )}
        </section>

        <div className="feed-tabs">
          <button type="button" className={activityTab === 'activity' ? 'active' : ''} onClick={() => setActivityTab('activity')}>
            Live activity
            <span>{snapshot.events.length}</span>
          </button>
          <button type="button" className={activityTab === 'missions' ? 'active' : ''} onClick={() => setActivityTab('missions')}>
            Mission queue
            <span>{queuedTasks.length}</span>
          </button>
        </div>

        {activityTab === 'activity' ? (
          <section className="activity-feed">
            <div className="feed-section-title">
              <span><Radio size={13} /> EVENT STREAM</span>
              <small>REAL-TIME</small>
            </div>
            <div className="event-list">
              {snapshot.events.slice(0, 7).map((event, index) => (
                <EventRow event={event} key={event.id} first={index === 0} elapsed={snapshot.elapsedSeconds} />
              ))}
            </div>
          </section>
        ) : (
          <section className="activity-feed mission-feed">
            <div className="feed-section-title">
              <span><Boxes size={13} /> ACTIVE MISSIONS</span>
              <small>{activeTasks.length} TOTAL</small>
            </div>
            <div className="mission-list">
              {activeTasks.slice(0, 8).map((task) => (
                <MissionRow task={task} key={task.id} onSelectRobot={setSelectedRobotId} />
              ))}
            </div>
          </section>
        )}

        <section className="resilience-card">
          <div className="resilience-head">
            <div className="resilience-icon"><Cpu size={16} /></div>
            <div><span>RESILIENCE STATUS</span><strong>Autonomous recovery</strong></div>
            <span className="resilience-score">A+</span>
          </div>
          <div className="resilience-metrics">
            <div><span>CONTROLLER</span><strong className={snapshot.controllerOnline ? 'safe' : 'warning'}>{snapshot.controllerOnline ? 'ONLINE' : 'BYPASSED'}</strong></div>
            <div><span>FAULTED UNITS</span><strong>{faultedRobots}</strong></div>
            <div><span>LAST RECOVERY</span><strong>0.6s</strong></div>
          </div>
          <button type="button" onClick={engine.recoverFailures.bind(engine)} disabled={faultedRobots === 0}>
            <RefreshCw size={13} /> Recover failed units
          </button>
        </section>

        <div className="system-footer">
          <span><Wifi size={12} /> Packet integrity 99.98%</span>
          <span>v1.0.0</span>
        </div>
      </aside>

      {toast ? <div className="toast-message"><Check size={15} />{toast}</div> : null}
    </div>
  )
}

const ROBOT_KIND_LEGEND = [
  { label: 'Scout', color: '#65d6a0' },
  { label: 'Hauler', color: '#e8b86d' },
  { label: 'Inspector', color: '#8e9df2' },
  { label: 'Lifter', color: '#70b7dd' },
]

interface LayerToggleProps {
  label: string
  active: boolean
  onClick: () => void
}

function LayerToggle({ label, active, onClick }: LayerToggleProps) {
  return (
    <button type="button" className="layer-toggle" onClick={onClick}>
      <span>{label}</span>
      <i className={active ? 'active' : ''}><b /></i>
    </button>
  )
}

interface MetricCardProps {
  icon: typeof Target
  label: string
  value: string
  detail: string
  trend: string
  tone: 'green' | 'blue' | 'amber' | 'violet'
  chart: number[]
}

function MetricCard({ icon: Icon, label, value, detail, trend, tone, chart }: MetricCardProps) {
  const points = chart
    .map((value, index) => `${(index / (chart.length - 1)) * 104},${38 - (value / 60) * 32}`)
    .join(' ')
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-head">
        <div className="metric-icon"><Icon size={15} /></div>
        <span>{label}</span>
        <i className="metric-trend">{trend}</i>
      </div>
      <div className="metric-body">
        <div><strong>{value}</strong><span>{detail}</span></div>
        <svg viewBox="0 0 104 42" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`metric-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M0,42 L${points} L104,42 Z`} fill={`url(#metric-${tone})`} />
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </article>
  )
}

function EventRow({ event, first, elapsed }: { event: MissionEvent; first: boolean; elapsed: number }) {
  const age = Math.max(0, elapsed - event.timestamp)
  const time = age < 2 ? 'NOW' : age < 60 ? `${Math.floor(age)}S` : `${Math.floor(age / 60)}M`
  return (
    <div className={`event-row ${first ? 'new' : ''}`}>
      <div className={`event-icon ${event.severity}`}>{eventIcon(event)}</div>
      <div className="event-copy">
        <div><strong>{event.title}</strong><time>{time}</time></div>
        <p>{event.detail}</p>
      </div>
    </div>
  )
}

function eventIcon(event: MissionEvent) {
  if (event.type === 'negotiation') return <GitBranch size={13} />
  if (event.type === 'recovery') return <ShieldCheck size={13} />
  if (event.type === 'battery') return <BatteryCharging size={13} />
  if (event.type === 'failure') return <AlertTriangle size={13} />
  if (event.type === 'system') return <Network size={13} />
  return <Route size={13} />
}

function MissionRow({ task, onSelectRobot }: { task: MissionTask; onSelectRobot: (id: string) => void }) {
  return (
    <div className="mission-row">
      <div className={`priority-marker ${task.priority.toLowerCase()}`} />
      <div className="mission-copy">
        <div><strong>{task.id}</strong><span>{task.priority}</span></div>
        <p>{task.title}</p>
        <button type="button" disabled={!task.assigneeId} onClick={() => task.assigneeId && onSelectRobot(task.assigneeId)}>
          {task.assigneeId ? `${task.assigneeId} · ${task.status}` : 'Awaiting peer bid'}
        </button>
      </div>
      <Clock3 size={13} />
    </div>
  )
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}
