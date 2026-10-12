/**
 * mcp-inkstone.mjs —— 极简 MCP (Streamable HTTP) 客户端
 *
 * 用途：把 Inkstone 笔记本里的笔记取下来，作为博客文章素材。
 * 只依赖 Node 内置 fetch，不做长连接、不做 SSE 订阅。
 *
 * 鉴权：端点要求 Bearer token。先跑 `node tools/inkstone-auth.mjs` 授权一次，
 * token 会存在 .inkstone-auth.json（已 gitignore）；也可以用 INKSTONE_TOKEN 覆盖。
 *
 * 用法：
 *   node tools/mcp-inkstone.mjs tools
 *   node tools/mcp-inkstone.mjs call <toolName> '<jsonArgs>'
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ENDPOINT = process.env.INKSTONE_MCP || 'https://inkstone.cambridge22oy.workers.dev/mcp'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUTH_FILE = path.join(ROOT, '.inkstone-auth.json')

let sessionId = null
let nextId = 1

function readAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
  } catch {
    return null
  }
}

function saveAuth(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

/** token 可能过期；有 refresh_token 就顺手换一张新的。 */
async function currentToken() {
  if (process.env.INKSTONE_TOKEN) return process.env.INKSTONE_TOKEN
  const auth = readAuth()
  if (!auth?.access_token) {
    throw new Error('还没有授权：先运行 node tools/inkstone-auth.mjs（或设置 INKSTONE_TOKEN）')
  }
  const fresh = (auth.expires_at || 0) - Date.now() > 60_000
  if (fresh || !auth.refresh_token) return auth.access_token

  const res = await fetch(`${auth.issuer || 'https://inkstone.cambridge22oy.workers.dev'}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token,
      client_id: auth.client_id,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) {
    throw new Error(`刷新 token 失败: HTTP ${res.status} ${JSON.stringify(body)}；重跑 tools/inkstone-auth.mjs`)
  }
  const next = {
    ...auth,
    access_token: body.access_token,
    refresh_token: body.refresh_token || auth.refresh_token,
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  }
  saveAuth(next)
  return next.access_token
}

/** 响应可能是 application/json，也可能是 SSE 流；两种都要能读。 */
function parseBody(text, contentType) {
  const t = text.trim()
  if (!t) return null
  if (contentType.includes('text/event-stream') || t.startsWith('event:') || t.startsWith('data:')) {
    const payloads = t
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    const last = payloads[payloads.length - 1]
    return last ? JSON.parse(last) : null
  }
  return JSON.parse(t)
}

export async function rpc(method, params, { notify = false } = {}) {
  const body = { jsonrpc: '2.0', method }
  if (params !== undefined) body.params = params
  if (!notify) body.id = nextId++

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${await currentToken()}`,
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid

  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`)
  if (notify) return null
  const msg = parseBody(text, res.headers.get('content-type') || '')
  if (!msg) return null
  if (msg.error) throw new Error(`MCP error ${JSON.stringify(msg.error)}`)
  return msg.result
}

export async function handshake() {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'droplet-blog', version: '1.0.0' },
  })
  await rpc('notifications/initialized', undefined, { notify: true })
}

/** 作为命令行运行时才执行；被 import 时只提供 rpc / handshake。 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2)

  try {
    await handshake()
    if (command === 'tools') {
      const result = await rpc('tools/list', {})
      console.log(JSON.stringify(result, null, 2))
    } else if (command === 'prompts') {
      console.log(JSON.stringify(await rpc('prompts/list', {}), null, 2))
    } else if (command === 'resources') {
      console.log(JSON.stringify(await rpc('resources/list', {}), null, 2))
    } else if (command === 'call') {
      const [name, rawArgs] = rest
      const args = rawArgs ? JSON.parse(rawArgs) : {}
      console.log(JSON.stringify(await rpc('tools/call', { name, arguments: args }), null, 2))
    } else {
      console.error('用法: node tools/mcp-inkstone.mjs <tools|prompts|resources|call> [args]')
      process.exitCode = 1
    }
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exitCode = 1
  }
}
