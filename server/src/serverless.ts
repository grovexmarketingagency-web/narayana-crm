/* The server as a Vercel function. Each warm function instance keeps the database in memory and checks for other
   instances' changes before every request (see Engine.sync); every write takes the database lock (see PostgresRepo.locked). */
process.env.TZ ||= 'Asia/Kolkata'
import type http from 'node:http'
import { loadConfig } from './config'
import { PostgresRepo } from './repo-postgres'
import { openEngine } from './open'
import { createApp } from './app'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
let ready: Promise<Handler> | null = null

function start(): Promise<Handler> {
  const cfg = loadConfig({ ...process.env, TRUST_PROXY: process.env.TRUST_PROXY ?? '1', DIST_DIR: process.env.DIST_DIR ?? '/nonexistent' })
  if (!cfg.databaseUrl) throw new Error('DATABASE_URL is not set')
  const repo = new PostgresRepo(cfg.databaseUrl, { ssl: cfg.databaseSsl, ca: cfg.databaseCa })
  return openEngine(cfg, repo).then(engine => createApp({ cfg, repo, engine }) as Handler)
}

export default async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    // Vercel reads the request body for us the first time `req.body` is touched; hand it on to the app
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const b = (req as { body?: unknown }).body
      if (b !== undefined) (req as { parsedBody?: unknown }).parsedBody = Buffer.isBuffer(b) ? (() => { try { return JSON.parse(b.toString('utf8') || 'null') } catch { return null } })() : typeof b === 'string' ? (() => { try { return JSON.parse(b || 'null') } catch { return null } })() : b
    }
    ready ??= start()
    ;(await ready)(req, res)
  } catch (e) {
    ready = null       // try again on the next request (for example when the database was briefly unreachable)
    console.error('could not start', e instanceof Error ? e.message : e)
    if (!res.headersSent) { res.statusCode = 503; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store') }
    res.end(JSON.stringify({ error: 'The server could not reach its database. Try again in a moment.' }))
  }
}
