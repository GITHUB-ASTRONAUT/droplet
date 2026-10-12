/**
 * inkstone-auth.mjs —— 给 Inkstone MCP 做一次 OAuth 授权（本地回环回调）
 *
 * Inkstone 是私有笔记本，MCP 端点（/mcp）要求 Bearer token，scope = notes:read。
 * 这个脚本做三件事：
 *   1. 动态注册一个本地客户端（DCR，public client + PKCE S256）；
 *   2. 打印授权链接（浏览器里登录 + 同意）；
 *   3. 接住回环回调，用授权码换 token，落到 .inkstone-auth.json（已 gitignore）。
 *
 * 用法：
 *   node tools/inkstone-auth.mjs            # 授权（已有 token 且真的能用就跳过）
 *   node tools/inkstone-auth.mjs --force    # 重新走一遍授权
 */

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUTH_FILE = path.join(ROOT, '.inkstone-auth.json')
const CLIENT_FILE = path.join(ROOT, '.inkstone-clients.json')

const ISSUER = process.env.INKSTONE_ISSUER || 'https://inkstone.cambridge22oy.workers.dev'
const PORT = Number(process.env.INKSTONE_CALLBACK_PORT || 8765)
const REDIRECT = `http://127.0.0.1:${PORT}/callback`
const SCOPE = 'notes:read'
const MCP_ENDPOINT = process.env.INKSTONE_MCP || `${ISSUER}/mcp`

const force = process.argv.includes('--force')
/** 等多久算超时；默认 10 分钟，可以用 INKSTONE_AUTH_TIMEOUT_MS 拉长。 */
const TIMEOUT_MS = Number(process.env.INKSTONE_AUTH_TIMEOUT_MS || 10 * 60 * 1000)

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

/**
 * 注册过的 client 存起来：redirect_uri / scope / issuer 一变就得重新注册，
 * 所以用这三样做 key。--force 只重走授权，不该每次都换一个 client_id。
 */
function clientKey(issuer, redirect, scope) {
  return `${issuer}|${redirect}|${scope}`
}

function readClients() {
  try {
    const data = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function saveClients(data) {
  fs.writeFileSync(CLIENT_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

/**
 * 只看 expires_at 是不够的：token 可能被服务端提前作废（换密钥、清 grant、重启等），
 * 本地时间却又还没到。所以这里真的打一次 /mcp，按 401/403 判定失效。
 */
async function tokenWorks(token) {
  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, reason: `HTTP ${res.status}` }
    return { ok: true, reason: `HTTP ${res.status}` }
  } catch (err) {
    // 网络不通时别把用户卡在「既不能跳过也不能授权」的状态里，交回调用方决定。
    return { ok: null, reason: err.message }
  }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function registerClient() {
  const res = await fetch(`${ISSUER}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Droplet Blog (local sync)',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.client_id) {
    throw new Error(`注册客户端失败: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
  return body.client_id
}

const saved = readAuth()
if (saved?.access_token && !force) {
  const left = Math.round(((saved.expires_at || 0) - Date.now()) / 1000)
  if (left > 60) {
    const check = await tokenWorks(saved.access_token)
    if (check.ok === true) {
      console.log(`已有可用 token（约 ${Math.round(left / 60)} 分钟后过期），无需重新授权。`)
      console.log('要强制重来就加 --force。')
      process.exit(0)
    }
    console.log(
      check.ok === false
        ? `本地保存的 token 已经失效（${check.reason}），需要重新登录并同意授权。`
        : `没法确认本地 token 是否可用（${check.reason}），直接重走一次授权。`,
    )
  } else {
    console.log('本地保存的 token 已过期，需要重新登录并同意授权。')
  }
}

const clients = readClients()
const key = clientKey(ISSUER, REDIRECT, SCOPE)
let clientId = clients[key]?.client_id || saved?.client_id || null
if (!clientId) {
  clientId = await registerClient()
  clients[key] = { client_id: clientId, client_name: 'Droplet Blog (local sync)', created_at: Date.now() }
  saveClients(clients)
  console.log(`已注册本地客户端 ${clientId}（记在 .inkstone-clients.json，下次复用）。`)
} else {
  console.log(`复用已注册的本地客户端 ${clientId}。`)
}
const verifier = b64url(crypto.randomBytes(32))
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
const state = b64url(crypto.randomBytes(16))

const authorizeUrl = new URL(`${ISSUER}/authorize`)
authorizeUrl.searchParams.set('response_type', 'code')
authorizeUrl.searchParams.set('client_id', clientId)
authorizeUrl.searchParams.set('redirect_uri', REDIRECT)
authorizeUrl.searchParams.set('scope', SCOPE)
authorizeUrl.searchParams.set('state', state)
authorizeUrl.searchParams.set('code_challenge', challenge)
authorizeUrl.searchParams.set('code_challenge_method', 'S256')

const done = new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    if (url.pathname !== '/callback') {
      res.writeHead(404).end('not found')
      return
    }
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    const reply = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text)
    }

    if (error) {
      reply(400, `授权被拒绝：${error}`)
      server.close()
      reject(new Error(`授权被拒绝: ${error} ${url.searchParams.get('error_description') || ''}`))
      return
    }
    if (returnedState !== state) {
      // 多半是点了一个过期的授权页（旧的 state）；别把这次等待关掉，让用户用最新的链接再来一次。
      console.log(`忽略一次过期回调（state 不匹配）。继续等 ${authorizeUrl.toString()}`)
      reply(400, '这个授权链接已经过期了，请回到终端拿最新的链接重新打开。')
      return
    }

    try {
      const tokenRes = await fetch(`${ISSUER}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          redirect_uri: REDIRECT,
          code_verifier: verifier,
        }),
      })
      const tokenBody = await tokenRes.json().catch(() => null)
      if (!tokenRes.ok || !tokenBody?.access_token) {
        throw new Error(`换 token 失败: HTTP ${tokenRes.status} ${JSON.stringify(tokenBody)}`)
      }
      saveAuth({
        client_id: clientId,
        issuer: ISSUER,
        scope: tokenBody.scope || SCOPE,
        token_type: tokenBody.token_type || 'Bearer',
        access_token: tokenBody.access_token,
        refresh_token: tokenBody.refresh_token || null,
        expires_at: Date.now() + (Number(tokenBody.expires_in) || 3600) * 1000,
      })
      reply(200, '授权完成，可以关掉这个页面回到终端了。')
      server.close()
      resolve()
    } catch (err) {
      reply(500, err.message)
      server.close()
      reject(err)
    }
  })

  server.on('error', reject)
  server.listen(PORT, '127.0.0.1')
  setTimeout(() => {
    server.close()
    reject(new Error(`等待授权超时（${Math.round(TIMEOUT_MS / 60000)} 分钟）`))
  }, TIMEOUT_MS).unref()
})

console.log('在浏览器里打开下面这个链接，登录 Inkstone 并同意授权：\n')
console.log(authorizeUrl.toString() + '\n')
console.log(`回调地址：${REDIRECT}（本地临时服务，只等这一次回调）`)

await done
console.log(`\n已保存到 ${AUTH_FILE}`)
