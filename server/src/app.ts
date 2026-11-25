/* HTTP layer: plain node:http (no framework to keep patched), security headers on every response,
   size limits, rate limits, same-origin checks on every change, and the app's files. */
import http from 'node:http'
import fs from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import path from 'node:path'
import type { Config } from './config'
import type { Repo } from './repo'
import { Engine } from './engine'
import { checkPin, checkTotp, Limiter, newToken, pendingTotpSecret, tokenId, totpUri } from './auth'
import { maintenance } from './maintenance'
import { OpError } from '../../src/lib/ops'
import type { Staff } from '../../src/lib/types'

const COOKIE = 'nt_session'
export const SEC = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
}
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }

export interface AppDeps { cfg: Config; repo: Repo; engine: Engine; startedAt?: number }

export function createApp({ cfg, repo, engine, startedAt = Date.now() }: AppDeps) {
  const general = new Limiter(900, 60e3)          // ~15 requests a second per address is far above what a counter does
  const mem = (max: number, ms: number) => new Limiter(max, ms)
  /** login-attempt counters: kept in the database when several server copies share it, in memory otherwise */
  function limiter(name: string, max: number, ms: number) {
    const m = mem(max, ms), k = (key: string) => name + ':' + key
    return {
      hit: async (key: string) => repo.shared && repo.rateHit ? (await repo.rateHit(k(key), ms, Date.now())) <= max : m.hit(key),
      full: async (key: string) => repo.shared && repo.rateCount ? (await repo.rateCount(k(key), ms, Date.now())) >= max : m.full(key),
      clear: async (key: string) => { if (repo.shared && repo.rateClear) await repo.rateClear(k(key)); else m.clear(key) },
    }
  }
  const loginIp = limiter('ip', cfg.loginTries, 15 * 60e3)       // 20 PIN tries (default) per 15 minutes per address
  const loginStaff = limiter('staff', 6, 5 * 60e3)      // 6 wrong PINs locks that person for 5 minutes
  const approveLim = limiter('approve', 10, 5 * 60e3)
  const SETUP_MS = 10 * 60e3
  /** secrets offered in the last 10-20 minutes for this owner's two-step set-up */
  const setupSecrets = (staffId: string) => { const b = Math.floor(Date.now() / SETUP_MS); return [b, b - 1].map(x => pendingTotpSecret(engine.head.secret, staffId, x)) }

  const ipOf = (req: http.IncomingMessage) => (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?'
  const isHttps = (req: http.IncomingMessage) => (cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https') || (req.socket as { encrypted?: boolean }).encrypted === true
  const secureCookie = (req: http.IncomingMessage) => cfg.cookieSecure === 'auto' ? isHttps(req) : cfg.cookieSecure

  function send(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string | string[]> = {}) {
    const json = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    res.writeHead(status, { ...SEC, ...(isHttps(req) ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra })
    res.end(json)
  }
  /** a file download; sent compressed (the browser unpacks it) so big files stay under hosting size limits */
  function download(req: http.IncomingMessage, res: http.ServerResponse, json: string, name: string) {
    const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))
    return send(req, res, 200, gz ? zlib.gzipSync(json) : json, { 'content-disposition': `attachment; filename="${name}"`, ...(gz ? { 'content-encoding': 'gzip' } : {}) })
  }
  function readJSON(req: http.IncomingMessage, limit: number): Promise<unknown> {
    return new Promise((ok, bad) => {
      const pre = (req as { parsedBody?: unknown }).parsedBody       // already read by the hosting platform (Vercel)
      if (pre !== undefined) return ok(pre)
      if (!/^application\/json\b/.test(String(req.headers['content-type'] || ''))) return bad(new HttpError(415, 'Send JSON'))
      const len = Number(req.headers['content-length'] || 0); if (len > limit) return bad(new HttpError(413, 'Too large'))
      const chunks: Buffer[] = []; let n = 0
      req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { bad(new HttpError(413, 'Too large')); req.destroy() } else chunks.push(c) })
      req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')) } catch { bad(new HttpError(400, 'Invalid JSON')) } })
      req.on('error', bad)
    })
  }
  function cookies(req: http.IncomingMessage) {
    const out: Record<string, string> = {}
    for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()) }
    return out
  }
  const setCookie = (req: http.IncomingMessage, token: string, maxAge: number) => `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie(req) ? '; Secure' : ''}`

  async function who(req: http.IncomingMessage): Promise<{ staff: Staff; sid: string } | null> {
    const t = cookies(req)[COOKIE]; if (!t || t.length > 100) return null
    const sid = tokenId(t); const s = await repo.getSession(sid)
    if (!s || s.exp < Date.now()) return null
    const staff = engine.staff(s.staffId)
    return staff && staff.active ? { staff, sid } : null
  }
  async function need(req: http.IncomingMessage, owner = false) {
    const w = await who(req); if (!w) throw new HttpError(401, 'Please log in again')
    if (owner && w.staff.role !== 'owner') throw new HttpError(403, 'Only the owner can do this')
    return w
  }
  /** changes must come from this app's own page (blocks other websites from acting with a logged-in counter's cookie) */
  function sameOrigin(req: http.IncomingMessage) {
    if (req.headers['x-narayana'] !== '1') throw new HttpError(403, 'Missing app header')
    const origin = req.headers.origin; if (!origin) return
    let host = ''; try { host = new URL(origin).host } catch { /* bad origin */ }
    if (host !== req.headers.host) throw new HttpError(403, 'Cross-site request refused')
  }
  const me = (s: Staff) => ({ id: s.id, name: s.name, role: s.role, maxDiscountPct: s.maxDiscountPct, active: s.active, twoStep: !!s.totpSecret })

  async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const p = url.pathname, m = req.method || 'GET'
    const ok = (body: unknown, extra?: Record<string, string | string[]>) => send(req, res, 200, body, extra)
    if (m !== 'GET' && m !== 'HEAD') sameOrigin(req)

    if (p === '/api/cron' && m === 'GET') {      // called once a day by the hosting platform's scheduler
      const want = cfg.cronSecret ? Buffer.from('Bearer ' + cfg.cronSecret) : null, got = Buffer.from(String(req.headers.authorization || ''))
      if (!want || want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new HttpError(404, 'Not found')
      const done = await maintenance(repo, engine, cfg, 2 * 3600e3)
      return ok({ ok: true, ...done })
    }
    if (p === '/api/health' && m === 'GET') {
      const up = await repo.ping()
      const last = up ? (await repo.listBackups())[0] : undefined
      const backupLate = cfg.backupHours > 0 && (!last || Date.now() - Date.parse(last.at) > 2 * cfg.backupHours * 3600e3)
      return send(req, res, up ? 200 : 503, { ok: up, storage: repo.kind, version: engine.version, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        lastBackupAt: last?.at ?? null, backupLate, backupCopy: engine.copyDir ? (engine.copyError ? 'failing' : 'ok') : 'off' })
    }
    if (p === '/api/hello' && m === 'GET') {
      const s = engine.state.shop
      return ok({ app: 'narayana-crm', name: s.name, tagline: s.tagline, serverId: engine.head.serverId, staff: engine.publicStaff() })
    }
    if (p === '/api/login' && m === 'POST') {
      const b = await readJSON(req, 2e3) as { staffId?: unknown; pin?: unknown; code?: unknown }
      const staffId = typeof b?.staffId === 'string' ? b.staffId : '', pin = typeof b?.pin === 'string' ? b.pin : '', code = typeof b?.code === 'string' ? b.code : ''
      if (!(await loginIp.hit(ipOf(req)))) throw new HttpError(429, 'Too many tries. Wait 15 minutes.')
      const s = engine.staff(staffId)
      const lockedKey = 'lock:' + staffId
      if (await loginStaff.full(lockedKey)) throw new HttpError(429, 'Too many wrong PINs. Wait 5 minutes.')
      if (!/^\d{4,8}$/.test(pin) || !s || !s.active || !checkPin(pin, s.pinHash)) {
        await loginStaff.hit(lockedKey)
        throw new HttpError(401, 'That PIN did not match. Try again.')
      }
      if (s.totpSecret) {      // owner with two-step login: the PIN alone is not enough
        if (!code) throw new HttpError(401, 'Enter the 6-digit code from your authenticator app')
        const step = checkTotp(s.totpSecret, code, s.totpLastStep || 0)
        if (step === null) { await loginStaff.hit(lockedKey); throw new HttpError(401, 'That code did not match. Use the newest code in the app.') }
        await engine.updateStaff(s.id, x => { x.totpLastStep = step })
      }
      await loginStaff.clear(lockedKey)
      const token = newToken()
      await repo.putSession({ id: tokenId(token), staffId: s.id, exp: Date.now() + cfg.sessionHours * 3600e3 })
      await engine.audit(s.id, 'login', s.name)
      return ok({ staff: me(s) }, { 'set-cookie': setCookie(req, token, cfg.sessionHours * 3600) })
    }
    if (p === '/api/2fa/setup' && m === 'POST') {
      const w = await need(req, true)
      const secret = setupSecrets(w.staff.id)[0]
      return ok({ secret, uri: totpUri(secret, `${engine.state.shop.name} - ${w.staff.name}`) })
    }
    if (p === '/api/2fa/enable' && m === 'POST') {
      const w = await need(req, true)
      const b = await readJSON(req, 1e3) as { code?: unknown }
      if (!(await approveLim.hit('2fa:' + w.staff.id))) throw new HttpError(429, 'Too many tries. Wait 5 minutes.')
      const code = typeof b?.code === 'string' ? b.code : ''
      let secret = '', step: number | null = null
      for (const sec of setupSecrets(w.staff.id)) { step = checkTotp(sec, code); if (step !== null) { secret = sec; break } }
      if (step === null) throw new HttpError(400, 'That code did not match. Check the phone clock and try the newest code.')
      await engine.updateStaff(w.staff.id, x => { x.totpSecret = secret; x.totpLastStep = step })
      await engine.audit(w.staff.id, 'security', 'Two-step login turned on')
      return ok({ ok: true })
    }
    if (p === '/api/2fa/disable' && m === 'POST') {
      const w = await need(req, true)
      const b = await readJSON(req, 1e3) as { code?: unknown }
      if (!w.staff.totpSecret) return ok({ ok: true })
      if (!(await approveLim.hit('2fa:' + w.staff.id))) throw new HttpError(429, 'Too many tries. Wait 5 minutes.')
      if (checkTotp(w.staff.totpSecret, typeof b?.code === 'string' ? b.code : '', w.staff.totpLastStep || 0) === null) throw new HttpError(400, 'That code did not match')
      await engine.updateStaff(w.staff.id, x => { delete x.totpSecret; delete x.totpLastStep })
      await engine.audit(w.staff.id, 'security', 'Two-step login turned off')
      return ok({ ok: true })
    }
    if (p === '/api/logout' && m === 'POST') {
      const w = await who(req); if (w) await repo.deleteSession(w.sid)
      return ok({ ok: true }, { 'set-cookie': setCookie(req, '', 0) })
    }
    if (p === '/api/me' && m === 'GET') { const w = await need(req); return ok({ staff: me(w.staff) }) }
    if (p === '/api/changes' && m === 'GET') {
      await need(req)
      const after = url.searchParams.get('after')
      return ok(engine.changesSince(Number(url.searchParams.get('since') || 0), after === null ? undefined : after))
    }
    if (p === '/api/ops' && m === 'POST') {
      const w = await need(req)
      const b = await readJSON(req, 4e6) as { ops?: unknown; since?: unknown }
      if (!Array.isArray(b?.ops) || b.ops.length > 200) throw new HttpError(400, 'Send up to 200 changes at a time')
      const results = await engine.submit(w.staff.id, b.ops)
      return ok({ results, ...engine.changesSince(Number(b.since || 0)) })
    }
    if (p === '/api/approve' && m === 'POST') {
      const w = await need(req)
      const b = await readJSON(req, 2e3) as { billId?: unknown; pin?: unknown }
      if (typeof b?.billId !== 'string' || typeof b.pin !== 'string') throw new HttpError(400, 'billId and pin needed')
      if (!(await approveLim.hit(w.staff.id))) throw new HttpError(429, 'Too many tries. Wait 5 minutes.')
      const owner = engine.state.staff.find(s => s.active && s.role === 'owner' && checkPin(b.pin as string, s.pinHash))
      if (!owner) throw new HttpError(401, 'Wrong owner PIN')
      return ok({ token: engine.approve(b.billId, owner.id), ownerId: owner.id })
    }
    if (p === '/api/backups' && m === 'GET') { await need(req, true); return ok(await repo.listBackups()) }
    if (p === '/api/backups' && m === 'POST') { const w = await need(req, true); const row = await engine.backup('manual'); await engine.audit(w.staff.id, 'backup', 'Backup on central database'); return ok(row) }
    if (p.startsWith('/api/backups/') && m === 'GET') {
      await need(req, true)
      const name = decodeURIComponent(p.slice('/api/backups/'.length))
      if (!/^[\w.-]{1,120}$/.test(name)) throw new HttpError(400, 'Bad name')
      const json = await engine.readBackup(name); if (!json) throw new HttpError(404, 'No such backup')
      return download(req, res, json, name)
    }
    if (p === '/api/export' && m === 'GET') {
      await need(req, true)
      return download(req, res, JSON.stringify(engine.exportDB()), `narayana-central-${new Date().toISOString().slice(0, 10)}.json`)
    }
    if (p === '/api/restore' && m === 'POST') {
      const w = await need(req, true)
      const b = await readJSON(req, 100e6) as { data?: unknown }
      await engine.restore(b?.data, w.staff.id)
      return ok({ ok: true, version: engine.version })
    }
    throw new HttpError(404, 'Not found')
  }

  function serveFile(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { error: 'Method not allowed' })
    const root = cfg.distDir
    let rel: string; try { rel = decodeURIComponent(url.pathname) } catch { return send(req, res, 400, { error: 'Bad path' }) }
    let file = path.normalize(path.join(root, rel))
    if (!file.startsWith(root + path.sep) && file !== root) return send(req, res, 403, { error: 'Forbidden' })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')   // the app handles its own screens
    if (!fs.existsSync(file)) return send(req, res, 404, { error: 'App not built yet. Run: npm run build' })
    const hashed = /[\\/]assets[\\/]/.test(file)
    const extra = path.basename(file) === 'sw.js' ? { 'service-worker-allowed': '/' } : {}
    res.writeHead(200, { ...SEC, ...(isHttps(req) ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}), 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache', ...extra })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  return async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
    let url: URL
    try { url = new URL(req.url || '/', 'http://local') } catch { return send(req, res, 400, { error: 'Bad URL' }) }
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!general.hit(ipOf(req))) throw new HttpError(429, 'Slow down')
        if (repo.shared) await engine.sync()      // see what other server copies saved
        return await api(req, res, url)
      }
      return serveFile(req, res, url)
    } catch (e) {
      if (e instanceof HttpError) return send(req, res, e.status, { error: e.message })
      if (e instanceof OpError) return send(req, res, 400, { error: e.message })
      console.error(new Date().toISOString(), req.method, url.pathname, e)
      if (!res.headersSent) send(req, res, 500, { error: 'Server error' })
    }
  }
}
