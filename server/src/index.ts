/* Narayana Textiles central database server.
   Shop PC:  npm run server            (SQLite file in server/data, nothing else to install)
   Cloud:    MONGODB_URI=... npm start (MongoDB Atlas; see render.yaml)
   Every billing counter opens http://<server-address>:4545 in Chrome or Edge. */
process.env.TZ ||= 'Asia/Kolkata'     // offers, "today" and day-wise reports follow shop time
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from './config'
import { SqliteRepo } from './repo-sqlite'
import { MongoRepo } from './repo-mongo'
import { Engine, checkBackup } from './engine'
import { createApp } from './app'
import type { Repo } from './repo'
import { buildSeed, blankDB } from '../../src/lib/seed'

async function main() {
  const cfg = loadConfig()
  const repo: Repo = cfg.mongoUri ? new MongoRepo(cfg.mongoUri, cfg.mongoDb) : new SqliteRepo(path.join(cfg.dataDir, 'narayana.sqlite'))
  const engine = await Engine.open(repo, () => {
    const old = repo instanceof SqliteRepo ? repo.legacyData() : null
    if (old) { console.log('New database: importing data saved by the previous server version'); return checkBackup(old) }
    if (cfg.seedDemo) { console.log('New database: loading demo data (demo PINs 1234 / 2222 / 1111 / 0000)'); return buildSeed() }
    if (cfg.ownerPin) { console.log(`New database: shop "${cfg.shopName}" with owner "${cfg.ownerName}"`); return blankDB(cfg.shopName, cfg.ownerName, cfg.ownerPin) }
    throw new Error('This is a new database. Set OWNER_PIN (the owner\'s first PIN) or SEED_DEMO=1 and start again.')
  }, cfg.keepBackups)

  const server = http.createServer(createApp({ cfg, repo, engine }))
  server.requestTimeout = 120e3; server.headersTimeout = 20e3; server.keepAliveTimeout = 10e3

  // scheduled backups and clean-up
  const tick = async () => {
    try {
      await repo.purge(Date.now())
      if (cfg.backupHours > 0) {
        const last = (await repo.listBackups())[0]
        if (!last || Date.now() - Date.parse(last.at) >= cfg.backupHours * 3600e3) console.log('scheduled backup', (await engine.backup('scheduled')).name)
      }
    } catch (e) { console.error('scheduled backup failed', e) }
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
