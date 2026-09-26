import { useCallback, useEffect, useRef, useState } from 'react'
import { CHARGING_STATIONS, OBSTACLES, OPERATING_ZONES, SimulationEngine } from '../simulation/engine'
import type { MapLayers, Robot } from '../simulation/types'

interface SimulationCanvasProps {
  engine: SimulationEngine
  layers: MapLayers
  selectedRobotId: string | null
  onSelect: (robotId: string | null) => void
}

interface HoverState {
  robot: Robot
  left: number
  top: number
}

interface CanvasSize {
  width: number
  height: number
}

export function SimulationCanvas({ engine, layers, selectedRobotId, onSelect }: SimulationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0 })
  const selectedRef = useRef<string | null>(selectedRobotId)
  const layersRef = useRef(layers)
  const [hover, setHover] = useState<HoverState | null>(null)

  selectedRef.current = selectedRobotId
  layersRef.current = layers

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      sizeRef.current = { width, height }
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let animationFrame = 0
    const draw = () => {
      const canvasElement = canvasRef.current
      if (canvasElement) {
        const context = canvasElement.getContext('2d')
        if (context) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          context.setTransform(dpr, 0, 0, dpr, 0, 0)
          context.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height)
          drawMap(context, sizeRef.current, engine, layersRef.current, selectedRef.current)
        }
      }
      animationFrame = requestAnimationFrame(draw)
    }
    animationFrame = requestAnimationFrame(draw)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationFrame)
    }
  }, [engine])

  const pointToCell = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const padding = 22
      const cellWidth = (rect.width - padding * 2) / engine.width
      const cellHeight = (rect.height - padding * 2) / engine.height
      return {
        x: Math.max(0, Math.min(engine.width - 1, Math.floor((clientX - rect.left - padding) / cellWidth))),
        y: Math.max(0, Math.min(engine.height - 1, Math.floor((clientY - rect.top - padding) / cellHeight))),
        left: clientX - rect.left,
        top: clientY - rect.top,
      }
    },
    [engine],
  )

  const findRobotAt = useCallback(
    (x: number, y: number) => {
      let nearest: Robot | undefined
      let nearestDistance = 0.72
      for (const robot of engine.getRobots()) {
        const distance = Math.hypot(robot.x - x, robot.y - y)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = robot
        }
      }
      return nearest
    },
    [engine],
  )

  return (
    <div ref={containerRef} className="simulation-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="simulation-canvas"
        aria-label="Real-time 2D industrial robot grid"
        onClick={(event) => {
          const point = pointToCell(event.clientX, event.clientY)
          if (point) onSelect(findRobotAt(point.x, point.y)?.id ?? null)
        }}
        onPointerMove={(event) => {
          const point = pointToCell(event.clientX, event.clientY)
          if (!point) return
          const robot = findRobotAt(point.x, point.y)
          setHover(robot ? { robot, left: point.left, top: point.top } : null)
        }}
        onPointerLeave={() => setHover(null)}
      />
      {hover ? (
        <div
          className="canvas-tooltip"
          style={{ left: Math.min(hover.left + 12, sizeRef.current.width - 148), top: Math.max(10, hover.top - 58) }}
        >
          <div className="tooltip-heading">
            <span className="tooltip-dot" style={{ background: hover.robot.color }} />
            <strong>{hover.robot.id}</strong>
            <span>{hover.robot.status}</span>
          </div>
          <div className="tooltip-meta">
            {hover.robot.kind} · {Math.round(hover.robot.battery)}% battery
          </div>
        </div>
      ) : null}
    </div>
  )
}

function drawMap(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  engine: SimulationEngine,
  layers: MapLayers,
  selectedRobotId: string | null,
) {
  const padding = 22
  const cellWidth = (size.width - padding * 2) / engine.width
  const cellHeight = (size.height - padding * 2) / engine.height
  const scale = Math.min(cellWidth, cellHeight)
  const toX = (value: number) => padding + (value + 0.5) * cellWidth
  const toY = (value: number) => padding + (value + 0.5) * cellHeight

  context.fillStyle = '#0a1412'
  roundedRect(context, 0, 0, size.width, size.height, 14)
  context.fill()

  drawGrid(context, engine.width, engine.height, padding, cellWidth, cellHeight)
  drawZones(context, toX, toY, cellWidth, cellHeight, layers.labels)
  if (layers.heatmap) drawHeatmap(context, engine.getRobots(), toX, toY, cellWidth, cellHeight)
  drawObstacles(context, toX, toY, cellWidth, cellHeight)
  drawChargingStations(context, toX, toY, scale)
  if (layers.routes) drawRoutes(context, engine.getRobots(), toX, toY, selectedRobotId)
  drawTasks(context, engine, toX, toY, scale, layers.labels)
  drawRobots(context, engine.getRobots(), toX, toY, scale, selectedRobotId)
  if (layers.conflicts) drawConflicts(context, engine.getConflicts(), toX, toY, scale)
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: number,
  cellWidth: number,
  cellHeight: number,
) {
  context.save()
  context.strokeStyle = 'rgba(164, 190, 180, 0.075)'
  context.lineWidth = 1
  context.beginPath()
  for (let x = 0; x <= width; x += 1) {
    const lineX = padding + x * cellWidth
    context.moveTo(lineX, padding)
    context.lineTo(lineX, padding + height * cellHeight)
  }
  for (let y = 0; y <= height; y += 1) {
    const lineY = padding + y * cellHeight
    context.moveTo(padding, lineY)
    context.lineTo(padding + width * cellWidth, lineY)
  }
  context.stroke()
  context.restore()
}

function drawZones(
  context: CanvasRenderingContext2D,
  toX: (value: number) => number,
  toY: (value: number) => number,
  cellWidth: number,
  cellHeight: number,
  labels: boolean,
) {
  context.save()
  for (const zone of OPERATING_ZONES) {
    const x = toX(zone.x) - cellWidth / 2
    const y = toY(zone.y) - cellHeight / 2
    const width = zone.width * cellWidth
    const height = zone.height * cellHeight
    context.fillStyle = `${zone.color}0d`
    context.strokeStyle = `${zone.color}40`
    context.lineWidth = 1
    context.setLineDash([3, 4])
    roundedRect(context, x, y, width, height, 5)
    context.fill()
    context.stroke()
    context.setLineDash([])
    if (labels) {
      context.fillStyle = `${zone.color}bd`
      context.font = '600 8px Inter, sans-serif'
      context.textBaseline = 'top'
      context.letterSpacing = '1px'
      context.fillText(zone.label, x + 8, y + 7)
    }
  }
  context.restore()
}

function drawObstacles(
  context: CanvasRenderingContext2D,
  toX: (value: number) => number,
  toY: (value: number) => number,
  cellWidth: number,
  cellHeight: number,
) {
  context.save()
  for (const obstacle of OBSTACLES) {
    const x = toX(obstacle.x) - cellWidth / 2
    const y = toY(obstacle.y) - cellHeight / 2
    const width = obstacle.width * cellWidth
    const height = obstacle.height * cellHeight
    context.fillStyle = '#17221f'
    context.strokeStyle = 'rgba(141, 165, 156, 0.18)'
    roundedRect(context, x, y, width, height, 3)
    context.fill()
    context.stroke()
    context.strokeStyle = 'rgba(141, 165, 156, 0.075)'
    context.beginPath()
    for (let offset = -height; offset < width; offset += 6) {
      context.moveTo(x + offset, y + height)
      context.lineTo(x + offset + height, y)
    }
    context.stroke()
  }
  context.restore()
}

function drawHeatmap(
  context: CanvasRenderingContext2D,
  robots: readonly Robot[],
  toX: (value: number) => number,
  toY: (value: number) => number,
  cellWidth: number,
  cellHeight: number,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'
  for (const robot of robots) {
    const radius = Math.max(10, Math.min(cellWidth, cellHeight) * 2.3)
    const gradient = context.createRadialGradient(toX(robot.x), toY(robot.y), 0, toX(robot.x), toY(robot.y), radius)
    gradient.addColorStop(0, `${robot.color}22`)
    gradient.addColorStop(1, `${robot.color}00`)
    context.fillStyle = gradient
    context.beginPath()
    context.arc(toX(robot.x), toY(robot.y), radius, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawChargingStations(
  context: CanvasRenderingContext2D,
  toX: (value: number) => number,
  toY: (value: number) => number,
  scale: number,
) {
  context.save()
  for (const station of CHARGING_STATIONS) {
    const x = toX(station.x)
    const y = toY(station.y)
    context.fillStyle = '#65d6a018'
    context.strokeStyle = '#65d6a080'
    context.lineWidth = 1
    context.beginPath()
    context.arc(x, y, Math.max(8, scale * 0.65), 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = '#65d6a0'
    context.font = '700 8px Inter, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('ϟ', x, y)
  }
  context.restore()
}

function drawRoutes(
  context: CanvasRenderingContext2D,
  robots: readonly Robot[],
  toX: (value: number) => number,
  toY: (value: number) => number,
  selectedRobotId: string | null,
) {
  context.save()
  let visibleRoutes = 0
  for (const robot of robots) {
    if (robot.path.length === 0 || robot.failed) continue
    const selected = robot.id === selectedRobotId
    if (!selected && visibleRoutes >= 100) continue
    visibleRoutes += 1
    context.beginPath()
    context.moveTo(toX(robot.x), toY(robot.y))
    const path = selected ? robot.path : robot.path.slice(0, 24)
    for (const point of path) context.lineTo(toX(point.x), toY(point.y))
    context.strokeStyle = selected ? '#d5ffe9' : `${robot.color}${selected ? 'ff' : '55'}`
    context.lineWidth = selected ? 1.8 : 0.9
    context.setLineDash(selected ? [] : [3, 4])
    context.stroke()
  }
  context.setLineDash([])
  context.restore()
}

function drawTasks(
  context: CanvasRenderingContext2D,
  engine: SimulationEngine,
  toX: (value: number) => number,
  toY: (value: number) => number,
  scale: number,
  labels: boolean,
) {
  context.save()
  for (const task of engine.getTasks()) {
    if (task.status === 'Completed') continue
    const point = task.status === 'Allocated' ? task.pickup : task.destination
    const x = toX(point.x)
    const y = toY(point.y)
    const size = Math.max(2.8, scale * 0.22)
    context.save()
    context.translate(x, y)
    context.rotate(Math.PI / 4)
    context.fillStyle = task.priority === 'Critical' ? '#eaa66f' : '#b8c8c1'
    context.globalAlpha = task.status === 'Queued' ? 0.46 : 0.84
    context.fillRect(-size, -size, size * 2, size * 2)
    context.restore()
    if (labels && task.priority === 'Critical') {
      context.fillStyle = '#eaa66f'
      context.font = '600 8px Inter, sans-serif'
      context.textAlign = 'center'
      context.fillText('!', x, y + 2)
    }
  }
  context.restore()
}

function drawRobots(
  context: CanvasRenderingContext2D,
  robots: readonly Robot[],
  toX: (value: number) => number,
  toY: (value: number) => number,
  scale: number,
  selectedRobotId: string | null,
) {
  const size = Math.max(2.5, Math.min(5.2, scale * 0.42))
  context.save()
  for (const robot of robots) {
    const x = toX(robot.x)
    const y = toY(robot.y)
    if (robot.id === selectedRobotId) {
      context.strokeStyle = '#ffffffb8'
      context.lineWidth = 1
      context.beginPath()
      context.arc(x, y, size + 5, 0, Math.PI * 2)
      context.stroke()
      context.strokeStyle = '#d5ffe955'
      context.beginPath()
      context.arc(x, y, size + 8 + Math.sin(performance.now() / 260) * 1.2, 0, Math.PI * 2)
      context.stroke()
    }
    if (robot.failed) {
      context.strokeStyle = '#eb6b6b'
      context.lineWidth = 1.6
      context.beginPath()
      context.moveTo(x - size, y - size)
      context.lineTo(x + size, y + size)
      context.moveTo(x + size, y - size)
      context.lineTo(x - size, y + size)
      context.stroke()
      continue
    }
    context.fillStyle = `${robot.color}24`
    context.beginPath()
    context.arc(x, y, size * 1.7, 0, Math.PI * 2)
    context.fill()
    context.save()
    context.translate(x, y)
    context.rotate(robot.heading)
    context.fillStyle = robot.color
    context.beginPath()
    context.moveTo(size * 1.35, 0)
    context.lineTo(-size * 0.75, size * 0.7)
    context.lineTo(-size * 0.38, 0)
    context.lineTo(-size * 0.75, -size * 0.7)
    context.closePath()
    context.fill()
    if (size > 4) {
      context.fillStyle = '#0a1412'
      context.beginPath()
      context.arc(0, 0, Math.max(0.7, size * 0.2), 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }
  context.restore()
}

function drawConflicts(
  context: CanvasRenderingContext2D,
  conflicts: ReturnType<SimulationEngine['getConflicts']>,
  toX: (value: number) => number,
  toY: (value: number) => number,
  scale: number,
) {
  context.save()
  for (const conflict of conflicts) {
    const x = toX(conflict.x)
    const y = toY(conflict.y)
    const pulse = 1 + Math.sin(conflict.age * 7) * 0.12
    const radius = Math.max(8, scale * 0.72) * pulse
    context.strokeStyle = '#f3a45d'
    context.fillStyle = '#f3a45d1c'
    context.lineWidth = 1.2
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = '#f3a45d'
    context.font = '700 9px Inter, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('↔', x, y)
  }
  context.restore()
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}
