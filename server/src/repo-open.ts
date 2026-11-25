/* Picks the storage the settings ask for. Only the always-on server uses this; the Vercel function ships PostgreSQL alone. */
import path from 'node:path'
import type { Config } from './config'
import type { Repo } from './repo'

export async function openRepo(cfg: Config): Promise<Repo> {
  if (cfg.databaseUrl) { const { PostgresRepo } = await import('./repo-postgres'); return new PostgresRepo(cfg.databaseUrl, { ssl: cfg.databaseSsl, ca: cfg.databaseCa }) }
  if (cfg.mongoUri) { const { MongoRepo } = await import('./repo-mongo'); return new MongoRepo(cfg.mongoUri, cfg.mongoDb) }
  const { SqliteRepo } = await import('./repo-sqlite'); return new SqliteRepo(path.join(cfg.dataDir, 'narayana.sqlite'))
}

