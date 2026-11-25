/* Used by scripts/restore-postgres.mjs: restores a backup straight into the cloud database. */
import { PostgresRepo } from './repo-postgres'
import { Engine } from './engine'
import { loadConfig } from './config'

export async function restoreInto(url: string, data: unknown): Promise<number> {
  const cfg = loadConfig({ ...process.env, DATABASE_URL: url })
  const repo = new PostgresRepo(url, { ssl: cfg.databaseSsl, ca: cfg.databaseCa })
  try {
    const e = await Engine.open(repo, () => { throw new Error('This database was never set up. Open the website once first (set OWNER_PIN), then restore.') }, cfg.keepBackups)
    await e.restore(data, e.state.staff.find(s => s.role === 'owner')?.id ?? 'restore-script')
    return e.version
  } finally { await repo.close() }
}
