/**
 * starfield.js —— 黑暗森林
 *
 * 稀疏、冷、安静。不做星云、不做亮星团——
 * 黑暗森林里的星空是藏起来的，不是拿来欣赏的。
 *
 * 运动只来自两个地方：
 *   1. 恒定的缓慢漂移（船在走，星在退），不跟鼠标；
 *   2. 偶尔一颗流星划过，打破静止。
 *
 * 星空是一层钉在视口上的幕布：不跟鼠标，也不跟滚动。以前给星点挂了 2% 的滚动量，
 * 快速拖动时整片星会平移一下（还会在上下边界跳），看着像背景粘着页面跑，已经去掉。
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DRIFT_X = 5.5      // px/s，漂移基准速度（× 每颗星的深度）
const DRIFT_Y = -1.8
const METEOR_MIN_GAP = 5   // 秒
const METEOR_MAX_GAP = 13

export function initStarfield() {
  const canvas = document.createElement('canvas')
  canvas.className = 'starfield'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.prepend(canvas)

  const ctx = canvas.getContext('2d')
  const DPR = Math.min(2, window.devicePixelRatio || 1)

  let W = 0, H = 0
  let stars = []
  let meteors = []
  let nextMeteorAt = 0

  function resize() {
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = W * DPR
    canvas.height = H * DPR
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    seed()
  }

  function seed() {
    const n = Math.round(Math.min(170, (W * H) / 16000))
    stars = Array.from({ length: n }, () => {
      const z = 0.25 + Math.random() * 0.75          // 深度：越大越近越亮
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        z,
        r: 0.3 + z * 1.1,
        // 大部分冷白，极少数暗红（远处的红矮星）
        red: Math.random() < 0.06,
        tw: Math.random() * Math.PI * 2,              // 闪烁相位
        ts: 0.2 + Math.random() * 0.6,                // 闪烁速度
      }
    })
    meteors = []
    nextMeteorAt = METEOR_MIN_GAP + Math.random() * (METEOR_MAX_GAP - METEOR_MIN_GAP)
  }

  /* --- 流星：一段带亮头的短划线，头尾各淡一次 --- */
  function spawnMeteor(t) {
    const speed = 260 + Math.random() * 320           // px/s
    const ang = Math.PI * (0.58 + Math.random() * 0.22)   // 向左下方划
    meteors.push({
      x: Math.random() * W * 1.1,
      y: -H * 0.08 + Math.random() * H * 0.42,
      vx: Math.cos(ang) * speed,
      vy: Math.abs(Math.sin(ang)) * speed * 0.55,
      len: 90 + Math.random() * 130,
      born: t,
      life: 1.3 + Math.random() * 1.1,
    })
  }

  function drawMeteors(t, dt) {
    meteors = meteors.filter((m) => t - m.born < m.life && m.x > -m.len * 2 && m.y < H + m.len)
    for (const m of meteors) {
      const e = t - m.born
      m.x += m.vx * dt
      m.y += m.vy * dt

      const u = e / m.life
      const a = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * 0.9
      if (a <= 0.01) continue

      const nx = m.vx / Math.hypot(m.vx, m.vy)
      const ny = m.vy / Math.hypot(m.vx, m.vy)
      const tx = m.x - nx * m.len
      const ty = m.y - ny * m.len

      const g = ctx.createLinearGradient(m.x, m.y, tx, ty)
      g.addColorStop(0, `rgba(226, 236, 248, ${(a * 0.85).toFixed(3)})`)
      g.addColorStop(0.35, `rgba(180, 208, 238, ${(a * 0.28).toFixed(3)})`)
      g.addColorStop(1, 'rgba(150, 180, 220, 0)')

      ctx.strokeStyle = g
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      /* 亮头 */
      ctx.beginPath()
      ctx.fillStyle = `rgba(240, 246, 252, ${a.toFixed(3)})`
      ctx.arc(m.x, m.y, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, W, H)
    for (const s of stars) {
      /* 恒定漂移：近处星动得多。位置只由时间和深度决定，不读滚动量 */
      const px = (((s.x + t * DRIFT_X * s.z) % W) + W) % W
      const py = s.y + t * DRIFT_Y * s.z
      const y = ((py % H) + H) % H

      const twinkle = 0.55 + 0.45 * Math.sin(t * s.ts + s.tw)
      const a = (0.16 + s.z * 0.5) * twinkle

      ctx.beginPath()
      ctx.fillStyle = s.red
        ? `rgba(255, 96, 84, ${(a * 0.8).toFixed(3)})`
        : `rgba(214, 226, 240, ${a.toFixed(3)})`
      ctx.arc(px, y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    if (t >= nextMeteorAt && meteors.length < 2) {
      spawnMeteor(t)
      nextMeteorAt = t + METEOR_MIN_GAP + Math.random() * (METEOR_MAX_GAP - METEOR_MIN_GAP)
    }
    drawMeteors(t, dt)
  }

  let raf = null
  let running = false
  let last = 0

  function loop(now) {
    raf = null
    const t = now / 1000
    /* 首帧和长时间切走回来时钳住步长，避免流星一步跨出屏幕 */
    const dt = last ? Math.min(0.05, t - last) : 1 / 60
    last = t
    draw(t, dt)
    if (running) raf = requestAnimationFrame(loop)
  }

  function start() {
    if (running || REDUCED) return
    running = true
    last = 0
    raf = requestAnimationFrame(loop)
  }
  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = null
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else start()
  })
  window.addEventListener('resize', resize)

  resize()
  if (REDUCED) draw(0)   // 静态一帧
  else start()
}
