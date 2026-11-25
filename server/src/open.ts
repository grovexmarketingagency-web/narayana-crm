/* Opens the central database on top of a storage. Shared by the always-on server (index.ts) and the Vercel function (serverless.ts). */
import type { Config } from './config'
import { Engine, checkBackup } from './engine'
import type { Repo } from './repo'
import { buildSeed, blankDB } from '../../src/lib/seed'

export async function openEngine(cfg: Config, repo: Repo): Promise<Engine> {
  const engine = await Engine.open(repo, () => {
    const old = repo.kind === 'sqlite' ? (repo as unknown as { legacyData(): unknown | null }).legacyData() : null
    if (old) { console.log('New database: importing data saved by the previous server version'); return checkBackup(old) }
    if (cfg.seedDemo) { console.log('New database: loading demo data (demo PINs 1234 / 2222 / 1111 / 0000)'); return buildSeed() }
    if (cfg.ownerPin) { console.log(`New database: shop "${cfg.shopName}" with owner "${cfg.ownerName}"`); return blankDB(cfg.shopName, cfg.ownerName, cfg.ownerPin) }
    throw new Error('This is a new database. Set OWNER_PIN (the owner\'s first PIN) or SEED_DEMO=1 and start again.')
  }, cfg.keepBackups)
  engine.copyDir = cfg.backupCopyDir
  return engine
}
