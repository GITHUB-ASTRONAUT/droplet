/**
 * posts.js —— 内容管线
 *
 * content/posts/*.md → frontmatter → markdown-it → HTML
 * Vite 构建时把 md 以原始字符串内联，纯静态，无后端。
 *
 * frontmatter 契约：
 *   title: 标题
 *   date:  YYYY-MM-DD
 *   tags:  [标签A, 标签B]
 *   cover: 图片文件名（位于 images/，可留空）
 *   coverAspect: 可选，封面宽高比；用于懒加载前预留稳定版位
 *   panel: 拼接组名；同一 panel 的卡片排在同一行，按 order 从左到右拼成一幅画
 *   order: 组内拼接序号，越小越靠左（同日期时的排序权重也是它）
 *   excerpt: 可选，缺省从正文截取
 *
 * 排序规则：拼接组以“行”为单位整体排序 —— 行与行之间按组内最新日期倒序，
 * 行内按 order 升序。这样最新的一行在最前面，同时三张素材仍然是完整的一幅画。
 */

import MarkdownIt from 'markdown-it'

const modules = import.meta.glob('../content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const md = new MarkdownIt({ html: true, linkify: true, typographer: false })

/** 极简 frontmatter 解析：key: value / 引号字符串 / [a, b] 数组 */
function parseFrontMatter(raw) {
  const data = {}
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!m) return { data, body: raw }
  const body = raw.slice(m[0].length)
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const [, key, rawValue] = kv
    const value = rawValue.trim()
    if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      data[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body }
}

function makeExcerpt(body, len = 96) {
  const text = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_`~\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > len ? text.slice(0, len) + '…' : text
}

function slugify(name) {
  return name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

const posts = Object.entries(modules)
  .map(([path, raw]) => {
    const file = path.split('/').pop()
    const { data, body } = parseFrontMatter(raw)
    return {
      slug: data.slug || slugify(file),
      title: data.title || slugify(file),
      date: data.date || '1970-01-01',
      tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
      cover: data.cover || '',
      coverAspect: Number.isFinite(Number(data.coverAspect)) && Number(data.coverAspect) > 0
        ? Number(data.coverAspect)
        : null,
      order: Number.isFinite(Number(data.order)) ? Number(data.order) : 100,
      panel: data.panel || '',
      excerpt: data.excerpt || makeExcerpt(body),
      body,
    }
  })

/* 行 = 一个拼接组（或单张卡）。行内卡片共享同一个行号，保证行不会被拆开 */
const rowOf = (p) => p.panel || `\u0000${p.slug}`

const rows = new Map()
for (const p of posts) {
  const row = rows.get(rowOf(p)) || { date: '', order: Infinity }
  if (p.date > row.date) row.date = p.date
  if (p.order < row.order) row.order = p.order
  rows.set(rowOf(p), row)
}

/* 行与行之间：组内最新日期倒序，同期再按组内最小 order */
const rowRank = new Map(
  [...rows.entries()]
    .sort(([, a], [, b]) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1))
    .map(([key], i) => [key, i]),
)

posts.sort((a, b) => rowRank.get(rowOf(a)) - rowRank.get(rowOf(b)) || a.order - b.order)

export function getAllPosts() {
  return posts
}

export function getPost(slug) {
  return posts.find((p) => p.slug === slug) || null
}

export function renderMarkdown(text) {
  return md.render(text)
}
