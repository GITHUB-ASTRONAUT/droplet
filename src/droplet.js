/**
 * droplet.js —— 三体探测器「水滴」
 *
 * 行为：
 *  - 弹簧跟随：朝鼠标方向偏航，限位 reach
 *  - 随速度倾斜 + 挤压拉伸（像有质量的流体）
 *  - 滞后拖尾：数颗更小的残影
 *  - 空闲 1.2s 后进入失重漂浮
 *  - reticle: true 时加雷达跟踪环 + 读数（黑暗森林 HUD）
 *
 * createDroplet(mount, {
 *   src, size,          // size = 水滴本体高度（px）
 *   reach, tilt, squash, float, trail,
 *   compact,            // 文章页小徽章模式
 *   reticle,            // 跟踪环
 *   alt,
 *   fill = 0.457,       // 抠图主体占画面高度比例（实测）
 * })
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function createDroplet(mount, opts = {}) {
  if (!mount) return null

  const cfg = {
    src: '',
    size: 120,
    reach: 26,
    tilt: 10,
    squash: 0.12,
    float: 5,
    trail: 6,
    compact: false,
    reticle: false,
    alt: '',
    fill: 0.457,
    ...opts,
  }

  const box = cfg.size / cfg.fill      // 图片整体高度（含透明留白）
  const trails = Math.max(0, cfg.trail | 0)

  /* ---------- 组装 DOM ---------- */
  const root = document.createElement('div')
  root.className = 'droplet' + (cfg.compact ? ' droplet--compact' : '')
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;'

  const assembly = document.createElement('div')
  assembly.className = 'droplet__assembly'
  assembly.style.cssText = 'position:absolute;left:50%;top:50%;will-change:transform;'
  root.appendChild(assembly)

  const mkImg = (cls, scale, alt, ariaHidden) => {
    const el = document.createElement('img')
    el.className = cls
    el.src = cfg.src
    el.alt = alt
    el.setAttribute('aria-hidden', ariaHidden ? 'true' : 'false')
    const h = box * scale
    el.style.cssText =
      `position:absolute;left:50%;top:50%;height:${h}px;width:auto;max-width:none;` +
      `transform:translate(-50%,-50%);transform-origin:50% 50%;`
    return el
  }

  const core = mkImg('droplet__core', 1, cfg.alt, false)

  /* 尾焰光晕：水滴加速时身后那圈蓝白色的光（书里的描写） */
  if (!cfg.compact) {
    const halo = document.createElement('i')
    halo.className = 'droplet__halo'
    const hr = cfg.size * 1.15
    halo.style.cssText =
      `position:absolute;left:${-hr}px;top:${-hr}px;width:${hr * 2}px;height:${hr * 2}px;` +
      `border-radius:50%;pointer-events:none;` +
      `background:radial-gradient(circle, rgba(159,194,232,.16) 0%, rgba(159,194,232,.05) 42%, transparent 68%);`
    assembly.appendChild(halo)
  }

  assembly.appendChild(core)

  /* 雷达跟踪环：跟着水滴一起动 */
  if (cfg.reticle && !cfg.compact) {
    const ring = document.createElement('i')
    ring.className = 'reticle'
    const r = cfg.size * 0.92                    // 环半径（相对水滴本体）
    ring.style.cssText += `width:${r * 2}px;height:${r * 2}px;left:${-r}px;top:${-r}px;`
    assembly.appendChild(ring)

    const label = document.createElement('i')
    label.className = 'reticle-label'
    label.textContent = 'PROBE-001 // MIRROR SURFACE'
    /* 只暴露环半径，标签的落位交给 CSS（窄屏要换个摆法） */
    label.style.setProperty('--reticle-r', `${r.toFixed(1)}px`)
    assembly.appendChild(label)
  }

  /* 拖尾 */
  const trailEls = []
  for (let i = 0; i < trails; i++) {
    const s = 0.86 - i * 0.09
    const t = mkImg('droplet__trail', s, '', true)
    t.style.opacity = String(Math.max(0.05, 0.34 - i * 0.05))
    root.appendChild(t)
    trailEls.push(t)
  }

  mount.appendChild(root)

  /* ---------- 物理 ---------- */
  const state = {
    x: 0, y: 0, vx: 0, vy: 0,          // 偏移量与速度
    tx: 0, ty: 0,                       // 目标偏移
    mx: -1, my: -1,                     // 鼠标
    lastMove: 0,
    t: 0,
  }

  function onMove(e) {
    state.mx = e.clientX
    state.my = e.clientY
    state.lastMove = performance.now()
  }

  if (!REDUCED) {
    window.addEventListener('pointermove', onMove, { passive: true })
  }

  /* 以挂载点为圆心，计算鼠标方向的限位偏移 */
  function retarget() {
    const rect = root.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = state.mx - cx
    const dy = state.my - cy
    const dist = Math.hypot(dx, dy) || 1
    const reach = cfg.reach * Math.min(1, dist / 320)   // 远处才到满幅
    state.tx = (dx / dist) * reach
    state.ty = (dy / dist) * reach
  }

  const trailState = trailEls.map(() => ({ x: 0, y: 0 }))
  let raf = null
  let last = performance.now()

  function frame(now) {
    raf = null
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    state.t += dt

    retarget()

    /* 空闲 → 失重漂浮目标 */
    const idle = now - state.lastMove > 1200
    let gx = state.tx
    let gy = state.ty
    if (idle || REDUCED) {
      gx = Math.sin(state.t * 0.7) * cfg.float
      gy = Math.cos(state.t * 0.53) * cfg.float * 0.8
    }

    /* 弹簧（半隐式欧拉） */
    const K = 34       // 刚度
    const D = 9.5      // 阻尼
    state.vx += ((gx - state.x) * K - state.vx * D) * dt
    state.vy += ((gy - state.y) * K - state.vy * D) * dt
    state.x += state.vx * dt
    state.y += state.vy * dt

    const speed = Math.hypot(state.vx, state.vy)
    const ang = Math.atan2(state.vy, state.vx)
    const tilt = Math.max(-cfg.tilt, Math.min(cfg.tilt, state.vx * 0.14))
    const stretch = 1 + Math.min(cfg.squash, speed * 0.0011)
    const squeeze = 1 / Math.sqrt(stretch)

    assembly.style.transform =
      `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) ` +
      `rotate(${tilt.toFixed(2)}deg) ` +
      `rotate(${ang}rad) scale(${stretch.toFixed(4)}, ${squeeze.toFixed(4)}) rotate(${(-ang).toFixed(3)}rad)`

    /* 拖尾：逐级滞后跟随 */
    let px = state.x, py = state.y
    trailState.forEach((s, i) => {
      const lag = 0.24 - i * 0.025
      s.x += (px - s.x) * lag
      s.y += (py - s.y) * lag
      trailEls[i].style.transform =
        `translate(-50%,-50%) translate3d(${(s.x - 6 * (i + 1)).toFixed(2)}px, ${(s.y + 3 * (i + 1)).toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg)`
      px = s.x
      py = s.y
    })

    if (!REDUCED) raf = requestAnimationFrame(frame)
  }

  if (REDUCED) {
    frame(performance.now())     // 只画一帧静态
  } else {
    raf = requestAnimationFrame(frame)
  }

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      root.remove()
    },
  }
}
