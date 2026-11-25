/* Same checks against real PostgreSQL, plus two server copies sharing one database (like two Vercel instances).
   Runs when POSTGRES_URL is set (a server address that may create databases; CI starts one). */
import { describe, it, expect } from 'vitest'
import pg from 'pg'
import { PostgresRepo, sslFor } from '../server/src/repo-postgres'
import { Engine } from '../server/src/engine'
import { buildSeed } from '../src/lib/seed'
import { startServer, counter, op, cashBill } from './helpers'

const admin = process.env.POSTGRES_URL
const withDb = (url: string, db: string) => { const u = new URL(url); u.pathname = '/' + db; return u.toString() }

describe('ssl setting', () => {
  it('is off for this computer and on for remote hosts', () => {
    expect(sslFor('postgres://u@localhost/db', undefined, undefined)).toBe(false)
    expect(sslFor('postgres://u@/db?host=/tmp', undefined, undefined)).toBe(false)
    expect(sslFor('postgres://u:p@db.abc.supabase.co:5432/postgres', undefined, undefined)).toEqual({ rejectUnauthorized: false })
    expect(sslFor('postgres://u:p@db.abc.supabase.co:5432/postgres', undefined, 'CERT')).toEqual({ ca: 'CERT', rejectUnauthorized: true })
    expect(sslFor('postgres://u:p@db.abc.supabase.co/postgres', 'off', undefined)).toBe(false)
  })
})

describe.skipIf(!admin)('PostgreSQL storage', () => {
  async function fresh() {
    const name = 'narayana_t_' + Date.now() + '_' + Math.floor(Math.random() * 1e6)
    const c = new pg.Client({ connectionString: admin }); await c.connect(); await c.query(`CREATE DATABASE ${name}`); await c.end()
    return { url: withDb(admin!, name), drop: async () => { const d = new pg.Client({ connectionString: admin }); await d.connect(); await d.query(`DROP DATABASE ${name} WITH (FORCE)`); await d.end() } }
  }

  it('saves bills once, survives a restart, restores backups', async () => {
    const db = await fresh()
    const a = await startServer({ repo: new PostgresRepo(db.url) })
    const c = counter(a.url); await c.login('s3', '1111')
    const o = op('checkout', cashBill(a.engine.state, 'pg1'))
    expect((await c.ops([o])).body.results[0].ok).toBe(true)
    expect((await c.ops([o])).body.results[0].dup).toBe(true)
    const snapshot = JSON.parse(JSON.stringify(a.engine.state))
    await a.close()
    const repo = new PostgresRepo(db.url)
    const e = await Engine.open(repo, () => { throw new Error('should not seed again') })
    expect(JSON.parse(JSON.stringify(e.state))).toEqual(snapshot)
    const b = await e.backup('test'); expect((await repo.listBackups())[0].name).toBe(b.name)
    await e.restore(JSON.parse((await e.readBackup(b.name))!), 's1')
    expect(e.state.bills.some(x => x.id === 'pg1')).toBe(true)
    await repo.close(); await db.drop()
  })

  it('two server copies share one database: no double saving, each sees the other\'s bills', async () => {
    const db = await fresh()
    const a = await startServer({ repo: new PostgresRepo(db.url) })
    const b = await startServer({ repo: new PostgresRepo(db.url), initial: () => { throw new Error('second copy must not seed') } })
    const ca = counter(a.url), cb = counter(b.url)
    await ca.login('s3', '1111'); await cb.login('s2', '2222')      // sessions are in the database, so each copy knows the other's logins
    expect((await cb.call('/me')).status).toBe(200)
    const v = a.engine.state.variants[0]
    const stock0 = v.stock
    // 20 bills at the same moment, spread over both copies, plus the same change sent to both copies twice
    const bills = Array.from({ length: 20 }, (_, i) => op('checkout', cashBill(a.engine.state, 'race' + i, v.id, 1)))
    const dup = bills[0]
    const results = await Promise.all([
      ...bills.map((o, i) => (i % 2 ? cb : ca).ops([o])),
      ca.ops([dup]), cb.ops([dup]),
    ])
    expect(results.every(r => r.status === 200)).toBe(true)
    await a.engine.sync(); await b.engine.sync()
    for (const e of [a.engine, b.engine]) {
      expect(e.state.bills.filter(x => x.id.startsWith('race')).length).toBe(20)
      expect(e.state.variants.find(x => x.id === v.id)!.stock).toBe(stock0 - 20)     // 20 sold, the repeated one counted once
    }
    expect(a.engine.version).toBe(b.engine.version)
    // bill numbers are never repeated across copies
    const numbers = a.engine.state.bills.filter(x => x.id.startsWith('race')).map(x => x.no)
    expect(new Set(numbers).size).toBe(20)
    // a change on one copy reaches a counter on the other with a normal sync
    const pull = await cb.call('/changes?since=0'); expect(pull.body.changes.length).toBeGreaterThan(0)
    // a restore on one copy resets the other
    const bk = await a.engine.backup('t')
    await a.engine.restore(JSON.parse((await a.engine.readBackup(bk.name))!), 's1')
    await b.engine.sync()
    expect(b.engine.head.resetAt).toBe(a.engine.head.resetAt)
    expect(b.engine.state.bills.length).toBe(a.engine.state.bills.length)
    await a.close(); await b.close(); await db.drop()
  })

  it('two copies starting on an empty database create the data only once', async () => {
    const db = await fresh()
    const r1 = new PostgresRepo(db.url), r2 = new PostgresRepo(db.url)
    const [e1, e2] = await Promise.all([Engine.open(r1, buildSeed), Engine.open(r2, buildSeed)])
    expect(e1.head.serverId).toBe(e2.head.serverId)
    expect(e1.head.secret).toBe(e2.head.secret)
    expect(e1.state.staff.length).toBe(e2.state.staff.length)
    await r1.close(); await r2.close(); await db.drop()
  })

  it('wrong-PIN limits are shared between copies', async () => {
    const db = await fresh()
    const a = await startServer({ repo: new PostgresRepo(db.url) })
    const b = await startServer({ repo: new PostgresRepo(db.url) })
    for (let i = 0; i < 3; i++) { await counter(a.url).login('s3', '9999'); await counter(b.url).login('s3', '9999') }
    const r = await counter(a.url).login('s3', '1111')      // right PIN, but 6 wrong tries were made across both copies
    expect(r.status).toBe(429)
    await a.close(); await b.close(); await db.drop()
  })

  it('big data comes in pages and cron makes a backup', async () => {
    const db = await fresh()
    const a = await startServer({ repo: new PostgresRepo(db.url), env: { CRON_SECRET: 'x'.repeat(20) } })
    const c = counter(a.url); await c.login('s1', '1234')
    const total = a.engine.changesSince(0).changes.length
    const p1 = a.engine.changesSince(0, undefined, 2000)
    expect(p1.full && p1.more).toBe(true)
    const got = [...p1.changes]; let cur = p1
    while (cur.more) { cur = a.engine.changesSince(0, cur.next!, 2000); got.push(...cur.changes) }
    expect(got.length).toBe(total); expect(new Set(got.map(x => x.c + '/' + x.i)).size).toBe(total)
    expect((await c.call('/cron')).status).toBe(404)
    const cr = await fetch(a.url + '/api/cron', { headers: { authorization: 'Bearer ' + 'x'.repeat(20) } })
    expect(cr.status).toBe(200); expect((await cr.json()).backup).toMatch(/narayana-backup/)
    expect((await a.repo.listBackups()).length).toBe(1)
    await a.close(); await db.drop()
  })
})
