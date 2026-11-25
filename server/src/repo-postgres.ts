/* PostgreSQL storage (Supabase, or any PostgreSQL). Made for serverless hosting such as Vercel, where several
   copies of the server can run at the same moment. Every change batch runs inside one transaction that first takes a
   database-wide advisory lock, so two copies can never save at the same time and nothing is half saved.
   The lock is a transaction-level one, which also works through Supabase's connection pooler. */
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import type { Change } from '../../src/lib/sync'
import { OPLOG_DAYS, type BackupRow, type Commit, type Head, type OpRow, type Repo, type SessionRow } from './repo'

type Row = Record<string, unknown>
type Q = { query: (text: string, params?: unknown[]) => Promise<pg.QueryResult<Row>> }
const LOCK_ID = 7_243_100_451   // any fixed number; every copy of this app uses the same one
const CHUNK = 500

/** SSL on for every remote host. DATABASE_CA (the provider's certificate) turns on full certificate checking. */
export function sslFor(url: string, mode: string | undefined, ca: string | undefined): pg.ClientConfig['ssl'] {
  if (mode === 'off') return false
  let host = ''; try { host = new URL(url).hostname } catch { /* checked later by the driver */ }
  const q = (() => { try { return new URL(url).searchParams.get('host') || '' } catch { return '' } })()
  if (mode !== 'on' && (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || q.startsWith('/'))) return false
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }
}

export class PostgresRepo implements Repo {
  readonly kind = 'postgres' as const
  readonly shared = true
  private pool: pg.Pool
  private held = new AsyncLocalStorage<pg.PoolClient>()
  constructor(url: string, opts: { ssl?: string; ca?: string; max?: number } = {}) {
    // sslmode in the address would override our own SSL setting, so it is removed
    let clean = url; try { const u = new URL(url); u.searchParams.delete('sslmode'); clean = u.toString() } catch { /* the driver reports bad addresses */ }
    this.pool = new pg.Pool({ connectionString: clean, ssl: sslFor(url, opts.ssl, opts.ca), max: opts.max ?? 3, idleTimeoutMillis: 10e3, connectionTimeoutMillis: 10e3 })
    this.pool.on('error', e => console.error('database connection error', e.message))
  }
  /** inside `locked` every query uses that one transaction */
  private get q(): Q { return this.held.getStore() ?? this.pool }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    if (this.held.getStore()) return fn()
    const cl = await this.pool.connect()
    try {
      await cl.query('BEGIN')
      await cl.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID])
      const r = await this.held.run(cl, fn)
      await cl.query('COMMIT')
      return r
    } catch (e) { await cl.query('ROLLBACK').catch(() => undefined); throw e }
    finally { cl.release() }
  }
  /** one transaction: joins the lock's transaction when there is one */
  private async tx(fn: (q: Q) => Promise<void>) {
    const h = this.held.getStore(); if (h) return fn(h)
    const cl = await this.pool.connect()
    try { await cl.query('BEGIN'); await fn(cl); await cl.query('COMMIT') }
    catch (e) { await cl.query('ROLLBACK').catch(() => undefined); throw e }
    finally { cl.release() }
  }
  async init() {
    await this.locked(async () => {
      await this.q.query(`
        CREATE TABLE IF NOT EXISTS head (id INTEGER PRIMARY KEY CHECK (id = 1), version BIGINT NOT NULL, seq BIGINT NOT NULL, reset_at BIGINT NOT NULL, secret TEXT NOT NULL, server_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS records (k TEXT PRIMARY KEY, c TEXT NOT NULL, i TEXT NOT NULL, v BIGINT NOT NULL, s BIGINT NOT NULL, d TEXT);
        CREATE INDEX IF NOT EXISTS records_v ON records (v);
        CREATE TABLE IF NOT EXISTS oplog (id TEXT PRIMARY KEY, v BIGINT NOT NULL, ok BOOLEAN NOT NULL, error TEXT, staff_id TEXT NOT NULL, name TEXT NOT NULL, at TEXT NOT NULL, saved BIGINT NOT NULL);
        CREATE INDEX IF NOT EXISTS oplog_saved ON oplog (saved);
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, exp BIGINT NOT NULL);
        CREATE INDEX IF NOT EXISTS sessions_staff ON sessions (staff_id);
        CREATE TABLE IF NOT EXISTS backups (name TEXT PRIMARY KEY, at TEXT NOT NULL, v BIGINT NOT NULL, size BIGINT NOT NULL, reason TEXT NOT NULL, gz BYTEA NOT NULL);
        CREATE TABLE IF NOT EXISTS rate_hits (k TEXT NOT NULL, at BIGINT NOT NULL);
        CREATE INDEX IF NOT EXISTS rate_hits_k ON rate_hits (k, at);
        ALTER TABLE head ENABLE ROW LEVEL SECURITY; ALTER TABLE records ENABLE ROW LEVEL SECURITY; ALTER TABLE oplog ENABLE ROW LEVEL SECURITY;
        ALTER TABLE sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE backups ENABLE ROW LEVEL SECURITY; ALTER TABLE rate_hits ENABLE ROW LEVEL SECURITY;`)
    })
  }
  async head(): Promise<Head | null> {
    const r = (await this.q.query('SELECT * FROM head WHERE id = 1')).rows[0]
    return r ? { version: Number(r.version), seq: Number(r.seq), resetAt: Number(r.reset_at), secret: String(r.secret), serverId: String(r.server_id) } : null
  }
  async createHead(h: Head) {
    await this.q.query('INSERT INTO head (id, version, seq, reset_at, secret, server_id) VALUES (1, $1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [h.version, h.seq, h.resetAt, h.secret, h.serverId])
  }
  private toChange = (r: Row): Change => ({ c: String(r.c), i: String(r.i), v: Number(r.v), s: Number(r.s), d: r.d === null ? null : JSON.parse(String(r.d)) })
  async records(): Promise<Change[]> { return (await this.q.query('SELECT c, i, v, s, d FROM records')).rows.map(this.toChange) }
  async recordsSince(v: number): Promise<Change[]> { return (await this.q.query('SELECT c, i, v, s, d FROM records WHERE v > $1', [v])).rows.map(this.toChange) }
  private async write(q: Q, c: Commit) {
    for (let n = 0; n < c.records.length; n += CHUNK) {
      const part = c.records.slice(n, n + CHUNK)
      await q.query(
        `INSERT INTO records (k, c, i, v, s, d) SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::bigint[], $5::bigint[], $6::text[])
         ON CONFLICT (k) DO UPDATE SET v = excluded.v, s = excluded.s, d = excluded.d`,
        [part.map(r => r.c + '/' + r.i), part.map(r => r.c), part.map(r => r.i), part.map(r => r.v), part.map(r => r.s), part.map(r => r.d === null ? null : JSON.stringify(r.d))])
    }
    if (c.ops.length) {
      const now = Date.now()
      await q.query(
        `INSERT INTO oplog (id, v, ok, error, staff_id, name, at, saved) SELECT * FROM unnest($1::text[], $2::bigint[], $3::boolean[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[])
         ON CONFLICT (id) DO NOTHING`,
        [c.ops.map(o => o.id), c.ops.map(o => o.v), c.ops.map(o => o.ok), c.ops.map(o => o.error ?? null), c.ops.map(o => o.staffId), c.ops.map(o => o.name), c.ops.map(o => o.at), c.ops.map(() => now)])
    }
    await q.query('UPDATE head SET version = $1, seq = $2, reset_at = $3 WHERE id = 1', [c.head.version, c.head.seq, c.head.resetAt])
  }
  async commit(c: Commit) { await this.tx(q => this.write(q, c)) }
  async replaceAll(c: Commit) { await this.tx(async q => { await q.query('DELETE FROM records'); await this.write(q, c) }) }
  async findOp(id: string): Promise<OpRow | null> {
    const r = (await this.q.query('SELECT * FROM oplog WHERE id = $1', [id])).rows[0]
    return r ? { id: String(r.id), v: Number(r.v), ok: !!r.ok, error: r.error ? String(r.error) : undefined, staffId: String(r.staff_id), name: String(r.name), at: String(r.at) } : null
  }
  async putSession(s: SessionRow) {
    await this.q.query('INSERT INTO sessions (id, staff_id, exp) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET staff_id = excluded.staff_id, exp = excluded.exp', [s.id, s.staffId, s.exp])
  }
  async getSession(id: string): Promise<SessionRow | null> {
    const r = (await this.q.query('SELECT * FROM sessions WHERE id = $1', [id])).rows[0]
    return r ? { id: String(r.id), staffId: String(r.staff_id), exp: Number(r.exp) } : null
  }
  async deleteSession(id: string) { await this.q.query('DELETE FROM sessions WHERE id = $1', [id]) }
  async deleteSessionsFor(staffId: string) { await this.q.query('DELETE FROM sessions WHERE staff_id = $1', [staffId]) }
  async putBackup(b: BackupRow, gz: Buffer, keep: number) {
    await this.tx(async q => {
      await q.query('INSERT INTO backups (name, at, v, size, reason, gz) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO UPDATE SET at = excluded.at, v = excluded.v, size = excluded.size, reason = excluded.reason, gz = excluded.gz', [b.name, b.at, b.v, b.size, b.reason, gz])
      await q.query('DELETE FROM backups WHERE name NOT IN (SELECT name FROM backups ORDER BY at DESC LIMIT $1)', [keep])
    })
  }
  async listBackups(): Promise<BackupRow[]> {
    return (await this.q.query('SELECT name, at, v, size, reason FROM backups ORDER BY at DESC')).rows.map(r => ({ name: String(r.name), at: String(r.at), v: Number(r.v), size: Number(r.size), reason: String(r.reason) }))
  }
  async getBackup(name: string) { const r = (await this.q.query('SELECT gz FROM backups WHERE name = $1', [name])).rows[0]; return r ? (r.gz as Buffer) : null }
  async purge(now: number) {
    await this.q.query('DELETE FROM sessions WHERE exp < $1', [now])
    await this.q.query('DELETE FROM oplog WHERE saved < $1', [now - OPLOG_DAYS * 86400e3])
    await this.q.query('DELETE FROM rate_hits WHERE at < $1', [now - 86400e3])
  }
  async rateHit(key: string, windowMs: number, now: number) {
    await this.q.query('DELETE FROM rate_hits WHERE k = $1 AND at <= $2', [key, now - windowMs])
    await this.q.query('INSERT INTO rate_hits (k, at) VALUES ($1, $2)', [key, now])
    return Number((await this.q.query('SELECT count(*) AS n FROM rate_hits WHERE k = $1', [key])).rows[0].n)
  }
  async rateCount(key: string, windowMs: number, now: number) {
    return Number((await this.q.query('SELECT count(*) AS n FROM rate_hits WHERE k = $1 AND at > $2', [key, now - windowMs])).rows[0].n)
  }
  async rateClear(key: string) { await this.q.query('DELETE FROM rate_hits WHERE k = $1', [key]) }
  async ping() { try { await this.pool.query('SELECT 1'); return true } catch { return false } }
  async close() { await this.pool.end() }
}
