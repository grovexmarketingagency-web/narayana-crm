import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { SqliteRepo } from '../server/src/repo-sqlite'
import { Engine } from '../server/src/engine'
import { createApp } from '../server/src/app'
import { loadConfig } from '../server/src/config'
import type { Repo } from '../server/src/repo'
import { buildSeed } from '../src/lib/seed'
import type { DB } from '../src/lib/types'
import { computeDraft } from '../src/lib/calc'

export async function startServer(opts: { repo?: Repo; initial?: () => DB; env?: Record<string, string> } = {}) {
  const repo = opts.repo ?? new SqliteRepo(':memory:')
  const engine = await Engine.open(repo, opts.initial ?? buildSeed)
  const cfg = loadConfig({ NODE_ENV: 'test', DIST_DIR: '/nonexistent', LOGIN_TRIES_PER_15MIN: '1000', ...opts.env } as NodeJS.ProcessEnv)
  const server = http.createServer(createApp({ cfg, repo, engine }))
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const close = async () => { await new Promise(ok => server.close(ok)); await repo.close() }
  return { url, engine, repo, close }
}

/** a counter: keeps its own session cookie like a browser would */
export function counter(url: string) {
  let cookie = ''
  async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(url + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-narayana': '1', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0]
    const text = await r.text()
    let json: any = null; try { json = JSON.parse(text) } catch { json = text }
    return { status: r.status, body: json, headers: r.headers }
  }
  return {
    call,
    login: (staffId: string, pin: string) => call('/login', { staffId, pin }),
    ops: (ops: unknown[], since = 0) => call('/ops', { ops, since }),
  }
}

let n = 0
export const op = (name: string, args: unknown, at = new Date().toISOString()) => ({ id: `t${Date.now().toString(36)}x${n++}`, name, args, at })

/** a simple cash bill for one item, priced the way the app would */
export function cashBill(db: DB, billId: string, variantId = db.variants[0].id, qty = 1) {
  const draft = { id: billId, label: '', lines: [{ variantId, qty, discount: 0 }], billDiscount: { type: 'pct' as const, value: 0 }, couponCode: '', held: false, createdAt: '' }
  const total = computeDraft(db, draft).total
  return { billId, lines: draft.lines, billDiscount: draft.billDiscount, couponCode: '', payments: [{ mode: 'cash', amount: total }] }
}
