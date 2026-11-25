/* Clean-up and the scheduled backup. Runs every 15 minutes on a shop PC / always-on server (index.ts),
   or once a day from the hosting platform's scheduler (/api/cron on Vercel). */
import type { Config } from './config'
import type { Engine } from './engine'
import type { Repo } from './repo'

/** `slackMs`: a backup counts as due this much early, so a daily scheduler that fires a few seconds short of 24 hours still makes one */
export async function maintenance(repo: Repo, engine: Engine, cfg: Config, slackMs = 0): Promise<{ backup: string | null }> {
  await repo.purge(Date.now())
  if (cfg.backupHours > 0) {
    const last = (await repo.listBackups())[0]
    if (!last || Date.now() - Date.parse(last.at) >= cfg.backupHours * 3600e3 - slackMs) return { backup: (await engine.backup('scheduled')).name }
  }
  return { backup: null }
}
