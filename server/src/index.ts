/* Narayana Textiles central database server.
   Shop PC:  npm run server            (SQLite file in server/data, nothing else to install)
   Cloud:    MONGODB_URI=... npm start (MongoDB Atlas; see render.yaml)
   Every billing counter opens http://<server-address>:4545 in Chrome or Edge. */
process.env.TZ ||= 'Asia/Kolkata'     // offers, "today" and day-wise reports follow shop time
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from './config'
import { openEngine } from './open'
import { openRepo } from './repo-open'
import { createApp } from './app'
import { maintenance } from './maintenance'
import type { Repo } from './repo'

async function main() {
  const cfg = loadConfig()
  const repo: Repo = await openRepo(cfg)
  const engine = await openEngine(cfg, repo)
  if (cfg.backupCopyDir) console.log('Every backup is also copied to', cfg.backupCopyDir)

  const server = http.createServer(createApp({ cfg, repo, engine }))
  server.requestTimeout = 120e3; server.headersTimeout = 20e3; server.keepAliveTimeout = 10e3

  // scheduled backups and clean-up
  const tick = async () => {
    try { const r = await maintenance(repo, engine, cfg); if (r.backup) console.log('scheduled backup', r.backup) }
    catch (e) { console.error('scheduled backup failed', e) }
  }
  const timer = setInterval(tick, 15 * 60e3); void tick()

  server.listen(cfg.port, cfg.host, () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i!.address)
    console.log(`Narayana central database (${repo.kind}) on port ${cfg.port}, data version ${engine.version}`)
    for (const ip of ips) console.log(`  counters open: http://${ip}:${cfg.port}`)
  })

  let closing = false
  const stop = (sig: string) => {
    if (closing) return; closing = true
    console.log(sig, 'received: finishing open requests')
    clearInterval(timer)
    server.close(async () => { await engine.exclusive(async () => undefined); await repo.close(); process.exit(0) })
    setTimeout(() => process.exit(1), 10e3).unref()
  }
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'))
}

process.on('unhandledRejection', e => console.error('unhandled rejection', e))
main().catch(e => { console.error('Could not start:', e instanceof Error ? e.message : e); process.exit(1) })
