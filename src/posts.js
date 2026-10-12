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
 *   order: 同日期时的排序权重，越小越靠前（列表主排序 = date 倒序）
 *   excerpt: 可选，缺省从正文截取
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
      excerpt: data.excerpt || makeExcerpt(body),
      body,
    }
  })
  .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1))

export function getAllPosts() {
  return posts
}

export function getPost(slug) {
  return posts.find((p) => p.slug === slug) || null
}

export function renderMarkdown(text) {
  return md.render(text)
}
