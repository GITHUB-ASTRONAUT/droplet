import './styles.css'
import { getAllPosts, getPost, renderMarkdown } from './posts.js'
import { createDroplet } from './droplet.js'
import {
  initFadeIn,
  initViewport,
  initHeroScroll,
  initHudClock,
  initHeroTitle,
  initAnimatedText,
  initTilt,
  initFloat,
  stagger,
} from './motion.js'
import { initStarfield } from './starfield.js'
import { initThreeBody } from './threebody.js'

const app = document.getElementById('app')
const asset = (name) => `${import.meta.env.BASE_URL}${name}`

/* 人工抠好的水滴（带 alpha，主体占画面高度约 45.7%） */
const DROPLET = asset('Droplet.png')

/* ------------------------------------------------------------
   小工具
------------------------------------------------------------ */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function formatDate(d) {
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

/** 首屏标题逐字入场 */
function heroTitle(text, step = 60) {
  return [...text]
    .map((ch, i) => `<span class="ch"><span class="ch__in" style="animation-delay:${i * step}ms">${esc(ch)}</span></span>`)
    .join('')
}

/* ------------------------------------------------------------
   HeroSection —— 驾驶舱舷窗
   四层：舱体 / 窗框隔柱 / 玻璃 / 景观
------------------------------------------------------------ */
function heroHTML() {
  const panes = ['B1.jpg', 'B2.jpg', 'B3.jpg', 'B4.jpg']
  const depths = [1.0, 0.78, 0.56, 0.38]   // 假弧形舱盖：越靠边动得越少

  const mullion = `
    <div class="mullion" aria-hidden="true">
      <i class="bolt bolt--t"></i><i class="bolt bolt--b"></i><i class="lamp"></i>
    </div>`

  const windows = panes
    .map(
      (f, i) => `
      <figure class="window" data-depth="${depths[i]}">
        <img src="${asset(f)}" alt="" aria-hidden="true" loading="eager" decoding="async" />
        <div class="glass"></div>
      </figure>`
    )
    .join(mullion)

  return `
  <header class="hero" id="hero">
    <div class="bulkhead"></div>

    <div class="viewport" id="viewport">
      ${windows}
      <figure class="window window--pano" data-depth="0.8">
        <img src="${asset('B.jpg')}" alt="" aria-hidden="true" loading="eager" decoding="async" />
        <div class="glass"></div>
      </figure>
    </div>

    <div class="scanlines"></div>
    <div class="hero__vignette"></div>

    <span class="corner tl"></span><span class="corner tr"></span>
    <span class="corner bl"></span><span class="corner br"></span>

    <div class="hud hud--tl" aria-hidden="true"><b>VP-01..04</b> // 观测窗
RA 05h 35m 17.3s  DEC -05° 23' 28"
<b>OBJ</b> 水滴 // PROBE-001
<span class="warn">DIST <span id="hud-dist">4.2460</span> LY ▼</span></div>

    <div class="hud hud--br" aria-hidden="true">SYS // NOMINAL
PWR 97.2%  O2 20.9%
<span id="hud-clock">T+00:00:00</span></div>

    <div class="droplet-mount" id="droplet-mount"></div>

    <div class="hero__top">
      <p class="hero__eyebrow fade" data-fade-delay="150"><b>[</b> Trisolaran Probe <b>]</b></p>
      <h1 class="hero__title">${heroTitle('DROPLET')}</h1>
    </div>

    <p class="hero__cue fade" data-fade-delay="1100"><span>Scroll</span><i></i></p>
  </header>`
}

/* ------------------------------------------------------------
   AboutSection
------------------------------------------------------------ */
function aboutHTML() {
  return `
  <section class="section shell" id="about">
    <div class="section__head">
      <h2 class="section__title atext"><span class="idx">01</span>舱段档案 // About</h2>
      <p class="section__meta fade">FILE A-01</p>
    </div>
    <div class="about">
      <figure class="about__art fade" data-fade-x="-20" data-fade-delay="120">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>
        <div class="frame">
          <img src="${asset('Cover.jpg')}" alt="Droplet 封面" loading="lazy" decoding="async" />
          <i class="sheen" aria-hidden="true"></i>
        </div>
        <figcaption><span>COVER // 在轨记录</span><span>REC</span></figcaption>
      </figure>
      <div class="about__text">
        <p class="fade" data-fade-delay="60">
          这里是 <strong>Droplet</strong>——一个建在飞船舷窗后面的博客。窗外是吸积盘，窗内只有你、我和那颗悬着的水滴。
        </p>
        <p class="fade" data-fade-delay="160">
          三体人把它叫做探测器，人类把它叫做圣母的眼泪。它的表面绝对光滑，强互作用力把原子钉死在原地——所以它既是武器，也是一件完美的造物。这个站想做的事差不多：把想法压缩到最小的体积，密度大到不会散。
        </p>
        <p class="fade" data-fade-delay="260">
          站点本身也是一篇记录——从素材、规范到水滴的每一次抖动，都写在
          <a href="#/post/panel-c2">《造一滴水》</a> 里。
        </p>
      </div>
    </div>
  </section>`
}

/* ------------------------------------------------------------
   ProjectsSection（文章轨道）
------------------------------------------------------------ */
function postsHTML() {
  const posts = getAllPosts()
  const cards = posts
    .map(
      (p) => `
    <a
      class="card${p.order < 100 ? ' card--panel' : ''}"
      href="#/post/${encodeURIComponent(p.slug)}"
      ${p.coverAspect ? `style="--cover-aspect:${p.coverAspect}"` : ''}
    >
      <div class="card__cover">
        ${p.cover ? `<img src="${asset(p.cover)}" alt="" aria-hidden="true" loading="lazy" decoding="async" />` : ''}
      </div>
      <div class="card__body">
        <span class="card__date">${formatDate(p.date)}</span>
        <h3 class="card__title">${esc(p.title)}</h3>
        <p class="card__excerpt">${esc(p.excerpt)}</p>
        <div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
    </a>`
    )
    .join('')

  return `
  <section class="section shell" id="posts">
    <div class="section__head">
      <h2 class="section__title atext"><span class="idx">02</span>在轨日志 // Log</h2>
      <p class="section__meta fade">${posts.length} ENTRIES</p>
    </div>
    <div class="orbit">${cards || '<p class="card__excerpt">暂无记录。往 content/posts/ 里丢一个 .md 就有了。</p>'}</div>
  </section>`
}

/* ------------------------------------------------------------
   Footer
------------------------------------------------------------ */
function footerHTML() {
  return `
  <footer class="footer shell">
    <div class="footer__row">
      <a class="commbtn" href="mailto:hello@example.com">建立通讯</a>
      <p class="footer__note">© ${new Date().getFullYear()} Droplet // 黑暗森林状态中</p>
    </div>
  </footer>`
}

/* ------------------------------------------------------------
   首页装配
------------------------------------------------------------ */
function renderHome() {
  app.innerHTML = `${heroHTML()}${aboutHTML()}${postsHTML()}${footerHTML()}`

  const mount = app.querySelector('#droplet-mount')
  createDroplet(mount, {
    src: DROPLET,
    size: Math.min(176, Math.max(104, window.innerHeight * 0.185)),   // 水滴本体高度
    alt: '三体探测器 · 水滴',
    reticle: true,
  })

  stagger('.card', 90, app)
  initFadeIn(app)
  initViewport(app)
  initHeroScroll(app)
  initHudClock(app)
  initHeroTitle(app)
  initAnimatedText(app)
  initTilt('.about__art .frame', { max: 8, lift: 10 }, app)
  initFloat('.about__art .frame', { amp: 8 }, app)
}

/* ------------------------------------------------------------
   文章页
------------------------------------------------------------ */
function renderPost(slug) {
  const post = getPost(slug)
  if (!post) {
    app.innerHTML = `
      <section class="post shell">
        <a class="post__back" href="#/">← 返回观测窗</a>
        <div class="post__head">
          <h1 class="post__title">目标丢失</h1>
          <div class="post__meta"><span class="warn">404</span><span>没有找到《${esc(slug)}》</span></div>
        </div>
      </section>`
    return
  }

  app.innerHTML = `
    <div class="polar-sky" aria-hidden="true">
      <canvas class="three-body" id="three-body"></canvas>
    </div>
    <article class="post shell">
      <div class="post__toolbar">
        <a class="post__back" href="#/">← 返回观测窗</a>
        <button
          class="polar-toggle"
          id="polar-toggle"
          type="button"
          aria-pressed="false"
          aria-label="切换极昼模式"
          title="切换极昼模式"
        >
          <span class="polar-toggle__sun" aria-hidden="true"></span>
          <span>极昼</span>
        </button>
      </div>
      <div class="post__head">
        <h1 class="post__title">${esc(post.title)}</h1>
        <div class="post__meta">
          <span>${formatDate(post.date)}</span>
          <span>//</span>
          <span>${post.tags.map((t) => esc(t)).join(' / ') || '未分类'}</span>
        </div>
      </div>
      ${post.cover ? `<figure class="post__cover"${post.coverAspect ? ` style="--cover-aspect:${post.coverAspect}"` : ''}><img src="${asset(post.cover)}" alt="${esc(post.title)}" loading="lazy" decoding="async" /></figure>` : ''}
      <div class="prose">${renderMarkdown(post.body)}</div>
      <div class="post__foot">
        <a href="#/">← 返回观测窗</a>
        <span>END OF FILE</span>
      </div>
    </article>`

  const badge = document.createElement('a')
  badge.href = '#/'
  badge.className = 'post__badge'
  badge.setAttribute('aria-label', '回到首页')
  document.body.appendChild(badge)
  createDroplet(badge, { src: DROPLET, size: 36, reach: 7, float: 4, trail: 3, compact: true })
  mountPolarMode()
}

/* ------------------------------------------------------------
   路由
------------------------------------------------------------ */
const POLAR_KEY = 'droplet:polar-day'
let polarEnabled = false
let threeBody = null

try {
  polarEnabled = localStorage.getItem(POLAR_KEY) === '1'
} catch {
  // Private browsing can reject storage; the visual switch still works.
}

function applyPolarMode(next) {
  document.body.classList.toggle('polar-day', next)
  const button = document.getElementById('polar-toggle')
  const meta = document.querySelector('meta[name="theme-color"]')
  button?.setAttribute('aria-pressed', String(next))
  if (meta) meta.setAttribute('content', next ? '#dfe8ee' : '#000000')
  threeBody?.setActive(next)
}

function mountPolarMode() {
  const canvas = document.getElementById('three-body')
  const button = document.getElementById('polar-toggle')
  threeBody = canvas ? initThreeBody(canvas) : null
  applyPolarMode(polarEnabled)

  button?.addEventListener('click', () => {
    polarEnabled = !polarEnabled
    applyPolarMode(polarEnabled)
    try {
      localStorage.setItem(POLAR_KEY, polarEnabled ? '1' : '0')
    } catch {
      // Ignore storage failures.
    }
  })
}

function cleanup() {
  threeBody?.destroy()
  threeBody = null
  document.body.classList.remove('polar-day')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', '#000000')
  document.querySelectorAll('.post__badge').forEach((n) => n.remove())
}

function route() {
  cleanup()
  const hash = location.hash.replace(/^#\/?/, '')
  const m = /^post\/(.+)$/.exec(hash)
  window.scrollTo({ top: 0, behavior: 'auto' })
  if (m) renderPost(decodeURIComponent(m[1]))
  else renderHome()
}

initStarfield()

window.addEventListener('hashchange', route)
route()
