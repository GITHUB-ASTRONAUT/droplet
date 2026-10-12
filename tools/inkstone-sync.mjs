/**
 * inkstone-sync.mjs —— 把 Inkstone 笔记抓成博客正文
 *
 * 用法（都需要先跑过 tools/inkstone-auth.mjs 授权）：
 *   node tools/inkstone-sync.mjs probe             # 打印 MCP 暴露的 tools / prompts / resources
 *   node tools/inkstone-sync.mjs dump "<标题>"      # 抓一篇，原始响应落到 .scratch/inkstone/
 *   node tools/inkstone-sync.mjs sync [--dry]      # 按下面的 TARGETS 同步到 content/posts/
 *
 * 只在构建/同步时跑，token 不进前端。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handshake, rpc } from './mcp-inkstone.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DUMP_DIR = path.join(ROOT, '.scratch', 'inkstone')

/** 要同步的笔记：Inkstone 里的标题 → 博客里的文章文件。 */
const TARGETS = [
  {
    title: '小型制造企业 AI 工作流重构：办公自动化与 MES／ERP 落地策略',
    file: 'content/posts/2026-10-01-panel-d2.md',
    excerpt:
      '办公自动化、MES／ERP 这些系统该怎么被 AI 真正接进去，哪里最容易翻车，以及小厂在没有大预算时的落地顺序。',
  },
  {
    title: 'mattpocock/skills 深度使用指南：一套面向真实工程的 Agent Skills',
    file: 'content/posts/2026-10-12-panel-d3.md',
    excerpt:
      '一套面向真实工程而不是演示场景的 Agent Skills 是怎么组织起来的：边界、约束、验证，以及它们为什么值得抄。',
  },
]

const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60)
const dump = (name, data) => {
  fs.mkdirSync(DUMP_DIR, { recursive: true })
  fs.writeFileSync(path.join(DUMP_DIR, `${name}.json`), JSON.stringify(data, null, 2))
}

const norm = (s) => (s || '').toLowerCase().replace(/[\s\u3000]+/g, '').replace(/[／/]/g, '/')

/** 在 tools/list 里挑出「搜索」和「取正文」两个工具。 */
function pickTools(tools) {
  const byName = (re) => tools.find((t) => re.test(t.name))
  return {
    search: byName(/search|list|find|query/i),
    get: byName(/get|read|fetch|show|note/i),
    all: tools,
  }
}

/** 从任意形状的返回值里挖出笔记数组。 */
function pluckNotes(result) {
  const seen = new Set()
  const out = []
  const walk = (v, depth) => {
    if (!v || depth > 4 || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
    const title = v.title ?? v.name
    if (typeof title === 'string' && (v.content || v.body || v.text || v.markdown || v.id)) {
      const key = `${title}::${v.id ?? ''}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(v)
      }
      return
    }
    for (const val of Object.values(v)) walk(val, depth + 1)
  }
  walk(result, 0)
  return out
}

/** MCP 返回可能是 [{type:'text',text:'...'}]，也可能是直接的对象。 */
function unwrap(result) {
  if (result?.structuredContent) return result.structuredContent
  const texts = (result?.content || []).filter((c) => c.type === 'text')
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0].text)
    } catch {
      return { content: texts[0].text }
    }
  }
  if (texts.length > 1) return { content: texts.map((t) => t.text).join('\n\n') }
  return result
}

const call = async (name, args) => unwrap(await rpc('tools/call', { name, arguments: args }))

/** 只做最小转换：Inkstone 存的多半就是 Markdown，HTML 只兜底。 */
function toMarkdown(text) {
  const t = (text || '').trim()
  if (!t) return ''
  if (!/<\/?(p|div|h[1-6]|ul|ol|li|pre|code|table|br)\b/i.test(t)) return t
  return t
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, body) => `\n${'#'.repeat(+n)} ${body.trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `- ${body.trim()}\n`)
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<(pre|code)[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, body) => (tag === 'pre' ? `\n\`\`\`\n${body}\n\`\`\`\n` : `\`${body}\``))
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 找一篇笔记的正文：搜索 → 命中 → 需要时再取全文。 */
async function fetchNote(picked, want) {
  const searchArgs = { query: want, q: want, title: want, keyword: want, limit: 10 }
  if (!picked.search) throw new Error(`tools/list 里没找到搜索工具，暴露的是：${picked.all.map((t) => t.name).join(', ')}`)
  const listed = await call(picked.search.name, searchArgs)
  const notes = pluckNotes(listed)
  const hit = notes.find((n) => norm(n.title ?? n.name) === norm(want)) || notes.find((n) => norm(n.title ?? n.name).includes(norm(want))) || notes[0]
  if (!hit) throw new Error(`搜索没有返回任何笔记：${JSON.stringify(listed).slice(0, 500)}`)

  const inline = hit.content ?? hit.markdown ?? hit.body ?? hit.text
  const id = hit.id ?? hit.noteId ?? hit.note_id ?? hit.slug
  if (inline && String(inline).length > 400) return { note: hit, body: toMarkdown(String(inline)), listed }
  if (!picked.get || id === undefined) return { note: hit, body: toMarkdown(String(inline || '')), listed }

  const full = await call(picked.get.name, { id, noteId: id, note_id: id, title: hit.title ?? hit.name })
  const fullNotes = pluckNotes(full)
  const best = fullNotes.find((n) => (n.id ?? n.noteId ?? n.note_id ?? n.slug) === id) || fullNotes[0] || {}
  const body =
    best.content ?? best.markdown ?? best.body ?? best.text ??
    full.content ?? full.markdown ?? full.body ?? full.text ?? inline
  return { note: { ...hit, ...best }, body: toMarkdown(String(body || '')), listed, full }
}

/** 只换正文，frontmatter 原样保留（excerpt 允许更新）。 */
function stripLeadingTitle(body, title) {
  const m = body.match(/^#\s+(.+?)\s*\n+/)
  if (!m) return body
  if (!norm(m[1]).includes(norm(title).slice(0, 12))) return body
  return body.slice(m[0].length).trim()
}

function writePost(file, title, body, excerpt) {
  const abs = path.join(ROOT, file)
  const raw = fs.readFileSync(abs, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) throw new Error(`${file} 没有 frontmatter`)
  let front = m[1]
  if (excerpt) front = front.replace(/^excerpt:.*$/m, `excerpt: ${excerpt}`)
  const next = `---\n${front}\n---\n\n${stripLeadingTitle(body.trim(), title)}\n`
  fs.writeFileSync(abs, next)
  return abs
}

const [command, ...rest] = process.argv.slice(2)

try {
  await handshake()

  if (command === 'probe') {
    for (const method of ['tools/list', 'prompts/list', 'resources/list']) {
      try {
        const result = await rpc(method, {})
        console.log(`\n===== ${method} =====`)
        console.log(JSON.stringify(result, null, 2))
      } catch (err) {
        console.log(`\n===== ${method} =====\n(失败: ${err.message})`)
      }
    }
  } else if (command === 'dump') {
    const title = rest.join(' ')
    const picked = pickTools((await rpc('tools/list', {})).tools || [])
    const { note, body, listed, full } = await fetchNote(picked, title)
    dump(slug(title), { listed, full, note, body })
    console.log(`标题: ${note.title ?? note.name}`)
    console.log(`字符数: ${body.length}`)
    console.log(`原始响应已存到 ${path.relative(ROOT, path.join(DUMP_DIR, slug(title) + '.json'))}`)
    console.log('\n---- 正文开头 ----\n' + body.slice(0, 800))
  } else if (command === 'sync') {
    const dry = rest.includes('--dry')
    const picked = pickTools((await rpc('tools/list', {})).tools || [])
    for (const target of TARGETS) {
      const { note, body } = await fetchNote(picked, target.title)
      dump(slug(target.title), { note, body })
      if (body.length < 200) throw new Error(`《${target.title}》只抓到 ${body.length} 字，先看看 dump 再同步`)
      if (dry) {
        console.log(`[dry] ${target.file} ← ${body.length} 字 / ${note.title ?? note.name}`)
      } else {
        const written = writePost(target.file, target.title, body, target.excerpt)
        console.log(`已写入 ${path.relative(ROOT, written)}（${body.length} 字）`)
      }
    }
  } else {
    console.error('用法: node tools/inkstone-sync.mjs <probe|dump <标题>|sync [--dry]>')
    process.exitCode = 1
  }
} catch (err) {
  console.error('FAILED:', err.message)
  process.exitCode = 1
}
