/**
 * threebody.js - a quiet figure-eight three-body system for Polar Day.
 *
 * The three suns use the Chenciner-Montgomery figure-eight initial state,
 * integrated with a leapfrog solver. Trails make the shared gravitational
 * path visible instead of reducing the motif to three static circles.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const G = 1
const MASS = 1
const SOFTENING = 0.024
const TIME_SCALE = 0.42
const MAX_TRAIL = 210

const INITIAL_POSITIONS = [
  [-0.97000436, 0.24308753],
  [0.97000436, -0.24308753],
  [0, 0],
]

const INITIAL_VELOCITIES = [
  [0.466203685, 0.43236573],
  [0.466203685, 0.43236573],
  [-0.93240737, -0.86473146],
]

const SUNS = [
  {
    core: '#fffdf1',
    mid: '#ffd274',
    edge: '#ff7b36',
    rgb: '255, 133, 54',
  },
  {
    core: '#fff8c9',
    mid: '#ffc247',
    edge: '#e94b38',
    rgb: '255, 168, 62',
  },
  {
    core: '#fff0df',
    mid: '#ff9a64',
    edge: '#b92f3d',
    rgb: '245, 91, 66',
  },
]

const copyState = (source) => source.map(([x, y]) => ({ x, y }))

export function initThreeBody(canvas) {
  const ctx = canvas?.getContext('2d')
  if (!ctx) {
    return { setActive() {}, destroy() {} }
  }

  let width = 0
  let height = 0
  let dpr = 1
  let active = false
  let raf = null
  let last = performance.now()
  let frameCount = 0
  let resizeObserver = null

  let positions = copyState(INITIAL_POSITIONS)
  let velocities = copyState(INITIAL_VELOCITIES)
  let trails = [[], [], []]

  function reset() {
    positions = copyState(INITIAL_POSITIONS)
    velocities = copyState(INITIAL_VELOCITIES)
    trails = [[], [], []]
    last = performance.now()
    frameCount = 0
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!raf) draw(performance.now())
  }

  function accelerations() {
    const result = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[j].x - positions[i].x
        const dy = positions[j].y - positions[i].y
        const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING
        const invR3 = 1 / (r2 * Math.sqrt(r2))
        const factor = G * MASS * invR3

        result[i].x += dx * factor
        result[i].y += dy * factor
        result[j].x -= dx * factor
        result[j].y -= dy * factor
      }
    }

    return result
  }

  function step(dt) {
    const a0 = accelerations()

    for (let i = 0; i < positions.length; i += 1) {
      velocities[i].x += a0[i].x * dt * 0.5
      velocities[i].y += a0[i].y * dt * 0.5
      positions[i].x += velocities[i].x * dt
      positions[i].y += velocities[i].y * dt
    }

    const a1 = accelerations()
    for (let i = 0; i < positions.length; i += 1) {
      velocities[i].x += a1[i].x * dt * 0.5
      velocities[i].y += a1[i].y * dt * 0.5
    }
  }

  function advance(delta) {
    const substeps = Math.max(1, Math.ceil(delta / 0.002))
    const dt = delta / substeps
    for (let i = 0; i < substeps; i += 1) step(dt)

    if (positions.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) reset()
  }

  function camera() {
    const small = width < 760
    return {
      x: small ? width * 0.84 : width * 0.82,
      y: small ? Math.min(height * 0.23, 220) : height * 0.31,
      scale: Math.min(small ? width * 0.18 : width * 0.13, height * 0.27),
    }
  }

  function project(point, view) {
    return {
      x: view.x + point.x * view.scale,
      y: view.y + point.y * view.scale,
    }
  }

  function drawTrail(bodyIndex, view) {
    const trail = trails[bodyIndex]
    if (trail.length < 2) return

    const color = SUNS[bodyIndex].rgb
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let i = 1; i < trail.length; i += 1) {
      const p0 = project(trail[i - 1], view)
      const p1 = project(trail[i], view)
      const progress = i / trail.length
      const alpha = progress * progress * 0.25

      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`
      ctx.lineWidth = 0.55 + progress * 1.8
      ctx.stroke()
    }
  }

  function drawSun(bodyIndex, view, time) {
    const point = project(positions[bodyIndex], view)
    const palette = SUNS[bodyIndex]
    const radius = Math.max(8, Math.min(28, view.scale * 0.082))
    const pulse = 1 + Math.sin(time * 1.7 + bodyIndex * 2.1) * 0.045
    const r = radius * pulse

    const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r * 5)
    halo.addColorStop(0, `rgba(${palette.rgb}, 0.22)`)
    halo.addColorStop(0.26, `rgba(${palette.rgb}, 0.12)`)
    halo.addColorStop(1, `rgba(${palette.rgb}, 0)`)
    ctx.beginPath()
    ctx.arc(point.x, point.y, r * 5, 0, Math.PI * 2)
    ctx.fillStyle = halo
    ctx.fill()

    const flareAngle = Math.atan2(point.y - view.y, point.x - view.x) + Math.PI
    ctx.save()
    ctx.translate(point.x, point.y)
    ctx.rotate(flareAngle)
    ctx.scale(3.1, 0.42)
    const flare = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.25)
    flare.addColorStop(0, `rgba(${palette.rgb}, 0.34)`)
    flare.addColorStop(0.35, `rgba(${palette.rgb}, 0.12)`)
    flare.addColorStop(1, `rgba(${palette.rgb}, 0)`)
    ctx.beginPath()
    ctx.arc(0, 0, r * 2.25, 0, Math.PI * 2)
    ctx.fillStyle = flare
    ctx.fill()
    ctx.restore()

    ctx.beginPath()
    ctx.arc(point.x, point.y, r * 1.82, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${palette.rgb}, 0.24)`
    ctx.lineWidth = 1
    ctx.stroke()

    const disc = ctx.createRadialGradient(
      point.x - r * 0.25,
      point.y - r * 0.32,
      r * 0.04,
      point.x,
      point.y,
      r
    )
    disc.addColorStop(0, palette.core)
    disc.addColorStop(0.24, palette.core)
    disc.addColorStop(0.55, palette.mid)
    disc.addColorStop(1, palette.edge)
    ctx.beginPath()
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2)
    ctx.fillStyle = disc
    ctx.fill()

    ctx.beginPath()
    ctx.arc(point.x - r * 0.26, point.y - r * 0.28, r * 0.16, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.fill()
  }

  function draw(now = performance.now()) {
    if (!width || !height) return
    const view = camera()
    const time = now / 1000

    ctx.clearRect(0, 0, width, height)

    /* Faint gravity chords: the geometry between the bodies, not a box. */
    ctx.save()
    ctx.setLineDash([2, 7])
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(91, 76, 70, 0.08)'
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = project(positions[i], view)
        const b = project(positions[j], view)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    ctx.restore()

    for (let i = 0; i < trails.length; i += 1) drawTrail(i, view)
    for (let i = 0; i < positions.length; i += 1) drawSun(i, view, time)
  }

  function frame(now) {
    raf = null
    if (!active) return

    const elapsed = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    advance(elapsed * TIME_SCALE)
    frameCount += 1

    if (frameCount % 2 === 0) {
      for (let i = 0; i < trails.length; i += 1) {
        trails[i].push({ x: positions[i].x, y: positions[i].y })
        if (trails[i].length > MAX_TRAIL) trails[i].shift()
      }
    }

    draw(now)
    raf = requestAnimationFrame(frame)
  }

  function setActive(next) {
    active = Boolean(next)
    if (!active) {
      if (raf) cancelAnimationFrame(raf)
      raf = null
      return
    }

    if (REDUCED) {
      draw(performance.now())
      return
    }

    last = performance.now()
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function destroy() {
    active = false
    if (raf) cancelAnimationFrame(raf)
    raf = null
    resizeObserver?.disconnect()
    window.removeEventListener('resize', resize)
  }

  window.addEventListener('resize', resize)
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
  }

  reset()
  resize()

  return { setActive, destroy }
}
