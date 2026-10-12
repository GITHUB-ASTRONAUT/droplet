/**
 * motion.js —— 克制的动效（黑暗森林 HUD）
 *
 *  FadeIn        进入视口渐入（once，margin 50px）
 *  stagger       卡片错峰
 *  initViewport  舷窗视差：窗框不动，窗外景象动得多 + 极慢自漂移
 *  initHeroScroll 首屏滚动：内容上移淡出，视窗微推远
 *  initHudClock  HUD 读数：任务时钟 + 水滴距离缓慢递减
 *
 * 全部尊重 prefers-reduced-motion。
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'

const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v))

/* ------------------------------------------------------------
   FadeIn
------------------------------------------------------------ */
export function initFadeIn(root = document) {
  const items = root.querySelectorAll('.fade')
  if (REDUCED || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target
        const d = el.dataset
        el.style.setProperty('--fade-x', `${num(d.fadeX, 0)}px`)
        el.style.setProperty('--fade-y', `${num(d.fadeY, 22)}px`)
        el.style.transitionProperty = 'opacity, transform'
        el.style.transitionDuration = `${num(d.fadeDuration, 800)}ms`
        el.style.transitionTimingFunction = EASE
        el.style.transitionDelay = `${num(d.fadeDelay, 0)}ms`
        el.classList.add('is-in')
        io.unobserve(el)
      })
    },
    { rootMargin: '50px', threshold: 0 }
  )
  items.forEach((el) => io.observe(el))
}

/* 卡片错峰渐入 */
export function stagger(selector, step = 90, root = document) {
  root.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add('fade')
    el.dataset.fadeDelay = String(i * step)
    el.dataset.fadeY = '20'
  })
}

/* ------------------------------------------------------------
   舷窗视差 —— 深度的关键：
   窗框（近）不动，窗外景象（远）动得多。
   就像把脸凑近窗户，能看到更多外面。
------------------------------------------------------------ */
export function initViewport(root = document) {
  if (REDUCED) return
  const vp = root.querySelector('.viewport')
  if (!vp) return

  const wins = [...vp.querySelectorAll('.window')]
  if (!wins.length) return

  let mx = 0, my = 0, cx = 0, cy = 0, drift = 0
  let raf = null, last = performance.now()

  window.addEventListener(
    'pointermove',
    (e) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1
      my = (e.clientY / window.innerHeight) * 2 - 1
    },
    { passive: true }
  )

  function frame(now) {
    raf = null
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    cx += (mx - cx) * 0.055
    cy += (my - cy) * 0.055
    drift += dt * 0.05                     // 飞船一直在飞

    wins.forEach((w, i) => {
      const d = parseFloat(w.dataset.depth || '1')
      const img = w.querySelector('img')
      const glass = w.querySelector('.glass')
      if (!img) return

      /* 景象：鼠标反向 + 自漂移，越远（depth 小）动得越少 */
      const amp = 22 * d
      const dx = -cx * amp + Math.sin(drift + i * 1.9) * 3.5
      const dy = -cy * amp * 0.62 + Math.cos(drift * 1.35 + i * 2.6) * 2.6
      const scale = 1.18
      img.style.transform =
        `scale(${scale}) translate3d(${(dx / scale).toFixed(2)}px, ${(dy / scale).toFixed(2)}px, 0)`

      /* 玻璃反光：与鼠标同向（映的是舱内），幅度小 */
      if (glass) {
        glass.style.transform =
          `translate3d(${(cx * 14 * d).toFixed(2)}px, ${(cy * 9 * d).toFixed(2)}px, 0)`
      }
    })

    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
}

/* ------------------------------------------------------------
   首屏滚动：内容上移淡出，视窗微微推远
------------------------------------------------------------ */
export function initHeroScroll(root = document) {
  if (REDUCED) return
  const hero = root.querySelector('.hero')
  if (!hero) return
  const plaque = hero.querySelector('.hero__top')
  const cue = hero.querySelector('.hero__cue')
  const vp = hero.querySelector('.viewport')

  let ticking = false
  function update() {
    ticking = false
    const y = window.scrollY
    const h = window.innerHeight
    const p = Math.min(1, y / (h * 0.8))
    const fade = String(Math.max(0, 1 - p * 1.25))
    if (plaque) {
      plaque.style.transform = `translate3d(0, ${(-y * 0.18).toFixed(1)}px, 0)`
      plaque.style.opacity = fade
    }
    /* 只在真的滚动之后接管 opacity，否则会盖掉 .fade 的入场过渡 */
    if (cue) cue.style.opacity = y > 4 ? fade : ''
    if (vp) {
      vp.style.transform = `scale(${(1 + p * 0.035).toFixed(4)})`
    }
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    },
    { passive: true }
  )
  update()
}

/* ------------------------------------------------------------
   首屏标题指针视差：逐字跟随，越靠后的字跟得越少（拖曳感）
   入场动画用的是 translate/opacity，结束后让位给指针驱动
------------------------------------------------------------ */
export function initHeroTitle(root = document) {
  if (REDUCED) return
  const title = root.querySelector('.hero__title')
  if (!title) return
  const chars = [...title.querySelectorAll('.ch')]
  if (!chars.length) return

  let mx = 0, my = 0, cx = 0, cy = 0, raf = null
  window.addEventListener(
    'pointermove',
    (e) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1
      my = (e.clientY / window.innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(frame)
    },
    { passive: true }
  )

  function frame() {
    raf = null
    cx += (mx - cx) * 0.08
    cy += (my - cy) * 0.08
    const n = chars.length
    chars.forEach((c, i) => {
      const f = 1 - (i / Math.max(1, n - 1)) * 0.55      // 前面的字跟得多
      c.style.transform = `translate3d(${(-cx * 7 * f).toFixed(2)}px, ${(-cy * 4.5 * f).toFixed(2)}px, 0)`
    })
    if (Math.abs(mx - cx) > 0.001 || Math.abs(my - cy) > 0.001) {
      raf = requestAnimationFrame(frame)
    }
  }
}

/* ------------------------------------------------------------
   AnimatedText —— 滚动驱动逐字点亮（参考文档规格）
   字符 opacity 0.2 → 1，滚动区间 ['start 0.8', 'end 0.2']
------------------------------------------------------------ */
export function initAnimatedText(root = document) {
  const els = [...root.querySelectorAll('.atext')]
  if (!els.length) return

  /* 递归把文本节点切成单字符 <i>（保留既有元素如 .idx 的颜色） */
  function split(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment()
      for (const ch of node.textContent) {
        const i = document.createElement('i')
        i.textContent = ch
        frag.appendChild(i)
      }
      node.replaceWith(frag)
    })
    return [...el.querySelectorAll('i')]
  }

  const groups = els.map((el) => ({ el, chars: split(el) }))
  if (REDUCED) return

  let ticking = false
  function update() {
    ticking = false
    const vh = window.innerHeight
    groups.forEach(({ el, chars }) => {
      const rect = el.getBoundingClientRect()
      const start = vh * 0.8
      const end = vh * 0.2
      const p = Math.max(0, Math.min(1, (start - rect.top) / (start - end)))
      const n = chars.length
      chars.forEach((c, i) => {
        const t = Math.max(0, Math.min(1, p * (n + 4) - i))
        c.style.opacity = (0.2 + t * 0.8).toFixed(3)
      })
    })
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    },
    { passive: true }
  )
  window.addEventListener('resize', update)
  update()
}

/* ------------------------------------------------------------
   3D 倾斜 + 掠过光泽：关于舱段的相框
------------------------------------------------------------ */
export function initTilt(selector, { max = 8, lift = 10 } = {}, root = document) {
  if (REDUCED) return
  const els = [...root.querySelectorAll(selector)]
  els.forEach((el) => {
    el.style.transition = 'transform .5s cubic-bezier(.25,.1,.25,1)'
    el.style.transformStyle = 'preserve-3d'
    const sheen = el.querySelector('.sheen')

    el.addEventListener('pointerenter', () => { el.style.transition = 'transform .12s linear' })
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      el.style.transform =
        `perspective(900px) rotateY(${(px * max).toFixed(2)}deg) rotateX(${(-py * max).toFixed(2)}deg) translateY(${-lift}px)`
      if (sheen) {
        sheen.style.opacity = '1'
        sheen.style.transform = `translate3d(${(px * 60).toFixed(1)}%, ${(py * 40).toFixed(1)}%, 0)`
      }
    })
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .5s cubic-bezier(.25,.1,.25,1)'
      el.style.transform = ''
      if (sheen) sheen.style.opacity = '0'
    })
  })
}

/* 失重漂浮：无指针时缓慢正弦漂移（与 tilt 共存：tilt 悬停时接管 transform） */
export function initFloat(selector, { amp = 8, speed = 0.5 } = {}, root = document) {
  if (REDUCED) return
  const els = [...root.querySelectorAll(selector)]
  if (!els.length) return
  let raf = null
  const t0 = performance.now()
  function frame(now) {
    raf = null
    const t = (now - t0) / 1000
    els.forEach((el, i) => {
      if (el.matches(':hover')) return               // 悬停时归 tilt 管
      const y = Math.sin(t * speed + i * 1.7) * amp
      el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
    })
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
}

/* ------------------------------------------------------------
   HUD 读数：任务时钟 + 水滴距离缓慢逼近
   （它在过来。一直都是。）
------------------------------------------------------------ */
export function initHudClock(root = document) {
  const clock = root.querySelector('#hud-clock')
  const dist = root.querySelector('#hud-dist')
  if (!clock && !dist) return

  const t0 = Date.now()
  let d = 4.246                    // 光年，缓慢递减——探测器正在逼近

  function tick() {
    if (clock) {
      const s = Math.floor((Date.now() - t0) / 1000)
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      clock.textContent = `T+${hh}:${mm}:${ss}`
    }
    if (dist) {
      d -= 0.000004                // 每秒逼近一点点
      dist.textContent = d.toFixed(4)
    }
  }

  tick()
  if (!REDUCED) setInterval(tick, 1000)
}
